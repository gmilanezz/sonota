import { spawn } from 'node:child_process';
import { mkdir,rm,readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { id,now,transaction,audit } from './db.js';
import { owned } from './entities.js';
import { assert } from './errors.js';
function runPython(config,args,timeout,onChild) {
  return new Promise((resolve,reject)=>{
    const child=spawn(config.python,[path.join(ROOT,'audio/worker.py'),...args],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    onChild?.(child);let out='',err='',timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
    child.stdout.on('data',b=>{out=(out+b).slice(-32000);});child.stderr.on('data',b=>{err=(err+b).slice(-32000);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(out);else reject(new Error(timedOut?'Tempo máximo de processamento excedido.':err||'Processamento interrompido.'));});
  });
}
export function createWorker(db,config,files) {
  let stopped=false,pending=null,child=null,current=null;
  let capabilities={analysis:false,midi:false,partitura:false,stems:false,reason:'Processamento de áudio desativado. Veja audio/README.md.'};
  const ready=(async()=>{
    if(config.audioEnabled){try{capabilities=JSON.parse(await runPython(config,['--capabilities'],10000));}catch{capabilities.reason='Python ou dependências de áudio indisponíveis. Veja audio/README.md.';}}
    return capabilities;
  })();
  db.prepare("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE status='running'").run('O servidor foi reiniciado durante o processamento. Inicie um novo trabalho.',now());
  function enqueue(userId,arrangementId,type) {
    assert(capabilities[type],503,'AUDIO_UNAVAILABLE',capabilities.reason||'Instale as dependências do modelo de áudio. Veja audio/README.md.');
    const arr=owned(db,'arrangements',arrangementId,userId);
    const existing=db.prepare("SELECT id FROM jobs WHERE user_id=? AND arrangement_id=? AND source_file_id=? AND type=? AND status IN ('queued','running')").get(userId,arrangementId,arr.file_id,type);
    if(existing)return existing.id;
    const count=db.prepare("SELECT COUNT(*) n FROM jobs WHERE user_id=? AND status IN ('queued','running')").get(userId).n;
    assert(count<5,429,'JOB_LIMIT','Aguarde os trabalhos em andamento antes de iniciar outros.');
    const jobId=id(),time=now();
    db.prepare("INSERT INTO jobs (id,user_id,arrangement_id,source_file_id,type,status,source_version,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?,?)").run(jobId,userId,arrangementId,arr.file_id,type,arr.version,time,time);
    audit(db,userId,'jobs',jobId,'create',{type});return jobId;
  }
  async function processNext() {
    await ready;if(stopped)return;
    const job=db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();if(!job)return;
    const claimed=db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=? AND status='queued'").run(now(),job.id);if(!claimed.changes)return;
    current=job.id;const work=path.join(config.dataDir,'jobs',job.id);let generated=null;
    try{
      assert(capabilities[job.type],503,'AUDIO_UNAVAILABLE','Modelo de áudio indisponível neste servidor.');
      await mkdir(work,{recursive:true});const source=files.resolve(job.source_file_id,job.user_id);
      await runPython(config,['--type',job.type,'--input',source.path,'--output',work],config.jobTimeoutMs,c=>{child=c;});child=null;
      if(db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id)?.status!=='running')return;
      const result=JSON.parse(await readFile(path.join(work,'result.json'),'utf8'));
      if(result.output){assert(path.basename(result.output)===result.output,500,'BAD_OUTPUT','Saída de áudio inválida.');generated=await files.generated(job.user_id,path.join(work,result.output),result.output);}
      transaction(db,()=>{
        if(generated)files.insert(generated);
        if(job.type==='analysis'){
          const arr=owned(db,'arrangements',job.arrangement_id,job.user_id);
          result.applied=arr.version===job.source_version&&arr.file_id===job.source_file_id;
          if(result.applied){
            const bpm=Number.isFinite(result.bpm)&&result.bpm>=20&&result.bpm<=300?result.bpm:null;
            const key=typeof result.key==='string'&&/^[A-G](#|b)?m?$/.test(result.key)?result.key:'';
            db.prepare("UPDATE arrangements SET bpm=COALESCE(bpm,?),musical_key=CASE WHEN musical_key='' THEN ? ELSE musical_key END,version=version+1,updated_at=? WHERE id=? AND user_id=?").run(bpm,key,now(),job.arrangement_id,job.user_id);
          }
        }
        db.prepare("UPDATE jobs SET status='completed',output_file_id=?,result=?,updated_at=? WHERE id=?").run(generated?.id||null,JSON.stringify(result),now(),job.id);
        audit(db,job.user_id,'jobs',job.id,'complete',{type:job.type});
      });
      if(generated)generated.committed=true;
    }catch(error){
      const message=error.code==='AUDIO_UNAVAILABLE'?error.message:'Não foi possível processar o áudio. Confira o arquivo, as dependências, os modelos e a memória disponível no servidor.';
      console.error(`[audio ${job.id}]`,String(error.message).slice(-3000));
      db.prepare("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=? AND status='running'").run(message,now(),job.id);
    }finally{
      if(generated&&!generated.committed)await rm(generated.path,{force:true});
      await rm(work,{recursive:true,force:true});current=null;child=null;
    }
  }
  function pump(){if(!stopped&&!pending)pending=processNext().catch(e=>console.error('[audio worker]',e.message)).finally(()=>{pending=null;});}
  const timer=setInterval(pump,1000);timer.unref();
  function cancel(userId,jobId){
    const job=db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(jobId,userId);assert(job,404,'NOT_FOUND','Trabalho não encontrado.');
    assert(['queued','running'].includes(job.status),409,'JOB_FINISHED','Este trabalho já terminou.');
    db.prepare("UPDATE jobs SET status='cancelled',updated_at=? WHERE id=?").run(now(),jobId);
    if(current===jobId)child?.kill('SIGKILL');audit(db,userId,'jobs',jobId,'cancel');
  }
  return {ready,capabilities:()=>({...capabilities}),enqueue,cancel,async close(){stopped=true;clearInterval(timer);child?.kill('SIGKILL');await pending;}};
}
