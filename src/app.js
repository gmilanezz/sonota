import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { acquireLock } from './lock.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { getConfig } from './config.js';
import { openDatabase,transaction,id,now,audit,profile,listClients,listArrangements,listProjects,listDocs,listJobs,financeSummary,projectActivity } from './db.js';
import { AppError,assert } from './errors.js';
import { hashPassword,verifyPassword,createSession,cookieOptions,requireAuth,originGuard,readSession } from './auth.js';
import { registerSchema,loginSchema,profileSchema,arrangementSchema,docSchema,financeSchema,projectVersionSchema,searchSchema,jobSchema,messageSchema } from './validation.js';
import { definitions,owned,versionCheck,createEntity,updateEntity,entity } from './entities.js';
import { storage } from './files.js';
import { search,normalize } from './search.js';
import { interpret } from './assistant.js';
import { createWorker } from './jobs.js';
import { addProjectEvent,listProjectEvents,listProjectVersions,studioFlow,operationalAlerts,upcomingDeliveries } from './workflow.js';

function metadata(req) {
  if(req.is('multipart/form-data')){
    assert(typeof req.body?.metadata==='string',400,'METADATA_REQUIRED','Envie os metadados do arquivo.');
    try{return JSON.parse(req.body.metadata);}catch{throw new AppError(400,'INVALID_JSON','Metadados JSON inválidos.');}
  }
  return req.body;
}
function pagination(req,items){
  const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
  assert(Number.isInteger(page)&&Number.isInteger(limit),400,'INVALID_PAGE','Paginação inválida.');
  return {items:items.slice((page-1)*limit,page*limit),total:items.length,page,limit};
}
export function createApp(overrides={}) {
  const config=getConfig(overrides),release=acquireLock(config);
  let db;try{db=openDatabase(config);}catch(error){release();throw error;}
  const files=storage(config,db),worker=createWorker(db,config,files),app=express();
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{'default-src':["'self'"],'script-src':["'self'"],'script-src-attr':["'none'"],'style-src':["'self'","'unsafe-inline'"],'img-src':["'self'",'data:'],'media-src':["'self'",'blob:'],'connect-src':["'self'"],'upgrade-insecure-requests':config.secureCookie?[]:null}},strictTransportSecurity:config.secureCookie?undefined:false}));
  app.use('/api',originGuard(config),(req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use('/api',rateLimit({windowMs:15*60000,limit:1800,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'Muitas requisições. Aguarde alguns minutos.'}}}));
  app.use(express.json({limit:'150kb',strict:true}));
  const loginLimiter=rateLimit({windowMs:15*60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'Muitas tentativas de acesso. Aguarde 15 minutos.'}}});
  app.get('/api/health',(req,res)=>res.json({status:'ok',version:'7.0.0'}));
  app.get('/api/auth/options',(req,res)=>res.json({registration:config.registration}));
  app.post('/api/auth/register',loginLimiter,async(req,res)=>{
    assert(config.registration,403,'REGISTRATION_DISABLED','Cadastro de novas contas desativado.');
    const data=registerSchema.parse(req.body),passwordHash=await hashPassword(data.password),userId=id(),time=now();
    transaction(db,()=>{
      assert(!db.prepare('SELECT 1 FROM users WHERE email=?').get(data.email),409,'EMAIL_EXISTS','Este e-mail já possui uma conta.');
      db.prepare('INSERT INTO users(id,email,password_hash,name,role,studio,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(userId,data.email,passwordHash,data.name,data.role,data.studio,time,time);
      audit(db,userId,'users',userId,'register');
    });
    const csrf=createSession(db,config,userId,res);res.status(201).json({user:profile(db.prepare('SELECT * FROM users WHERE id=?').get(userId)),csrf});
  });
  app.post('/api/auth/login',loginLimiter,async(req,res)=>{
    const data=loginSchema.parse(req.body),user=db.prepare('SELECT * FROM users WHERE email=?').get(data.email);
    assert(await verifyPassword(data.password,user?.password_hash),401,'INVALID_CREDENTIALS','E-mail ou senha incorretos.');
    const old=readSession(db,req);if(old)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(old.token_hash);
    const csrf=createSession(db,config,user.id,res);res.json({user:profile(user),csrf});
  });
  app.use('/api',requireAuth(db));
  app.post('/api/auth/logout',(req,res)=>{
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);res.clearCookie('sonota_session',cookieOptions(config));res.sendStatus(204);
  });
  app.get('/api/auth/me',(req,res)=>res.json({user:profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)),csrf:req.session.csrf}));
  app.patch('/api/profile',async(req,res)=>{
    const data=profileSchema.parse(req.body),user=db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
    if(user.email!==data.email)assert(await verifyPassword(data.currentPassword||'',user.password_hash),403,'PASSWORD_REQUIRED','Confirme sua senha atual para alterar o e-mail.');
    transaction(db,()=>{
      versionCheck(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId),data.version);
      assert(!db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(data.email,req.userId),409,'EMAIL_EXISTS','Este e-mail já está em uso.');
      db.prepare('UPDATE users SET name=?,role=?,studio=?,email=?,phone=?,notification_preferences=?,version=version+1,updated_at=? WHERE id=?').run(data.name,data.role,data.studio,data.email,data.phone,JSON.stringify(data.notificationPreferences),now(),req.userId);
      audit(db,req.userId,'users',req.userId,'profile_update');
    });res.json(profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)));
  });
  app.post('/api/profile/avatar',files.middleware,async(req,res)=>{
    const file=await files.stage(req,'document');assert(file.mime.startsWith('image/'),415,'IMAGE_REQUIRED','Use uma imagem PNG ou JPG para a foto do perfil.');
    transaction(db,()=>{files.insert(file);db.prepare('UPDATE users SET avatar_file_id=?,version=version+1,updated_at=? WHERE id=?').run(file.id,now(),req.userId);audit(db,req.userId,'users',req.userId,'avatar_update');});
    file.committed=true;await files.collect(req.userId);res.json(profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)));
  });
  app.delete('/api/profile/avatar',async(req,res)=>{
    transaction(db,()=>{db.prepare('UPDATE users SET avatar_file_id=NULL,version=version+1,updated_at=? WHERE id=?').run(now(),req.userId);audit(db,req.userId,'users',req.userId,'avatar_delete');});
    await files.collect(req.userId);res.json(profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)));
  });
  app.post('/api/auth/password',loginLimiter,async(req,res)=>{
    const data=z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(10).max(128)}).strict().parse(req.body);
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
    assert(await verifyPassword(data.currentPassword,user.password_hash),403,'INVALID_PASSWORD','Senha atual incorreta.');
    const hash=await hashPassword(data.newPassword);
    transaction(db,()=>{
      const changed=db.prepare('UPDATE users SET password_hash=?,version=version+1,updated_at=? WHERE id=? AND password_hash=?').run(hash,now(),req.userId,user.password_hash);
      assert(changed.changes===1,409,'VERSION_CONFLICT','A senha mudou. Entre novamente.');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.userId);audit(db,req.userId,'users',req.userId,'password_update');
    });res.json({csrf:createSession(db,config,req.userId,res)});
  });
  app.get('/api/bootstrap',async(req,res)=>{
    await worker.ready;
    res.json({profile:profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)),csrf:req.session.csrf,clients:listClients(db,req.userId),arrangements:listArrangements(db,req.userId),projects:listProjects(db,req.userId),docs:listDocs(db,req.userId),transcriptions:listJobs(db,req.userId),finance:financeSummary(db,req.userId),activity:projectActivity(db,req.userId),capabilities:{audio:worker.capabilities(),semanticConfigured:!!config.ollamaUrl}});
  });
  app.get('/api/finance/summary',(req,res)=>res.json(financeSummary(db,req.userId)));
  app.get('/api/dashboard',(req,res)=>{
    const projects=listProjects(db,req.userId);
    res.json({
      clients:listClients(db,req.userId).length,
      activeClients:listClients(db,req.userId).filter(c=>c.status==='Ativo').length,
      arrangements:listArrangements(db,req.userId).length,
      projects:projects.length,
      activeProjects:projects.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length,
      finance:financeSummary(db,req.userId),
      studioFlow:studioFlow(db,req.userId),
      alerts:operationalAlerts(db,req.userId),
      upcomingDeliveries:upcomingDeliveries(db,req.userId),
      recentActivity:listProjectEvents(db,req.userId,null,12),
      recentProjects:projects.slice(0,5),
      activity:projectActivity(db,req.userId)
    });
  });
  app.get('/api/clients/:id/overview',(req,res)=>{
    const client=entity(db,'clients',req.params.id,req.userId);
    const projects=listProjects(db,req.userId).filter(p=>p.clientId===client.id);
    const docs=listDocs(db,req.userId);
    const projectIds=new Set(projects.map(p=>p.id));
    const arrangementIds=new Set(projects.map(p=>p.arrangementId).filter(Boolean));
    res.json({client,projects,summary:{projects:projects.length,activeProjects:projects.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length,totalContracted:projects.reduce((n,p)=>n+p.value,0),received:projects.filter(p=>p.paid).reduce((n,p)=>n+p.value,0),pending:projects.filter(p=>!p.paid&&p.status!=='Cancelado').reduce((n,p)=>n+p.value,0),arrangements:arrangementIds.size,documents:docs.filter(d=>projectIds.has(d.projectId)).length}});
  });
  app.get('/api/projects/:id/workspace',(req,res)=>{
    const project=entity(db,'projects',req.params.id,req.userId);
    res.json({project,client:entity(db,'clients',project.clientId,req.userId),arrangement:project.arrangementId?entity(db,'arrangements',project.arrangementId,req.userId):null,versions:listProjectVersions(db,req.userId,project.id),documents:listDocs(db,req.userId).filter(d=>d.projectId===project.id),history:listProjectEvents(db,req.userId,project.id,200)});
  });
  const lists={clients:listClients,arrangements:listArrangements,projects:listProjects};
  for(const table of Object.keys(definitions)){
    app.get(`/api/${table}`,(req,res)=>{
      let items=lists[table](db,req.userId);const q=normalize(req.query.q||'');
      if(q)items=items.filter(item=>normalize(JSON.stringify(item)).includes(q));
      if(req.query.status)items=items.filter(item=>item.status===req.query.status);
      res.json(pagination(req,items));
    });
    app.get(`/api/${table}/:id`,(req,res)=>{owned(db,table,req.params.id,req.userId);res.json(entity(db,table,req.params.id,req.userId));});
    if(table!=='arrangements'){
      app.post(`/api/${table}`,(req,res)=>{
        const entityId=transaction(db,()=>createEntity(db,table,req.body,req.userId));res.status(201).json(entity(db,table,entityId,req.userId));
      });
      app.patch(`/api/${table}/:id`,(req,res)=>res.json(transaction(db,()=>updateEntity(db,table,req.params.id,req.body,req.userId))));
    }
    app.delete(`/api/${table}/:id`,async(req,res)=>{
      transaction(db,()=>{
        const row=owned(db,table,req.params.id,req.userId);versionCheck(row,Number(req.get('If-Match')));
        if(table==='clients'||table==='arrangements'){
          const fk=table==='clients'?'client_id':'arrangement_id';
          assert(!db.prepare(`SELECT 1 FROM projects WHERE ${fk}=? AND user_id=?`).get(row.id,req.userId),409,'IN_USE','Registro vinculado a projetos. Altere ou exclua os projetos primeiro.');
        }
        if(table==='arrangements')assert(!db.prepare("SELECT 1 FROM jobs WHERE arrangement_id=? AND status IN ('queued','running')").get(row.id),409,'JOB_ACTIVE','Cancele ou aguarde os trabalhos de áudio antes de excluir.');
        db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).run(row.id,req.userId);audit(db,req.userId,table,row.id,'delete');
      });await files.collect(req.userId);res.sendStatus(204);
    });
  }
  app.post('/api/arrangements',files.middleware,async(req,res)=>{
    const data=arrangementSchema.parse(metadata(req)),file=await files.stage(req,'audio');
    const entityId=transaction(db,()=>{
      files.insert(file);const entityId=createEntity(db,'arrangements',data,req.userId,{file_id:file.id,duration:file.metadata.format.duration});
      db.prepare('INSERT INTO arrangement_versions VALUES (?,?,?,?,?,?)').run(id(),req.userId,entityId,file.id,1,now());return entityId;
    });file.committed=true;res.status(201).json(entity(db,'arrangements',entityId,req.userId));
  });
  app.patch('/api/arrangements/:id',files.middleware,async(req,res)=>{
    owned(db,'arrangements',req.params.id,req.userId);const data=metadata(req),file=req.file?await files.stage(req,'audio'):null;
    const output=transaction(db,()=>{
      if(file)files.insert(file);
      const result=updateEntity(db,'arrangements',req.params.id,data,req.userId,file?{file_id:file.id,duration:file.metadata.format.duration}:{});
      if(file){const n=db.prepare('SELECT MAX(number) n FROM arrangement_versions WHERE arrangement_id=?').get(req.params.id).n+1;db.prepare('INSERT INTO arrangement_versions VALUES (?,?,?,?,?,?)').run(id(),req.userId,req.params.id,file.id,n,now());}
      return result;
    });if(file)file.committed=true;res.json(output);
  });
  app.get('/api/arrangements/:id/versions',(req,res)=>{
    owned(db,'arrangements',req.params.id,req.userId);
    res.json(db.prepare('SELECT v.id,v.number,v.created_at createdAt,v.file_id fileId,f.original_name fileName,f.size FROM arrangement_versions v JOIN files f ON f.id=v.file_id WHERE v.arrangement_id=? AND v.user_id=? ORDER BY v.number DESC').all(req.params.id,req.userId));
  });
  app.get('/api/projects/:id/versions',(req,res)=>{
    owned(db,'projects',req.params.id,req.userId);res.json(listProjectVersions(db,req.userId,req.params.id));
  });
  app.post('/api/projects/:id/versions',files.middleware,async(req,res)=>{
    owned(db,'projects',req.params.id,req.userId);const data=projectVersionSchema.parse(metadata(req)),file=await files.stage(req,'audio');
    const versionId=transaction(db,()=>{
      const project=owned(db,'projects',req.params.id,req.userId);files.insert(file);
      const number=(db.prepare('SELECT COALESCE(MAX(number),0) n FROM project_versions WHERE project_id=?').get(project.id).n||0)+1;
      const versionId=id();db.prepare('INSERT INTO project_versions(id,user_id,project_id,file_id,label,number,notes,status,sent_at,created_at) VALUES (?,?,?,?,?,?,?,?,NULL,?)').run(versionId,req.userId,project.id,file.id,data.label,number,data.notes,data.status,now());
      db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(),project.id);
      addProjectEvent(db,req.userId,project.id,'version-added',`${data.label} adicionada ao projeto.`,{number,status:data.status});
      audit(db,req.userId,'project_versions',versionId,'create',{projectId:project.id});return versionId;
    });file.committed=true;res.status(201).json(listProjectVersions(db,req.userId,req.params.id).find(v=>v.id===versionId));
  });
  app.patch('/api/projects/:projectId/versions/:versionId',(req,res)=>{
    const schema=z.object({label:z.string().trim().min(1).max(120).optional(),notes:z.string().trim().max(4000).optional(),status:z.enum(['Protótipo','Revisão','Aprovado','Master']).optional()}).strict().refine(v=>Object.keys(v).length>0,'Informe uma alteração.');
    const data=schema.parse(req.body);
    transaction(db,()=>{
      owned(db,'projects',req.params.projectId,req.userId);const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(req.params.versionId,req.params.projectId,req.userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
      const entries=Object.entries(data),map={label:'label',notes:'notes',status:'status'};db.prepare(`UPDATE project_versions SET ${entries.map(([k])=>`${map[k]}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),row.id);
      addProjectEvent(db,req.userId,row.project_id,'version-updated',`Versão ${row.number} atualizada.`,{fields:entries.map(([k])=>k)});
      audit(db,req.userId,'project_versions',row.id,'update',{fields:entries.map(([k])=>k)});
    });res.json(listProjectVersions(db,req.userId,req.params.projectId).find(v=>v.id===req.params.versionId));
  });
  app.post('/api/projects/:projectId/versions/:versionId/sent',(req,res)=>{
    transaction(db,()=>{
      owned(db,'projects',req.params.projectId,req.userId);const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(req.params.versionId,req.params.projectId,req.userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
      db.prepare('UPDATE project_versions SET sent_at=? WHERE id=?').run(now(),row.id);addProjectEvent(db,req.userId,row.project_id,'prototype-sent',`${row.label} marcada como enviada ao cliente.`,{versionId:row.id});audit(db,req.userId,'project_versions',row.id,'sent');
    });res.json(listProjectVersions(db,req.userId,req.params.projectId).find(v=>v.id===req.params.versionId));
  });
  app.delete('/api/projects/:projectId/versions/:versionId',async(req,res)=>{
    transaction(db,()=>{
      const row=db.prepare('SELECT * FROM project_versions WHERE id=? AND project_id=? AND user_id=?').get(req.params.versionId,req.params.projectId,req.userId);assert(row,404,'NOT_FOUND','Versão não encontrada.');
      db.prepare('DELETE FROM project_versions WHERE id=?').run(row.id);addProjectEvent(db,req.userId,row.project_id,'version-deleted',`Versão ${row.number} removida.`,{});audit(db,req.userId,'project_versions',row.id,'delete');
    });await files.collect(req.userId);res.sendStatus(204);
  });
  app.get('/api/files/:id',(req,res,next)=>{
    const file=files.resolve(req.params.id,req.userId);res.type(file.mime);res.set('Cache-Control','private, no-store');
    const inline=req.query.inline==='1',download=req.query.download==='1'||(!inline&&!file.mime.startsWith('audio/'));
    if(download)res.download(file.path,file.original_name,err=>{if(err)next(err);});
    else res.sendFile(file.path,err=>{if(err)next(err);});
  });
  function insertDoc(u,projectId,file,description){
    files.insert(file);const docId=id();db.prepare('INSERT INTO docs VALUES (?,?,?,?,?,?)').run(docId,u,projectId,file.id,description,now());audit(db,u,'docs',docId,'create');addProjectEvent(db,u,projectId,'document-added',`Documento ${file.name || 'financeiro'} adicionado.`,{documentId:docId,description});return docId;
  }
  app.get('/api/documents',(req,res)=>res.json(pagination(req,listDocs(db,req.userId))));
  app.post('/api/documents',files.middleware,async(req,res)=>{
    const data=docSchema.parse(metadata(req));owned(db,'projects',data.projectId,req.userId);const file=await files.stage(req,'document');
    const docId=transaction(db,()=>{
      owned(db,'projects',data.projectId,req.userId);const docId=insertDoc(req.userId,data.projectId,file,data.description);
      db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(),data.projectId);return docId;
    });file.committed=true;res.status(201).json(listDocs(db,req.userId).find(d=>d.id===docId));
  });
  app.delete('/api/documents/:id',async(req,res)=>{
    transaction(db,()=>{
      const doc=db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').get(req.params.id,req.userId);assert(doc,404,'NOT_FOUND','Documento não encontrado.');
      db.prepare('DELETE FROM docs WHERE id=?').run(doc.id);db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=?').run(now(),doc.project_id);addProjectEvent(db,req.userId,doc.project_id,'document-deleted','Documento financeiro removido.',{documentId:doc.id});audit(db,req.userId,'docs',doc.id,'delete');
    });await files.collect(req.userId);res.sendStatus(204);
  });
  app.patch('/api/projects/:id/finance',files.middleware,async(req,res)=>{
    const data=financeSchema.parse(metadata(req));owned(db,'projects',req.params.id,req.userId);const file=req.file?await files.stage(req,'document'):null;
    assert(data.mode!=='replace'||file,400,'FILE_REQUIRED','Selecione o novo documento antes de substituir os anteriores.');
    transaction(db,()=>{
      updateEntity(db,'projects',req.params.id,{paid:data.paid,...(data.paymentDueDate!==undefined?{paymentDueDate:data.paymentDueDate}:{}),version:data.version},req.userId);
      if(file){if(data.mode==='replace')db.prepare('DELETE FROM docs WHERE project_id=? AND user_id=?').run(req.params.id,req.userId);insertDoc(req.userId,req.params.id,file,data.description);}
    });if(file)file.committed=true;await files.collect(req.userId);res.json({project:entity(db,'projects',req.params.id,req.userId),docs:listDocs(db,req.userId).filter(d=>d.projectId===req.params.id),summary:financeSummary(db,req.userId)});
  });
  app.post('/api/projects/:id/whatsapp',(req,res)=>{
    const project=entity(db,'projects',req.params.id,req.userId),client=entity(db,'clients',project.clientId,req.userId);
    const data=z.object({versionId:z.uuid().optional(),message:z.string().trim().max(2000).optional()}).strict().parse(req.body);
    const phone=(client.whatsapp||client.phone||'').replace(/\D/g,'');assert(phone,422,'WHATSAPP_REQUIRED','Cadastre o WhatsApp do cliente.');
    const version=data.versionId?listProjectVersions(db,req.userId,project.id).find(v=>v.id===data.versionId):null;if(data.versionId)assert(version,404,'NOT_FOUND','Versão não encontrada.');
    const message=data.message||`Olá, ${client.name}! Estou enviando ${version?`a versão ${version.label}`:'uma nova versão'} do projeto ${project.name} para sua avaliação.`;
    res.json({url:`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,message,client:{name:client.name,whatsapp:client.whatsapp||client.phone},version});
  });
  app.post('/api/search',async(req,res)=>{const data=searchSchema.parse(req.body);res.json(await search(db,config,req.userId,data.query,data.limit));});
  app.post('/api/assistant/message',(req,res)=>res.json(interpret(db,req.userId,messageSchema.parse(req.body).message)));
  app.post('/api/assistant/actions/:id/confirm',(req,res)=>{
    const output=transaction(db,()=>{
      const action=db.prepare('SELECT * FROM assistant_actions WHERE id=? AND user_id=?').get(req.params.id,req.userId);
      assert(action&&!action.consumed_at&&action.expires_at>Date.now(),409,'ACTION_EXPIRED','A proposta expirou ou já foi utilizada. Envie o comando novamente.');
      const data=JSON.parse(action.payload);let output;
      if(data.kind==='create-project'){
        const projectId=createEntity(db,'projects',data.data,req.userId);output=entity(db,'projects',projectId,req.userId);
      } else {
        output=updateEntity(db,data.table,data.entityId,{...data.patch,version:data.version},req.userId,{},'assistant');
      }
      db.prepare('UPDATE assistant_actions SET consumed_at=? WHERE id=?').run(now(),action.id);return output;
    });res.json({message:'Alteração salva.',record:output});
  });
  app.get('/api/capabilities',async(req,res)=>{await worker.ready;res.json({audio:worker.capabilities(),semanticConfigured:!!config.ollamaUrl});});
  app.get('/api/jobs',(req,res)=>res.json(listJobs(db,req.userId)));
  app.post('/api/jobs',async(req,res)=>{await worker.ready;const data=jobSchema.parse(req.body);const jobId=transaction(db,()=>worker.enqueue(req.userId,data.arrangementId,data.type));res.status(202).json(listJobs(db,req.userId).find(j=>j.id===jobId));});
  app.post('/api/jobs/:id/cancel',(req,res)=>{worker.cancel(req.userId,req.params.id);res.json({status:'cancelled'});});
  app.delete('/api/jobs/:id',async(req,res)=>{
    transaction(db,()=>{
      const job=db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(req.params.id,req.userId);assert(job,404,'NOT_FOUND','Trabalho não encontrado.');assert(!['queued','running'].includes(job.status),409,'JOB_ACTIVE','Cancele ou aguarde o trabalho antes de excluir.');
      db.prepare('DELETE FROM jobs WHERE id=?').run(job.id);audit(db,req.userId,'jobs',job.id,'delete');
    });await files.collect(req.userId);res.sendStatus(204);
  });
  app.get('/api/audit',(req,res)=>res.json(pagination(req,db.prepare('SELECT entity,entity_id entityId,action,details,created_at createdAt FROM audit WHERE user_id=? ORDER BY created_at DESC LIMIT 1000').all(req.userId).map(r=>({...r,details:JSON.parse(r.details)})))));
  app.get('/api/export',(req,res)=>{
    const projects=listProjects(db,req.userId);res.attachment('sonota-dados.json').json({exportedAt:now(),profile:profile(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)),clients:listClients(db,req.userId),arrangements:listArrangements(db,req.userId),projects,projectVersions:Object.fromEntries(projects.map(p=>[p.id,listProjectVersions(db,req.userId,p.id)])),projectHistory:listProjectEvents(db,req.userId,null,5000),docs:listDocs(db,req.userId),jobs:listJobs(db,req.userId)});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Endpoint não encontrado.'}}));
  const ionicDir=path.join(config.publicDir,'ionic');
  if(existsSync(path.join(ionicDir,'index.html'))){
    app.use('/app',express.static(ionicDir,{dotfiles:'deny',etag:true,maxAge:0}));
    app.get('/app/*splat',(req,res)=>res.sendFile(path.join(ionicDir,'index.html')));
    app.get('/',(req,res)=>res.redirect('/app/'));
  }
  app.use(express.static(config.publicDir,{dotfiles:'deny',etag:true,maxAge:0}));
  app.use((req,res)=>res.status(404).type('text').send('Página não encontrada.'));
  app.use((err,req,res,next)=>{
    if(res.headersSent)return next(err);
    if(err instanceof ZodError){
      const labels={name:'Nome',title:'Nome do arranjo',email:'E-mail',clientId:'Cliente',arrangementId:'Arranjo',description:'Descrição',proposal:'Proposta / briefing',objective:'Objetivo',references:'Referências',musicalStyle:'Estilo musical',instruments:'Instrumentos',status:'Status',value:'Valor',dueDate:'Prazo',paymentDueDate:'Vencimento',bpm:'BPM',key:'Tonalidade',genre:'Gênero',tags:'Tags',phone:'Telefone',whatsapp:'WhatsApp',document:'CPF / CNPJ',city:'Cidade',notes:'Observações',version:'Versão'};
      const details=err.issues.map(i=>({field:i.path.join('.'),message:i.message}));
      const first=details[0];const field=labels[first?.field]||first?.field||'Campo';
      return res.status(422).json({error:{code:'VALIDATION_ERROR',message:`Não foi possível salvar. ${field}: ${first?.message||'valor inválido.'}`,details}});
    }
    if(err instanceof AppError)return res.status(err.status).json({error:{code:err.code,message:err.message,details:err.details}});
    if(err.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:{code:err.code,message:`O arquivo excede o limite de ${config.maxFileBytes/1024/1024} MB.`}});
    if(err.name==='MulterError')return res.status(400).json({error:{code:err.code,message:'Upload inválido. Envie um arquivo e seus metadados.'}});
    if(err.type==='entity.parse.failed')return res.status(400).json({error:{code:'INVALID_JSON',message:'JSON inválido.'}});
    if(err.type==='entity.too.large')return res.status(413).json({error:{code:'BODY_TOO_LARGE',message:'Requisição muito grande.'}});
    if(err.code==='ENOENT')return res.status(404).json({error:{code:'FILE_NOT_FOUND',message:'Arquivo não encontrado no servidor.'}});
    console.error('[request]',err);
    res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Não foi possível concluir a operação. Consulte o terminal do servidor.'}});
  });
  return {app,db,config,worker,async close(){await worker.close();db.close();release();}};
}
