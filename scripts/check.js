import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
let count=0;
function scan(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,item.name);if(item.isDirectory())scan(name);else if(name.endsWith('.js')){const result=spawnSync(process.execPath,['--check',name],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);count++;}}}
for(const dir of ['src','public','scripts','tests'])scan(dir);
console.log(`${count} arquivos JavaScript verificados.`);
