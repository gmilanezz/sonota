import { createApp } from './app.js';
if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Use Node.js 24 LTS para executar este projeto.');
const runtime=createApp();
const server=runtime.app.listen(runtime.config.port,runtime.config.host,()=>{
 console.log(`Sonota pronto em http://localhost:${runtime.config.port}`);
 console.log('Crie sua conta na tela de acesso. Ctrl+C encerra o servidor.');
});
server.requestTimeout=120000;
server.on('error',async error=>{console.error('Não foi possível iniciar o Sonota:',error.message);await runtime.close();process.exitCode=1;});
let closing=false;
async function stop(){if(closing)return;closing=true;server.close(async()=>{await runtime.close();});server.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
