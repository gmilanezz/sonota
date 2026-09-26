import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture,account,call,multipart,wav,seed } from './helpers.js';

test('sessão, CSRF, origem, cadastro e logout',async t=>{
 const r=await fixture(t),u=await account(r.base);
 assert.equal((await call(r.base,null,'GET','/bootstrap')).status,401);
 assert.equal((await call(r.base,{...u,csrf:''},'POST','/clients',{name:'X'})).status,403);
 assert.equal((await call(r.base,u,'POST','/clients',{name:'X'},{Origin:'https://outro.test'})).status,403);
 assert.equal((await call(r.base,u,'GET','/bootstrap')).data.clients.length,0);
 const stored=r.db.prepare('SELECT password_hash FROM users WHERE id=?').get(u.user.id).password_hash;
 assert.ok(stored.startsWith('scrypt$'));assert.ok(!stored.includes('SenhaTeste'));
 const bad=await call(r.base,null,'POST','/auth/login',{email:u.user.email,password:'senha errada'});assert.equal(bad.status,401);
 assert.equal((await call(r.base,u,'POST','/auth/logout')).status,204);
 assert.equal((await call(r.base,u,'GET','/bootstrap')).status,401);
});

test('CRUD e isolamento completo entre duas contas, inclusive arquivos e relações',async t=>{
 const r=await fixture(t),a=await account(r.base),b=await account(r.base,'other@example.test');
 const {client,arr,project}=await seed(r.base,a);
 assert.equal(client.name,'Nômade Filmes');assert.equal(arr.duration,.5);assert.equal(project.value,8200.35);
 assert.equal((await call(r.base,b,'GET','/bootstrap')).data.projects.length,0);
 for(const [table,record] of [['clients',client],['arrangements',arr],['projects',project]]){
  assert.equal((await call(r.base,b,'GET',`/${table}/${record.id}`)).status,404);
  assert.equal((await call(r.base,b,'DELETE',`/${table}/${record.id}`,undefined,{'If-Match':'1'})).status,404);
 }
 assert.equal((await call(r.base,b,'GET','/files/'+arr.fileId)).status,404);
 assert.equal((await call(r.base,b,'POST','/projects',{name:'Tentativa',clientId:client.id})).status,404);
 assert.equal((await call(r.base,a,'PATCH','/clients/'+client.id,{version:1,name:'Cliente revisado'})).status,200);
 assert.equal((await call(r.base,a,'DELETE','/clients/'+client.id,undefined,{'If-Match':'2'})).status,409);
 assert.equal((await call(r.base,a,'DELETE','/arrangements/'+arr.id,undefined,{'If-Match':'1'})).status,409);
 const partial=await call(r.base,a,'PATCH','/projects/'+project.id,{version:1,status:'Revisão'});
 assert.equal(partial.status,200);assert.equal(partial.data.value,8200.35);assert.equal(partial.data.arrangementId,arr.id);assert.equal(partial.data.proposal,project.proposal);
 assert.equal((await call(r.base,a,'PATCH','/projects/'+project.id,{version:1,value:1})).status,409);
 const updates=await Promise.all([call(r.base,a,'PATCH','/projects/'+project.id,{version:2,status:'Concluído'}),call(r.base,a,'PATCH','/projects/'+project.id,{version:2,status:'Cancelado'})]);
 assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call(r.base,a,'PATCH','/projects/'+project.id,{version:3,dueDate:'2026-02-31'})).status,422);
 assert.equal((await call(r.base,a,'PATCH','/projects/'+project.id,{version:3,value:-1})).status,422);
 assert.equal((await call(r.base,a,'PATCH','/projects/'+project.id,{version:3,value:0.001})).status,422);
 assert.equal((await call(r.base,a,'PATCH','/clients/'+client.id,{version:2,user_id:b.user.id})).status,422);
 const download=await call(r.base,a,'GET','/files/'+arr.fileId+'?download=1');
 assert.deepEqual(Buffer.from(await download.response.arrayBuffer()),wav());
 const range=await call(r.base,a,'GET','/files/'+arr.fileId,undefined,{Range:'bytes=0-43'});assert.equal(range.status,206);assert.equal((await range.response.arrayBuffer()).byteLength,44);
 assert.equal((await call(r.base,a,'DELETE','/projects/'+project.id,undefined,{'If-Match':'3'})).status,204);
 assert.equal((await call(r.base,a,'DELETE','/arrangements/'+arr.id,undefined,{'If-Match':'1'})).status,204);
 assert.equal((await call(r.base,a,'GET','/files/'+arr.fileId)).status,404);
 assert.equal((await call(r.base,a,'DELETE','/clients/'+client.id,undefined,{'If-Match':'2'})).status,204);
});

test('upload validado, versões, limites, rollback e ausência de acesso estático ao banco',async t=>{
 const r=await fixture(t,{maxFileBytes:30000,quotaBytes:100000}),u=await account(r.base);
 let response=await call(r.base,u,'POST','/arrangements',multipart({title:'Falso'},Buffer.from('nao sou wav'),'hack.wav'));assert.equal(response.status,415);
 response=await call(r.base,u,'POST','/arrangements',multipart({title:'Grande'},wav(1)));assert.equal(response.status,413);
 const a=(await call(r.base,u,'POST','/arrangements',multipart({title:'Faixa'}))).data;assert.ok(a.id);
 const updated=await call(r.base,u,'PATCH','/arrangements/'+a.id,multipart({title:'Faixa revisada',version:1},wav(.5,660),'versão2.wav'));assert.equal(updated.status,200);
 const versions=(await call(r.base,u,'GET','/arrangements/'+a.id+'/versions')).data;assert.equal(versions.length,2);assert.equal(versions[0].fileName,'versão2.wav');
 assert.equal((await call(r.base,u,'GET','/files/'+a.fileId)).status,200);
 const stale=await call(r.base,u,'PATCH','/arrangements/'+a.id,multipart({title:'Atrasado',version:1}));assert.equal(stale.status,409);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM files').get().n,2);
 // A limpeza do upload termina junto com a resposta e pode ainda estar em andamento no fs.
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal((await readdir(path.join(r.dataDir,'uploads'))).length,2);
 assert.equal((await readdir(path.join(r.dataDir,'tmp'))).length,0);
 assert.equal((await fetch(r.base+'/data/sonota.sqlite')).status,404);
 assert.equal((await fetch(r.base+'/.env')).status,404);
});

test('financeiro sem duplicidade e substituição transacional de documentos',async t=>{
 const r=await fixture(t),u=await account(r.base),{project}=await seed(r.base,u);
 let summary=(await call(r.base,u,'GET','/finance/summary')).data;assert.deepEqual(summary,{received:0,receivable:0,forecast:8200.35});
 let result=await call(r.base,u,'PATCH','/projects/'+project.id+'/finance',{version:1,paid:true});assert.equal(result.status,200);
 assert.deepEqual(result.data.summary,{received:8200.35,receivable:0,forecast:0});
 const pdf=Buffer.from('%PDF-1.4\n% fixture\n%%EOF');
 const doc=(await call(r.base,u,'POST','/documents',multipart({projectId:project.id,description:'Primeiro'},pdf,'nota.pdf'))).data;
 assert.ok(doc.id);
 result=await call(r.base,u,'PATCH','/projects/'+project.id+'/finance',multipart({version:3,paid:false,mode:'replace'},Buffer.from('invalid'),'invalido.pdf'));assert.equal(result.status,415);
 assert.equal((await call(r.base,u,'GET','/documents')).data.items.length,1);
 assert.equal((await call(r.base,u,'GET','/projects/'+project.id)).data.paid,true);
 result=await call(r.base,u,'PATCH','/projects/'+project.id+'/finance',multipart({version:3,paid:false,mode:'replace',description:'Nova'},pdf,'nova.pdf'));assert.equal(result.status,200);
 assert.equal(result.data.docs.length,1);assert.equal(result.data.docs[0].fileName,'nova.pdf');assert.equal((await call(r.base,u,'GET','/files/'+doc.fileId)).status,404);
 assert.equal((await call(r.base,u,'PATCH','/projects/'+project.id,{version:4,status:'Concluído'})).status,200);
 assert.deepEqual((await call(r.base,u,'GET','/finance/summary')).data,{received:0,receivable:8200.35,forecast:0});
 assert.equal((await call(r.base,u,'PATCH','/projects/'+project.id,{version:5,status:'Cancelado'})).status,200);
 assert.deepEqual((await call(r.base,u,'GET','/finance/summary')).data,{received:0,receivable:0,forecast:0});
 assert.equal((await call(r.base,u,'DELETE','/projects/'+project.id,undefined,{'If-Match':'6'})).status,204);
 assert.equal((await call(r.base,u,'GET','/documents')).data.total,0);
});

test('busca por significado dos metadados, BPM, tonalidade, contexto e conta',async t=>{
 const r=await fixture(t),u=await account(r.base),other=await account(r.base,'second@example.test');await seed(r.base,u);
 const search=async(q,session=u)=>(await call(r.base,session,'POST','/search',{query:q})).data;
 assert.equal((await search('bpm 120 a 150 com sintetizador e tensão')).total,1);
 assert.equal((await search('entre 90 e 100 bpm')).total,0);
 assert.equal((await search('120 a 125 bpm tom Em floresta')).total,1);
 assert.equal((await search('tom C')).total,0);assert.equal((await search('tom C#')).criteria.key,'C#');
 assert.equal((await search('synth sem cordas')).total,0);
 assert.equal((await search('zebra inexistente')).total,0);
 assert.equal((await search('synth',other)).total,0);
 assert.equal((await search('campanha')).mode,'metadata');
});

test('assistente exige intenção e confirmação, tolera erro e recusa ambiguidade e repetição',async t=>{
 const r=await fixture(t),u=await account(r.base),other=await account(r.base,'assistant-other@example.test');const {project}=await seed(r.base,u);
 const message=async(text)=>(await call(r.base,u,'POST','/assistant/message',{message:text})).data;
 assert.equal((await message('Campanha Aurora foi pago?')).action,undefined);
 assert.equal((await message('não altere Campanha Aurora para cancelado')).action,undefined);
 let suggestion=await message('muda campnha aurora pra concluído');assert.ok(suggestion.action,suggestion.message);
 assert.equal((await call(r.base,u,'GET','/projects/'+project.id)).data.status,'Em produção');
 assert.equal((await call(r.base,other,'POST','/assistant/actions/'+suggestion.action.id+'/confirm')).status,409);
 assert.equal((await call(r.base,u,'POST','/assistant/actions/'+suggestion.action.id+'/confirm')).status,200);
 assert.equal((await call(r.base,u,'POST','/assistant/actions/'+suggestion.action.id+'/confirm')).status,409);
 assert.equal((await call(r.base,u,'GET','/projects/'+project.id)).data.status,'Concluído');
 suggestion=await message('muda o valor de Campanha Aurora para R$ 8.500');assert.ok(suggestion.action);
 await call(r.base,u,'PATCH','/projects/'+project.id,{version:2,status:'Revisão'});
 assert.equal((await call(r.base,u,'POST','/assistant/actions/'+suggestion.action.id+'/confirm')).status,409);
 const original=(await call(r.base,u,'GET','/projects/'+project.id)).data;
 await call(r.base,u,'POST','/projects',{name:original.name,clientId:original.clientId});
 assert.equal((await message('muda Campanha Aurora para concluído')).action,undefined);
});

test('sem modelos não simula transcrições; troca de senha revoga sessões',async t=>{
 const r=await fixture(t),u=await account(r.base),{arr}=await seed(r.base,u);
 const response=await call(r.base,u,'POST','/jobs',{arrangementId:arr.id,type:'midi'});assert.equal(response.status,503);
 assert.equal((await call(r.base,u,'GET','/jobs')).data.length,0);
 const changed=await call(r.base,u,'POST','/auth/password',{currentPassword:'SenhaTeste123!',newPassword:'NovaSenha12345!'});assert.equal(changed.status,200);
 assert.equal((await call(r.base,u,'GET','/auth/me')).status,401);
 assert.equal((await call(r.base,null,'POST','/auth/login',{email:u.user.email,password:'SenhaTeste123!'})).status,401);
 assert.equal((await call(r.base,null,'POST','/auth/login',{email:u.user.email,password:'NovaSenha12345!'})).status,200);
});
