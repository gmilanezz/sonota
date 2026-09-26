import { createHash } from 'node:crypto';
import { listArrangements,listClients,listProjects } from './db.js';
export const normalize = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const groups=[['synth','sintetizador','sintetizadores','synths'],['baixo','bass'],['bateria','drums','drum'],['cordas','strings','violino'],['piano','teclado'],['guitarra','guitar'],['percussao','percussion'],['tensao','tenso','suspense'],['leve','suave','calmo','tranquilo'],['emocional','emotivo','sentimental'],['energetico','energia','animado'],['melancolico','triste','melancolia'],['eletronico','eletronica','electronic'],['cinematic','cinematografico','cinematografica'],['voz','vocal','vocals','vozes']];
const alternatives = term => groups.find(g=>g.includes(term))||[term];
const stop=new Set('quero procure procura encontrar encontre busque busca buscar mostre mostrar preciso me de da do das dos com e ou um uma entre ate a em para por favor musica musicas faixa faixas arquivo arquivos arranjo arranjos que tenha tenham som sons algo os as o no na esse essa bpm tom tonalidade maior menor projeto projetos cliente clientes'.split(' '));
export function parseQuery(query) {
  let text=normalize(query);let minBpm=null,maxBpm=null,key=null;const excluded=[];
  const range=/(?:bpm\s*)?(\d{2,3})\s*(?:a|e|ate|-)\s*(\d{2,3})(?:\s*bpm)?/;
  let match=text.match(range);
  if(match){minBpm=Number(match[1]);maxBpm=Number(match[2]);text=text.replace(match[0],' ');if(minBpm>maxBpm)[minBpm,maxBpm]=[maxBpm,minBpm];}
  else if((match=text.match(/(?:bpm\s*(\d{2,3})|(\d{2,3})\s*bpm)/))){const bpm=Number(match[1]||match[2]);minBpm=bpm-3;maxBpm=bpm+3;text=text.replace(match[0],' ');}
  const original=String(query).match(/(?:tonalidade|tom)\s*(?:de\s*)?([A-Ga-g](?:#|b)?m?)(?=$|[\s,.;!?])/);
  if(original){key=original[1][0].toUpperCase()+original[1].slice(1);text=text.replace(normalize(original[0]),' ');}
  text=text.replace(/\bsem\s+([a-z]+)/g,(_,term)=>{excluded.push(term);return ' ';});
  const terms=[...new Set(text.split(/[^a-z0-9#]+/).filter(t=>t.length>1&&!stop.has(t)&&!/^\d+$/.test(t)))];
  return {minBpm,maxBpm,key,terms,excluded};
}
export function similarity(a,b) {
  a=normalize(a);b=normalize(b);if(a===b)return 1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}
  return 1-prev[b.length]/Math.max(a.length,b.length,1);
}
function termMatch(term,text) {
  const words=text.split(/[^a-z0-9#]+/);
  return alternatives(term).some(t=>words.some(w=>w===t||(t.length>=4&&w.length>=4&&similarity(t,w)>=0.78)));
}
const cosine=(a,b)=>{
  if(a.length!==b.length)return 0;
  let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa&&bb?dot/Math.sqrt(aa*bb):0;
};
async function embed(config,texts) {
  const response=await fetch(`${config.ollamaUrl.replace(/\/$/,'')}/api/embed`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:config.embeddingModel,input:texts,truncate:true}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Embedding service unavailable');
  const data=await response.json();
  if(!Array.isArray(data.embeddings)||data.embeddings.length!==texts.length||data.embeddings.some(v=>!Array.isArray(v)||!v.length||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid embeddings');
  return data.embeddings;
}
export async function search(db,config,userId,query,limit=10) {
  const criteria=parseQuery(query),clients=listClients(db,userId),projects=listProjects(db,userId);
  const candidates=listArrangements(db,userId).map(a=>{
    const linked=projects.filter(p=>p.arrangementId===a.id);
    const content=[a.title,a.fileName,a.genre,a.key,...a.instruments,...a.tags,a.notes,...linked.map(p=>`${p.name} ${p.proposal} ${clients.find(c=>c.id===p.clientId)?.name||''}`)].join(' ');
    return {arrangement:a,linked:linked.map(p=>({id:p.id,name:p.name})),content};
  }).filter(r=>{
    const a=r.arrangement;
    return (criteria.minBpm===null||(a.bpm!==null&&a.bpm>=criteria.minBpm&&a.bpm<=criteria.maxBpm))&&(!criteria.key||a.key===criteria.key)&&!criteria.excluded.some(t=>termMatch(t,normalize(r.content)));
  });
  let mode='metadata',notice='Busca por metadados, sinônimos e contexto dos projetos.',vectors=null,queryVector=null;
  if(config.ollamaUrl&&candidates.length&&criteria.terms.length){
    try {
      vectors=new Map();const missing=[];
      for(const c of candidates){
        const hash=createHash('sha256').update(c.content).digest('hex');
        const cached=db.prepare('SELECT vector FROM embeddings WHERE arrangement_id=? AND user_id=? AND model=? AND content_hash=?').get(c.arrangement.id,userId,config.embeddingModel,hash);
        if(cached)vectors.set(c.arrangement.id,JSON.parse(cached.vector));else missing.push({...c,hash});
      }
      for(let i=0;i<missing.length;i+=16){
        const batch=missing.slice(i,i+16),values=await embed(config,batch.map(c=>c.content));
        batch.forEach((c,j)=>{
          // A remoção simultânea do arranjo não pode recriar um registro órfão.
          if(!db.prepare('SELECT 1 FROM arrangements WHERE id=? AND user_id=?').get(c.arrangement.id,userId))return;
          db.prepare('INSERT OR REPLACE INTO embeddings VALUES (?,?,?,?,?)').run(userId,c.arrangement.id,config.embeddingModel,c.hash,JSON.stringify(values[j]));vectors.set(c.arrangement.id,values[j]);
        });
      }
      [queryVector]=await embed(config,[query]);mode='hybrid';notice='Busca híbrida: significado do texto, metadados e contexto dos projetos.';
    }catch {vectors=null;notice='IA semântica indisponível no momento. A busca por metadados continua funcionando.';}
  }
  const results=candidates.map(c=>{
    const text=normalize(c.content), matched=criteria.terms.filter(t=>termMatch(t,text));
    const lexical=criteria.terms.length?matched.length/criteria.terms.length:1;
    const semantic=vectors&&queryVector&&vectors.has(c.arrangement.id)?cosine(queryVector,vectors.get(c.arrangement.id)):0;
    const eligible=!criteria.terms.length||matched.length>0||semantic>=0.48;
    const relevance=Math.round(100*(vectors&&criteria.terms.length?0.55*lexical+0.45*Math.max(0,semantic):lexical));
    return {arrangement:c.arrangement,linked:c.linked,relevance,matched,eligible};
  }).filter(r=>r.eligible).sort((a,b)=>b.relevance-a.relevance||a.arrangement.title.localeCompare(b.arrangement.title));
  return {mode,notice,criteria,total:results.length,results:results.slice(0,limit).map(({eligible,...r})=>r)};
}
