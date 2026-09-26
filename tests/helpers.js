import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
export async function fixture(t,overrides={}) {
  const dataDir=await mkdtemp(path.join(tmpdir(),'sonota-test-'));
  const runtime=createApp({dataDir,audioEnabled:false,ollamaUrl:'',...overrides});
  const server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await runtime.close();await rm(dataDir,{recursive:true,force:true});});
  return {...runtime,server,base,dataDir};
}
export async function account(base,email='owner@example.test') {
  const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Pessoa de Teste',email,password:'SenhaTeste123!',studio:'Estúdio Teste'})});
  const data=await response.json();if(response.status!==201)throw new Error(JSON.stringify(data));
  return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:data.csrf,user:data.user};
}
export async function call(base,session,method,route,body,headers={}) {
  const h={...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...headers};
  if(body!==undefined&&!(body instanceof FormData))h['Content-Type']='application/json';
  const response=await fetch(base+'/api'+route,{method,headers:h,body:body===undefined||body instanceof FormData?body:JSON.stringify(body)});
  const data=response.headers.get('content-type')?.includes('json')?await response.json():null;
  return {status:response.status,data,response};
}
export function wav(seconds=.5,frequency=440) {
  const sr=22050,count=Math.floor(sr*seconds),buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF');buffer.writeUInt32LE(36+count*2,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(sr,24);buffer.writeUInt32LE(sr*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)buffer.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*i/sr)*10000),44+i*2);return buffer;
}
export function multipart(metadata,bytes=wav(),name='teste.wav') {const form=new FormData();form.append('metadata',JSON.stringify(metadata));form.append('file',new Blob([bytes]),name);return form;}
export async function seed(base,u,extra={}) {
  const client=(await call(base,u,'POST','/clients',{name:'Nômade Filmes',email:'nomade@example.test',type:'Empresa'})).data;
  const arr=(await call(base,u,'POST','/arrangements',multipart({title:'Theme Aurora',bpm:121,key:'Em',genre:'Cinematic',instruments:['synth','cordas','baixo'],tags:['tensão','campanha']}))).data;
  const project=(await call(base,u,'POST','/projects',{name:'Campanha Aurora',clientId:client.id,arrangementId:arr.id,proposal:'Campanha de uma floresta tropical',status:'Em produção',value:8200.35,dueDate:'2026-09-30',...extra})).data;
  return {client,arr,project};
}
