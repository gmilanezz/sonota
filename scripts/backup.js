import { mkdir,cp,access,rm } from 'node:fs/promises';
import { DatabaseSync,backup } from 'node:sqlite';
import path from 'node:path';
import { getConfig,ROOT } from '../src/config.js';
import { acquireLock } from '../src/lock.js';
const config=getConfig();
await access(path.join(config.dataDir,'sonota.sqlite'));
// O mesmo bloqueio do servidor impede gravações durante a cópia dos arquivos.
const release=acquireLock(config);
const destination=path.join(process.argv[2]?path.resolve(process.argv[2]):path.join(ROOT,'backups'),'sonota-'+new Date().toISOString().replace(/[:.]/g,'-'));
let db;
try{
 await mkdir(destination,{recursive:true});
 db=new DatabaseSync(path.join(config.dataDir,'sonota.sqlite'),{readOnly:true});
 await backup(db,path.join(destination,'sonota.sqlite'));
 await cp(path.join(config.dataDir,'uploads'),path.join(destination,'uploads'),{recursive:true});
 console.log('Backup concluído:',destination);
 console.log('Guarde a pasta completa. Ela contém os dados e arquivos de todas as contas.');
}catch(error){await rm(destination,{recursive:true,force:true});throw error;}
finally{db?.close();release();}
