import { mkdirSync,openSync,writeFileSync,closeSync,readFileSync,unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export function acquireLock(config){
  mkdirSync(config.dataDir,{recursive:true,mode:0o700});const file=path.join(config.dataDir,'server.lock'),token=randomUUID();
  for(let attempt=0;attempt<2;attempt++){
    try{
      const fd=openSync(file,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,token}));closeSync(fd);
      return ()=>{try{if(JSON.parse(readFileSync(file,'utf8')).token===token)unlinkSync(file);}catch{}};
    }catch(error){
      if(error.code!=='EEXIST')throw error;
      const existing=JSON.parse(readFileSync(file,'utf8'));let alive=true;
      try{process.kill(existing.pid,0);}catch(check){if(check.code==='ESRCH')alive=false;else throw check;}
      if(alive)throw new Error('Já existe um servidor usando esta pasta de dados. Encerre-o antes de continuar.');
      unlinkSync(file);
    }
  }
  throw new Error('Não foi possível obter acesso exclusivo à pasta de dados.');
}
