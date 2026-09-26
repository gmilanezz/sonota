import multer from 'multer';
import path from 'node:path';
import { mkdirSync, createReadStream } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseFile } from 'music-metadata';
import { id, now } from './db.js';
import { assert } from './errors.js';
const TYPES={'.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.flac':'audio/flac','.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.xml':'application/xml','.zip':'application/zip','.mid':'audio/midi','.musicxml':'application/vnd.recordare.musicxml+xml'};
export function storage(config,db) {
  const dir=path.join(config.dataDir,'uploads'), tmp=path.join(config.dataDir,'tmp');
  mkdirSync(dir,{recursive:true,mode:0o700});mkdirSync(tmp,{recursive:true,mode:0o700});
  const upload=multer({storage:multer.diskStorage({destination:tmp,filename:(req,file,cb)=>cb(null,id())}),limits:{fileSize:config.maxFileBytes,files:1,fields:3,fieldSize:100000,parts:4}}).single('file');
  function middleware(req,res,next) {
    const clean=()=>{
      if(req.file?.path) void rm(req.file.path,{force:true}).catch(()=>{});
      if(req.staged && !req.staged.committed) void rm(req.staged.path,{force:true}).catch(()=>{});
    };
    res.once('finish',clean);res.once('close',clean);
    upload(req,res,next);
  }
  function quota(u,size) {
    const used=db.prepare('SELECT COALESCE(SUM(size),0) AS used FROM files WHERE user_id=?').get(u).used;
    assert(used+size<=config.quotaBytes,413,'STORAGE_QUOTA','O limite de armazenamento da conta foi atingido.');
  }
  async function hashFile(filePath) { const hash=createHash('sha256');for await (const chunk of createReadStream(filePath))hash.update(chunk);return hash.digest('hex'); }
  async function stage(req,kind) {
    const f=req.file;assert(f,400,'FILE_REQUIRED','Selecione um arquivo.');
    let original=f.originalname;
    // Navegadores enviam nomes UTF-8; o multipart pode entregá-los como Latin-1.
    if([...original].every(c=>c.charCodeAt(0)<=255)){try{original=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(original,'latin1'));}catch{}}
    const name=path.basename(original.replaceAll('\\','/')).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200);
    const ext=path.extname(name).toLowerCase();
    const audio=kind==='audio';
    assert((audio?['.mp3','.wav','.ogg','.flac']:['.pdf','.png','.jpg','.jpeg','.xml']).includes(ext),415,'UNSUPPORTED_FILE',audio?'Use MP3, OGG, WAV ou FLAC.':'Use PDF, PNG, JPG ou XML.');
    assert(f.size>0,400,'EMPTY_FILE','O arquivo está vazio.');quota(req.userId,f.size);
    const handle=await open(f.path,'r');const b=Buffer.alloc(Math.min(f.size,4096));await handle.read(b,0,b.length,0);await handle.close();
    const signature=ext==='.wav'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE':ext==='.ogg'?b.toString('ascii',0,4)==='OggS':ext==='.flac'?b.toString('ascii',0,4)==='fLaC':ext==='.mp3'?b.toString('ascii',0,3)==='ID3'||b[0]===255&&(b[1]&224)===224:ext==='.pdf'?b.toString('ascii',0,5)==='%PDF-':['.jpg','.jpeg'].includes(ext)?b[0]===255&&b[1]===216&&b[2]===255:ext==='.png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b.toString('utf8').trimStart().startsWith('<');
    assert(signature,415,'FILE_SIGNATURE','O conteúdo do arquivo não corresponde ao formato informado.');
    let metadata=null;
    if(audio){
      try {metadata=await parseFile(f.path,{duration:true,skipCovers:true});} catch {assert(false,422,'INVALID_AUDIO','Não foi possível ler esse áudio. Verifique o arquivo.');}
      assert(metadata.format.duration>0&&metadata.format.numberOfChannels>0,422,'INVALID_AUDIO','O áudio não possui duração ou canais válidos.');
    }
    const fileId=id(), storageName=fileId+ext, destination=path.join(dir,storageName);
    const sha256=await hashFile(f.path);await rename(f.path,destination);
    const record={id:fileId,userId:req.userId,path:destination,storageName,name,mime:TYPES[ext],size:f.size,sha256,metadata};
    req.staged=record;return record;
  }
  function insert(record) {
    quota(record.userId,record.size);
    db.prepare('INSERT INTO files VALUES (?,?,?,?,?,?,?,?)').run(record.id,record.userId,record.storageName,record.name,record.mime,record.size,record.sha256,now());
  }
  async function generated(userId,source,name) {
    const info=await stat(source);quota(userId,info.size);
    const ext=path.extname(name).toLowerCase(),fileId=id(),storageName=fileId+ext,destination=path.join(dir,storageName);
    const sha256=await hashFile(source);await rename(source,destination);
    return {id:fileId,userId,path:destination,storageName,name,mime:TYPES[ext]||'application/octet-stream',size:info.size,sha256};
  }
  function resolve(fileId,userId) {
    const f=db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(fileId,userId);
    assert(f,404,'FILE_NOT_FOUND','Arquivo não encontrado.');return {...f,path:path.join(dir,f.storage_name)};
  }
  async function collect(userId) {
    const orphans=db.prepare(`SELECT * FROM files f WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM arrangements WHERE file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM arrangement_versions WHERE file_id=f.id) AND NOT EXISTS(SELECT 1 FROM docs WHERE file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM jobs WHERE source_file_id=f.id OR output_file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM users WHERE avatar_file_id=f.id)`).all(userId);
    for(const f of orphans){db.prepare('DELETE FROM files WHERE id=?').run(f.id);await rm(path.join(dir,f.storage_name),{force:true}).catch(()=>{});}
  }
  return {middleware,stage,insert,generated,resolve,collect,dir};
}
