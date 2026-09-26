import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fixture,account,call,seed } from './helpers.js';

test('contrato de embeddings: índice, cache, mudança de conteúdo e fallback',async t=>{
 let calls=0,fail=false;
 const service=createServer(async(req,res)=>{
  assert.equal(req.url,'/api/embed');const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const data=JSON.parse(Buffer.concat(chunks));assert.equal(data.model,'test-model');calls++;
  if(fail){res.writeHead(503);res.end();return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({embeddings:data.input.map(()=>[1,0,0])}));
 });
 service.listen(0,'127.0.0.1');await new Promise(resolve=>service.once('listening',resolve));
 t.after(()=>new Promise(resolve=>service.close(resolve)));
 const r=await fixture(t,{ollamaUrl:`http://127.0.0.1:${service.address().port}`,embeddingModel:'test-model'}),u=await account(r.base),{arr}=await seed(r.base,u);
 let result=(await call(r.base,u,'POST','/search',{query:'synth'})).data;assert.equal(result.mode,'hybrid');assert.equal(calls,2);
 await call(r.base,u,'POST','/search',{query:'tensão'});assert.equal(calls,3);
 await call(r.base,u,'PATCH','/arrangements/'+arr.id,{version:1,notes:'Novo contexto para reindexar'});
 await call(r.base,u,'POST','/search',{query:'synth'});assert.equal(calls,5);
 fail=true;result=(await call(r.base,u,'POST','/search',{query:'synth'})).data;
 assert.equal(result.mode,'metadata');assert.match(result.notice,/indisponível/);assert.equal(result.total,1);
});
