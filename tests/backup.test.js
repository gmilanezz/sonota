import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { ROOT } from '../src/config.js';
import { account,seed } from './helpers.js';
function run(dataDir,destination){return new Promise(resolve=>{const child=spawn(process.execPath,['scripts/backup.js',destination],{cwd:ROOT,env:{...process.env,DATA_DIR:dataDir}});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('close',code=>resolve({code,output}));});}
test('backup contém banco e áudio e recusa execução simultânea com servidor',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sonota-backup-')),dataDir=path.join(root,'data'),destination=path.join(root,'backups');
 const runtime=createApp({dataDir,audioEnabled:false,ollamaUrl:''}),server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));let closed=false;
 try{
  const base=`http://127.0.0.1:${server.address().port}`,u=await account(base);await seed(base,u);
  assert.notEqual((await run(dataDir,destination)).code,0);
  await new Promise(resolve=>server.close(resolve));await runtime.close();closed=true;
  const result=await run(dataDir,destination);assert.equal(result.code,0,result.output);
  const [folder]=await readdir(destination),backup=path.join(destination,folder),db=new DatabaseSync(path.join(backup,'sonota.sqlite'),{readOnly:true});
  try{assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,1);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
  assert.equal((await readdir(path.join(backup,'uploads'))).length,1);
 }finally{if(!closed){await new Promise(resolve=>server.close(resolve));await runtime.close();}await rm(root,{recursive:true,force:true});}
});
