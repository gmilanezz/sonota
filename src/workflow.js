import { id, now } from './db.js';

export function addProjectEvent(db,userId,projectId,type,message,details={}) {
  db.prepare('INSERT INTO project_events(id,user_id,project_id,type,message,details,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id(),userId,projectId,type,message,JSON.stringify(details),now());
}

export function listProjectEvents(db,userId,projectId=null,limit=100) {
  const rows=projectId
    ? db.prepare('SELECT * FROM project_events WHERE user_id=? AND project_id=? ORDER BY created_at DESC LIMIT ?').all(userId,projectId,limit)
    : db.prepare('SELECT * FROM project_events WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(userId,limit);
  return rows.map(r=>({id:r.id,projectId:r.project_id,type:r.type,message:r.message,details:JSON.parse(r.details||'{}'),createdAt:r.created_at}));
}

export function listProjectVersions(db,userId,projectId) {
  return db.prepare(`SELECT v.*,f.original_name,f.mime,f.size
    FROM project_versions v JOIN files f ON f.id=v.file_id
    WHERE v.user_id=? AND v.project_id=? ORDER BY v.number DESC`).all(userId,projectId).map(r=>({
      id:r.id,projectId:r.project_id,fileId:r.file_id,fileName:r.original_name,fileType:r.mime,size:r.size,
      label:r.label,number:r.number,notes:r.notes,status:r.status,sentAt:r.sent_at,createdAt:r.created_at
    }));
}

export function studioFlow(db,userId,reference=new Date()) {
  const received=new Map(db.prepare(`SELECT substr(paid_at,1,7) month,COALESCE(SUM(value_cents),0) cents
    FROM projects WHERE user_id=? AND paid=1 AND paid_at IS NOT NULL GROUP BY substr(paid_at,1,7)`).all(userId).map(r=>[r.month,r.cents]));
  const created=new Map(db.prepare(`SELECT substr(created_at,1,7) month,COUNT(*) count
    FROM projects WHERE user_id=? GROUP BY substr(created_at,1,7)`).all(userId).map(r=>[r.month,r.count]));
  const completed=new Map(db.prepare(`SELECT substr(completed_at,1,7) month,COUNT(*) count
    FROM projects WHERE user_id=? AND status='Concluído' AND completed_at IS NOT NULL GROUP BY substr(completed_at,1,7)`).all(userId).map(r=>[r.month,r.count]));
  return Array.from({length:6},(_,i)=>{
    const d=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth()-5+i,1));
    const month=d.toISOString().slice(0,7);
    return {month,label:d.toLocaleDateString('pt-BR',{month:'short',timeZone:'UTC'}).replace('.',''),received:(received.get(month)||0)/100,created:created.get(month)||0,completed:completed.get(month)||0};
  });
}

export function operationalAlerts(db,userId,reference=new Date()) {
  const today=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth(),reference.getUTCDate()));
  const projects=db.prepare(`SELECT p.*,c.name client_name,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id) version_count,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id AND v.sent_at IS NOT NULL) sent_count,
    (SELECT COUNT(*) FROM docs d WHERE d.project_id=p.id) doc_count
    FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.user_id=?`).all(userId);
  const alerts=[];
  const add=(p,type,priority,title,detail)=>alerts.push({id:`${type}:${p.id}`,type,priority,projectId:p.id,title,detail});
  for(const p of projects){
    if(p.status==='Cancelado')continue;
    if(p.due_date){
      const due=new Date(`${p.due_date}T12:00:00Z`);const days=Math.ceil((due-today)/86400000);
      if(days<0&&p.status!=='Concluído')add(p,'overdue',1,p.name,`Entrega atrasada há ${Math.abs(days)} dia(s).`);
      else if(days<=2&&days>=0&&p.status!=='Concluído')add(p,'due-soon',2,p.name,days===0?'Entrega hoje.':days===1?'Entrega amanhã.':`Entrega em ${days} dias.`);
    }
    if(p.version_count>0&&p.sent_count===0&&['Em produção','Revisão'].includes(p.status))add(p,'prototype',3,p.name,'Há protótipo cadastrado ainda não marcado como enviado.');
    if(p.status==='Concluído'&&!p.paid)add(p,'payment',2,p.name,'Projeto concluído com pagamento pendente.');
    if(p.payment_due_date&&!p.paid){const pd=new Date(`${p.payment_due_date}T12:00:00Z`);if(pd<today)add(p,'payment-overdue',1,p.name,'Pagamento em atraso.');}
    if(p.status==='Concluído'&&p.doc_count===0)add(p,'invoice',3,p.name,'Projeto concluído sem nota fiscal/anexo financeiro.');
    if(!p.arrangement_id&&p.status!=='Proposta')add(p,'arrangement',4,p.name,'Projeto sem arranjo associado.');
    if(p.status==='Revisão')add(p,'review',4,p.name,'Projeto em revisão aguardando ação.');
  }
  return alerts.sort((a,b)=>a.priority-b.priority||a.title.localeCompare(b.title,'pt-BR')).slice(0,12);
}

export function upcomingDeliveries(db,userId,reference=new Date()) {
  const today=reference.toISOString().slice(0,10);
  return db.prepare(`SELECT p.id,p.name,p.due_date,p.status,c.name client_name
    FROM projects p JOIN clients c ON c.id=p.client_id
    WHERE p.user_id=? AND p.status NOT IN ('Concluído','Cancelado') AND p.due_date<>''
    ORDER BY p.due_date ASC LIMIT 12`).all(userId).map(r=>({
      projectId:r.id,name:r.name,dueDate:r.due_date,status:r.status,client:r.client_name,overdue:r.due_date<today
    }));
}
