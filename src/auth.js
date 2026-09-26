import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { now } from './db.js';
import { AppError, assert } from './errors.js';
const scryptAsync = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64, parameters);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [,salt,hex] = (encoded || '').split('$');
  const key = await scryptAsync(password, salt || 'sonota-invalid-user', 64, parameters);
  const expected = Buffer.from(hex || '00'.repeat(64), 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected) && !!salt;
}
export function cookieOptions(config) { return {httpOnly:true,secure:config.secureCookie,sameSite:'lax',path:'/'}; }
export function createSession(db,config,userId,res) {
  const token=randomBytes(32).toString('base64url'), csrf=randomBytes(32).toString('base64url');
  const maxAge=config.sessionHours*3600000;
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(digest(token),userId,csrf,Date.now()+maxAge,now());
  res.cookie('sonota_session',token,{...cookieOptions(config),maxAge});
  return csrf;
}
export function readSession(db,req) {
  const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('sonota_session='))?.slice(15);
  if(!token || token.length>100) return null;
  return db.prepare('SELECT s.*,u.email,u.name,u.role,u.studio,u.version FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?').get(digest(token),Date.now());
}
export function requireAuth(db) {
  return (req,res,next)=>{
    const session=readSession(db,req);
    if(!session) return next(new AppError(401,'UNAUTHENTICATED','Entre na sua conta para continuar.'));
    req.session=session;req.userId=session.user_id;
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const supplied=req.headers['x-csrf-token'];
      if(typeof supplied!=='string'||supplied!==session.csrf) return next(new AppError(403,'CSRF_INVALID','Sessão desatualizada. Recarregue a página.'));
    }
    next();
  };
}
export function originGuard(config) {
  return (req,res,next)=>{
    const origin=req.headers.origin;
    if(origin && !config.origins.includes(origin)) return next(new AppError(403,'ORIGIN_NOT_ALLOWED','Origem não autorizada para esta aplicação.'));
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.vary('Origin');}
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-CSRF-Token,If-Match');return res.sendStatus(204);}
    if(!['GET','HEAD'].includes(req.method)) assert(req.headers['sec-fetch-site']!=='cross-site'||!!origin,403,'CROSS_SITE','Requisição não autorizada.');
    next();
  };
}
