import { normalize,similarity } from './search.js';
import { listClients,listArrangements,listProjects,financeSummary,id } from './db.js';
import { definitions } from './entities.js';
import { updateSchema } from './validation.js';
import { listProjectVersions } from './workflow.js';

function identify(items,text,label) {
  const q=normalize(text).replace(/[^a-z0-9]+/g,' ').trim(),words=q.split(' ');
  const ranked=items.map(item=>{
    const name=normalize(item[label]).replace(/[^a-z0-9]+/g,' ').trim();
    const parts=name.split(' ');let score=(` ${q} `).includes(` ${name} `)?1:0;
    for(let size=Math.max(1,parts.length-1);size<=parts.length+1;size++)for(let i=0;i<=words.length-size;i++)score=Math.max(score,similarity(name,words.slice(i,i+size).join(' ')));
    const unique=parts.some(p=>p.length>=4&&words.some(w=>similarity(p,w)>=.86)&&items.filter(other=>normalize(other[label]).split(' ').some(w=>similarity(p,w)>=.86)).length===1);
    if(unique)score=Math.max(score,.79);
    return {item,score};
  }).sort((a,b)=>b.score-a.score);
  if(!ranked[0]||ranked[0].score<.72)return {message:'Não identifiquei o registro. Escreva o nome do cliente, projeto ou arranjo.'};
  if(ranked[1]&&ranked[0].score-ranked[1].score<.09)return {message:`Encontrei nomes parecidos: ${ranked.slice(0,3).map(r=>r.item[label]).join(', ')}. Informe o nome completo para escolher.`};
  return {item:ranked[0].item};
}

const projectStatuses=[['Cancelado',/\b(cancelad[oa]|cancelar|cancela)\b/],['Concluído',/\b(concluid[oa]|concluir|finalizad[oa]|finalizar|pronto)\b/],['Revisão',/\b(revisao|revisar)\b/],['Em produção',/\b(producao|andamento|produzindo)\b/],['Proposta',/\b(proposta|cotacao)\b/]];
const clientStatuses=[['Inativo',/\b(inativ[oa]|desativad[oa])\b/],['Pausado',/\b(pausad[oa]|suspenso)\b/],['Prospect',/\b(prospect|prospecto|potencial)\b/],['Ativo',/\b(ativ[oa]|habilitado)\b/]];
const brl=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function parseAmount(text){
  const match=text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);if(!match)return null;
  let amount=match[1];if(amount.includes(','))amount=amount.replaceAll('.','').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(amount))amount=amount.replaceAll('.','');
  const value=Number(amount);return Number.isFinite(value)?value:null;
}
function saveAction(db,userId,payload){
  const actionId=id();db.prepare('DELETE FROM assistant_actions WHERE expires_at<? OR consumed_at IS NOT NULL').run(Date.now());
  db.prepare('INSERT INTO assistant_actions VALUES (?,?,?,?,NULL)').run(actionId,userId,JSON.stringify(payload),Date.now()+5*60000);return actionId;
}
function queryResponse(db,userId,text,q){
  const projects=listProjects(db,userId),arrangements=listArrangements(db,userId);
  if(/\bquanto\b.*\b(receber|pendente|aberto)\b|\b(a receber|recebimentos?)\b/.test(q)){
    const f=financeSummary(db,userId);return {message:`Você tem ${brl(f.receivable)} de projetos concluídos a receber e ${brl(f.forecast)} em previsão de projetos em andamento.`};
  }
  if(/\b(qual|quais).*\b(projeto|entrega).*\b(vence|vencem|prazo|primeiro|proximo)\b|\bproxima entrega\b/.test(q)){
    const rows=projects.filter(p=>p.dueDate&&!['Concluído','Cancelado'].includes(p.status)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    if(!rows.length)return {message:'Não há entregas futuras cadastradas.'};const p=rows[0];return {message:`A entrega mais próxima é “${p.name}”, em ${p.dueDate.split('-').reverse().join('/')}, com status ${p.status}.`};
  }
  if(/\b(quais|listar|lista|mostrar|mostra|ver)\b.*\bprojetos?\b/.test(q)){
    const status=projectStatuses.find(([,re])=>re.test(q))?.[0];const rows=status?projects.filter(p=>p.status===status):projects;
    return {message:rows.map(p=>`${p.name} — ${p.status}${p.dueDate?` — ${p.dueDate.split('-').reverse().join('/')}`:''}`).join('\n')||`Nenhum projeto${status?` em ${status}`:''} cadastrado.`};
  }
  if(/\b(arranjos?|musicas?|sons?)\b/.test(q)&&/\b(procura|procurar|buscar|busca|quais|mostrar|mostra|entre|bpm)\b/.test(q)){
    const range=q.match(/(\d{2,3})\s*(?:a|ate|-)\s*(\d{2,3})\s*bpm|bpm\s*(?:entre\s*)?(\d{2,3})\s*(?:a|ate|-)\s*(\d{2,3})/);
    const single=q.match(/(?:aprox(?:imadamente)?\s*)?(\d{2,3})\s*bpm|bpm\s*(?:de\s*)?(\d{2,3})/);
    let rows=arrangements;
    if(range){const min=Number(range[1]||range[3]),max=Number(range[2]||range[4]);rows=rows.filter(a=>a.bpm!=null&&a.bpm>=Math.min(min,max)&&a.bpm<=Math.max(min,max));}
    else if(single){const n=Number(single[1]||single[2]);rows=rows.filter(a=>a.bpm!=null&&Math.abs(a.bpm-n)<=5);}
    return {message:rows.slice(0,12).map(a=>`${a.title}${a.bpm?` — ${a.bpm} BPM`:''}${a.key?` — ${a.key}`:''}`).join('\n')||'Nenhum arranjo compatível foi encontrado.'};
  }
  if(/\b(ultima|versao final|master|versao)\b/.test(q)&&/\b(onde|qual|arquivo|projeto)\b/.test(q)){
    const found=identify(projects,text,'name');if(!found.item)return found;const versions=listProjectVersions(db,userId,found.item.id);
    if(!versions.length)return {message:`O projeto “${found.item.name}” ainda não possui versões cadastradas.`};
    const v=versions.find(x=>x.status==='Master')||versions.find(x=>x.status==='Aprovado')||versions[0];return {message:`A versão mais relevante de “${found.item.name}” é ${v.label} (V${v.number}, ${v.status}), arquivo “${v.fileName}”. Abra o projeto para baixar ou enviar.`};
  }
  return null;
}
function createProjectProposal(db,userId,text,q){
  if(!/^\s*(cria|criar|crie|novo|cadastra|cadastre)\b/.test(q)||!(/\bprojeto\b/.test(q)))return null;
  const clients=listClients(db,userId),arrangements=listArrangements(db,userId);const client=identify(clients,text,'name');if(!client.item)return {message:'Para criar o projeto, informe claramente um cliente já cadastrado.'};
  let arrangement=null;if(/\b(arranjo|utilizando|usando|com)\b/.test(q)){const hit=identify(arrangements,text,'title');if(hit.item)arrangement=hit.item;}
  const nameMatch=text.match(/(?:projeto\s+(?:chamado|nomeado)?\s*)([\p{L}\d][\p{L}\d ._-]{2,80}?)(?=\s+(?:para|do cliente|com|usando|utilizando|no valor|por r\$)|[,.;]|$)/iu);
  const valueMatch=text.match(/(?:no valor de|valor de|por)\s*(r\$\s*[\d.,]+)/i);const value=valueMatch?parseAmount(valueMatch[1]):0;
  let name=nameMatch?.[1]?.trim();if(!name||normalize(name)==='para')name=arrangement?.title?`${arrangement.title} — ${client.item.name}`:`Projeto — ${client.item.name}`;
  const data={name,clientId:client.item.id,arrangementId:arrangement?.id||'',description:'',proposal:'',objective:'',references:'',musicalStyle:'',instruments:[],status:'Proposta',value:value||0,dueDate:'',paymentDueDate:'',paid:false};
  const actionId=saveAction(db,userId,{kind:'create-project',data});
  return {message:'Revise a criação do projeto:',action:{id:actionId,entity:name,changes:[{field:'Cliente',from:'—',to:client.item.name},{field:'Arranjo',from:'—',to:arrangement?.title||'Não associado'},{field:'Valor (R$)',from:'—',to:brl(data.value)},{field:'Etapa inicial',from:'—',to:'Proposta'}],expiresInSeconds:300}};
}

export function interpret(db,userId,text) {
  const q=normalize(text);
  const pages={financeiro:'financeiro',biblioteca:'biblioteca',arranjos:'arranjos',clientes:'clientes',projetos:'projetos',inicio:'dashboard',dashboard:'dashboard','busca':'busca'};
  if(/^(abrir|abre|abra|ir para|acessar|acesse)\b/.test(q)){const page=Object.keys(pages).find(p=>q.includes(p));if(page)return {message:`Abrindo ${page}.`,navigate:pages[page]};}
  const creation=createProjectProposal(db,userId,text,q);if(creation)return creation;
  const hasChange=/\b(?:alter|mud|troc|modific|atualiz|ajust|defin|coloc|marc|edit|corrig|conclu|finaliz|cancel)[a-z]*\b/.test(q);
  if(/\bnao\s+(?:alter|mud|troc|marc|cancel|conclu|edit|atualiz)/.test(q))return {message:'Nenhuma alteração foi proposta.'};
  if(!hasChange){
    const query=queryResponse(db,userId,text,q);if(query)return query;
    return {message:'Posso consultar projetos, recebimentos, prazos, versões e arranjos; criar projetos; e propor alterações de status, pagamento, valor e prazo. Ex.: “quanto tenho para receber?” ou “muda Campanha Aurora para concluído”. Alterações só são salvas após sua confirmação.'};
  }
  let table='projects',patch={},label='name';
  const target=text.split(/\s(?:para|pra|como)\s/i).at(-1).replace(/[“”"']/g,'').trim(),targetNorm=normalize(target);
  if(/\bbpm\b/.test(q)){table='arrangements';label='title';patch.bpm=Number(target);}
  else if(/\b(tonalidade|tom|key)\b/.test(q)){table='arrangements';label='title';patch.key=target;}
  else if(/\b(e-mail|email)\b/.test(q)){table='clients';patch.email=target;}
  else if(/\bwhatsapp\b/.test(q)){table='clients';patch.whatsapp=target;}
  else if(/\b(telefone|celular|fone)\b/.test(q)){table='clients';patch.phone=target;}
  else if(/\b(pagamento|pago|recebido|pendente|quitado)\b/.test(q)){
    if(/\b(nao pago|nao recebido|pendente|a receber|em aberto)\b/.test(targetNorm))patch.paid=false;
    else if(/\b(pago|recebido|quitado)\b/.test(targetNorm))patch.paid=true;
    else return {message:'Informe se o pagamento deve ficar recebido ou pendente.'};
  }
  else if(/\b(valor|preco|orcamento)\b/.test(q)){
    const amount=parseAmount(target);patch.value=amount;
  }
  else if(/\b(entrega|prazo|deadline)\b/.test(q)){
    const m=target.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);patch.dueDate=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:target;
  }
  else {
    const client=/\bcliente\b/.test(q)||clientStatuses.some(([,re])=>re.test(targetNorm));
    table=client?'clients':'projects';const status=(client?clientStatuses:projectStatuses).find(([,re])=>re.test(targetNorm))?.[0];
    if(!status)return {message:'Não reconheci o novo status. Informe um status disponível na tela.'};patch.status=status;
  }
  const rows=table==='clients'?listClients(db,userId):table==='arrangements'?listArrangements(db,userId):listProjects(db,userId);
  const found=identify(rows,text,label);if(!found.item)return found;const item=found.item;
  const validation=updateSchema(definitions[table].schema).safeParse({...patch,version:item.version});
  if(!validation.success)return {message:'O novo valor não é válido. Confira o número, a data, o e-mail ou a tonalidade informados.'};
  if(Object.entries(patch).every(([k,v])=>item[k]===v))return {message:'Esse registro já possui o valor informado.'};
  const actionId=saveAction(db,userId,{kind:'update',table,entityId:item.id,patch,version:item.version});
  const fields={status:'Status',paid:'Pagamento recebido',value:'Valor (R$)',dueDate:'Entrega',bpm:'BPM',key:'Tonalidade',email:'E-mail',phone:'Telefone',whatsapp:'WhatsApp'};
  const display=v=>typeof v==='boolean'?(v?'Sim':'Não'):String(v??'');
  return {message:`Revise a alteração de “${item[label]}”:`,action:{id:actionId,entity:item[label],changes:Object.entries(patch).map(([field,to])=>({field:fields[field],from:display(item[field]),to:display(to)})),expiresInSeconds:300}};
}
