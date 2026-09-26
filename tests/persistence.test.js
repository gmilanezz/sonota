import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { account,call,seed } from './helpers.js';
test('reinício mantém conta, sessão, registros e arquivos e impede dois servidores no mesmo banco',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'sonota-restart-'));let runtime,server;
 async function start(){runtime=createApp({dataDir,audioEnabled:false,ollamaUrl:''});server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));return `http://127.0.0.1:${server.address().port}`;}
 async function stop(){await new Promise(resolve=>server.close(resolve));await runtime.close();server=null;runtime=null;}
 try{
  let base=await start();const u=await account(base),data=await seed(base,u);assert.throws(()=>createApp({dataDir}),/Já existe/);
  await stop();base=await start();
  const bootstrap=(await call(base,u,'GET','/bootstrap')).data;assert.equal(bootstrap.projects[0].id,data.project.id);assert.equal(bootstrap.arrangements[0].id,data.arr.id);
  assert.equal((await call(base,u,'GET','/files/'+data.arr.fileId)).status,200);
  const foreign=r=>Object.keys(r).some(k=>/password|token_hash/i.test(k));assert.equal(foreign(bootstrap.profile),false);
 }finally{if(server)await stop();await rm(dataDir,{recursive:true,force:true});}
});
