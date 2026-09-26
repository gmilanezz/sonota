import { id,now,audit,serializeClient,serializeProject,listArrangements } from './db.js';
import { assert } from './errors.js';
import { clientSchema,arrangementSchema,projectSchema,updateSchema } from './validation.js';
import { addProjectEvent } from './workflow.js';
export const definitions={
 clients:{schema:clientSchema,fields:{name:'name',type:'type',company:'company',email:'email',phone:'phone',whatsapp:'whatsapp',document:'document',city:'city',notes:'notes',status:'status'},serializer:serializeClient},
 arrangements:{schema:arrangementSchema,fields:{title:'title',bpm:'bpm',key:'musical_key',genre:'genre',instruments:'instruments',tags:'tags',notes:'notes'}},
 projects:{schema:projectSchema,fields:{name:'name',clientId:'client_id',arrangementId:'arrangement_id',description:'description',proposal:'proposal',objective:'objective',references:'references_text',musicalStyle:'musical_style',instruments:'instruments',status:'status',value:'value_cents',dueDate:'due_date',paymentDueDate:'payment_due_date',paid:'paid'},serializer:serializeProject}
};
export function owned(db,table,entityId,userId) {
  assert(Object.hasOwn(definitions,table),500,'INTERNAL','Tabela inválida.');
  const item=db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(entityId,userId);
  assert(item,404,'NOT_FOUND','Registro não encontrado.');return item;
}
export function versionCheck(row,version) { assert(row.version===version,409,'VERSION_CONFLICT','Este registro mudou em outra tela. Recarregue e tente novamente.'); }
function references(db,table,data,userId) {
  if(table==='projects'){
    if(data.clientId) owned(db,'clients',data.clientId,userId);
    if(data.arrangementId) owned(db,'arrangements',data.arrangementId,userId);
  }
}
function sqlValue(key,value){return key==='value'?Math.round(value*100):key==='paid'?Number(value):key==='arrangementId'?(value||null):['instruments','tags'].includes(key)?JSON.stringify(value):value;}
export function entity(db,table,entityId,userId){
  if(table==='arrangements') return listArrangements(db,userId).find(a=>a.id===entityId);
  return definitions[table].serializer(owned(db,table,entityId,userId));
}
export function createEntity(db,table,input,userId,extra={}) {
  const def=definitions[table], data=def.schema.parse(input);references(db,table,data,userId);
  const entries=Object.entries(data), entityId=id(),time=now();
  const computed={...extra};
  if(table==='projects'){
    if(data.status==='Concluído')computed.completed_at=time;
    if(data.paid)computed.paid_at=time;
  }
  const columns=['id','user_id',...entries.map(([k])=>def.fields[k]),...Object.keys(computed),'created_at','updated_at'];
  const values=[entityId,userId,...entries.map(([k,v])=>sqlValue(k,v)),...Object.values(computed),time,time];
  db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...values);
  audit(db,userId,table,entityId,'create');
  if(table==='projects')addProjectEvent(db,userId,entityId,'project-created','Projeto criado.',{status:data.status});
  return entityId;
}
export function updateEntity(db,table,entityId,input,userId,extra={},source='form') {
  const def=definitions[table],data=updateSchema(def.schema).parse(input),row=owned(db,table,entityId,userId);versionCheck(row,data.version);
  references(db,table,data,userId);
  const entries=Object.entries(data).filter(([k])=>k!=='version');
  const computed={...extra};
  if(table==='projects'){
    if(Object.hasOwn(data,'status')){
      if(data.status==='Concluído'&&row.status!=='Concluído')computed.completed_at=now();
      else if(data.status!=='Concluído'&&row.status==='Concluído')computed.completed_at=null;
    }
    if(Object.hasOwn(data,'paid')){
      if(data.paid&&!row.paid)computed.paid_at=now();
      else if(!data.paid&&row.paid)computed.paid_at=null;
    }
  }
  const columns=[...entries.map(([k])=>`${def.fields[k]}=?`),...Object.keys(computed).map(k=>`${k}=?`),'version=version+1','updated_at=?'];
  const args=[...entries.map(([k,v])=>sqlValue(k,v)),...Object.values(computed),now(),entityId,userId,data.version];
  const result=db.prepare(`UPDATE ${table} SET ${columns.join(',')} WHERE id=? AND user_id=? AND version=?`).run(...args);
  assert(result.changes===1,409,'VERSION_CONFLICT','Este registro foi atualizado. Recarregue.');
  audit(db,userId,table,entityId,'update',{fields:entries.map(([k])=>k),source});
  if(table==='projects'){
    if(Object.hasOwn(data,'status')&&data.status!==row.status)addProjectEvent(db,userId,entityId,'status-changed',`Projeto movido de ${row.status} para ${data.status}.`,{from:row.status,to:data.status,source});
    if(Object.hasOwn(data,'paid')&&Number(data.paid)!==row.paid)addProjectEvent(db,userId,entityId,'payment-changed',data.paid?'Pagamento marcado como recebido.':'Pagamento marcado como pendente.',{paid:data.paid,source});
    const changed=entries.map(([k])=>k).filter(k=>!['status','paid'].includes(k));
    if(changed.length)addProjectEvent(db,userId,entityId,'project-updated','Informações do projeto atualizadas.',{fields:changed,source});
  }
  return entity(db,table,entityId,userId);
}
