import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './config.js';
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function openDatabase(config) {
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(config.dataDir, 'sonota.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  for (const name of readdirSync(path.join(ROOT, 'src/migrations')).filter(x => x.endsWith('.sql')).sort()) {
    if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get(name)) {
      transaction(db, () => {
        db.exec(readFileSync(path.join(ROOT, 'src/migrations', name), 'utf8'));
        db.prepare('INSERT INTO migrations VALUES (?,?)').run(name, now());
      });
    }
  }
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function audit(db, userId, entity, entityId, action, details = {}) {
  db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?,?)').run(id(), userId, entity, entityId, action, JSON.stringify(details), now());
}
const base = row => ({ id: row.id, version: row.version, createdAt: row.created_at.slice(0,10), updatedAt: row.updated_at });
export function serializeClient(r) {
  return {...base(r), name:r.name, type:r.type, company:r.company, email:r.email, phone:r.phone, whatsapp:r.whatsapp || '', document:r.document, city:r.city, notes:r.notes, status:r.status};
}
export function serializeArrangement(r) {
  return {...base(r), title:r.title, fileId:r.file_id, fileName:r.original_name, fileType:r.original_name.split('.').pop().toUpperCase(), size:r.size, bpm:r.bpm, key:r.musical_key, genre:r.genre, instruments:JSON.parse(r.instruments), tags:JSON.parse(r.tags), notes:r.notes, duration:r.duration};
}
export function serializeProject(r) {
  return {...base(r), name:r.name, clientId:r.client_id, arrangementId:r.arrangement_id || '', description:r.description || '', proposal:r.proposal,
    objective:r.objective || '', references:r.references_text || '', musicalStyle:r.musical_style || '', instruments:JSON.parse(r.instruments || '[]'),
    status:r.status, value:r.value_cents / 100, dueDate:r.due_date, paymentDueDate:r.payment_due_date || '', paid:!!r.paid,
    paidAt:r.paid_at || null, completedAt:r.completed_at || null};
}
export function profile(r) {
  let prefs={deadlines:true,payments:true,prototypes:true,documents:true};
  try{prefs={...prefs,...JSON.parse(r.notification_preferences||'{}')}}catch{}
  return {id:r.id, name:r.name, email:r.email, role:r.role, studio:r.studio, phone:r.phone || '', avatarFileId:r.avatar_file_id || '', notificationPreferences:prefs, version:r.version};
}
export function listClients(db, u) { return db.prepare('SELECT * FROM clients WHERE user_id=? ORDER BY created_at DESC,id').all(u).map(serializeClient); }
export function listArrangements(db, u) { return db.prepare('SELECT a.*,f.original_name,f.size FROM arrangements a JOIN files f ON f.id=a.file_id WHERE a.user_id=? ORDER BY a.created_at DESC,a.id').all(u).map(serializeArrangement); }
export function listProjects(db,u) { return db.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY created_at DESC,id').all(u).map(serializeProject); }
export function listDocs(db,u) { return db.prepare('SELECT d.*,f.original_name,f.mime,f.size FROM docs d JOIN files f ON f.id=d.file_id WHERE d.user_id=? ORDER BY d.created_at DESC').all(u).map(r => ({id:r.id,projectId:r.project_id,fileId:r.file_id,fileName:r.original_name,fileType:r.mime,size:r.size,date:r.created_at.slice(0,10),description:r.description})); }
export function listJobs(db,u) { return db.prepare('SELECT j.*,f.original_name FROM jobs j LEFT JOIN files f ON f.id=j.output_file_id WHERE j.user_id=? ORDER BY j.created_at DESC').all(u).map(r => ({id:r.id,arrangementId:r.arrangement_id,type:r.type,status:r.status,fileId:r.output_file_id,fileName:r.original_name || '',date:r.created_at.slice(0,10),error:r.error,result:r.result?JSON.parse(r.result):null,updatedAt:r.updated_at})); }
export function financeSummary(db,u) {
  const r = db.prepare(`SELECT COALESCE(SUM(CASE WHEN paid=1 THEN value_cents ELSE 0 END),0) received,
   COALESCE(SUM(CASE WHEN paid=0 AND status='Concluído' THEN value_cents ELSE 0 END),0) receivable,
   COALESCE(SUM(CASE WHEN paid=0 AND status NOT IN ('Concluído','Cancelado') THEN value_cents ELSE 0 END),0) forecast
   FROM projects WHERE user_id=?`).get(u);
  return {received:r.received/100,receivable:r.receivable/100,forecast:r.forecast/100};
}
export function projectActivity(db,u,reference=new Date()) {
  const counts=new Map(db.prepare("SELECT substr(created_at,1,7) month,COUNT(*) count FROM projects WHERE user_id=? GROUP BY substr(created_at,1,7)").all(u).map(r=>[r.month,r.count]));
  return Array.from({length:6},(_,i)=>{
    const d=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth()-5+i,1));
    const month=d.toISOString().slice(0,7);
    return {month,label:d.toLocaleDateString('pt-BR',{month:'short',timeZone:'UTC'}).replace('.',''),count:counts.get(month)||0};
  });
}
