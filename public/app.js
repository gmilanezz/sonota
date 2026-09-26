const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const LS = {clients:'clients', arrangements:'arrangements', projects:'projects', docs:'docs', profile:'profile', transcriptions:'transcriptions'};
const PROJECT_STATUSES = ['Proposta', 'Em produção', 'Revisão', 'Concluído', 'Cancelado'];
const CLIENT_STATUSES = ['Ativo', 'Prospect', 'Pausado', 'Inativo'];
let state = {}, player = null, polling = false;
const api = SonotaAPI.request;
const load = (key, fallback=[]) => state[key] ?? fallback;
const formData = SonotaAPI.multipart;
const splitList = value => [...new Set(value.split(',').map(s=>s.trim()).filter(Boolean))];
function esc(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function money(v=0){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

function dateBR(v){ if(!v) return '—'; const d = new Date(v+'T12:00:00'); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR'); }

function initials(name=''){ return name.trim().split(/\s+/).filter(Boolean).map(n=>n[0]).join('').slice(0,2).toUpperCase() || 'S'; }

function todayISO(){ return new Date().toISOString().slice(0,10); }

function normalize(s=''){ return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function statusBadge(status){
  const s = normalize(status);
  if(s.includes('concluido') || s==='ativo' || s==='recebido' || s==='aprovado') return 'good';
  if(s.includes('cancelado') || s==='inativo') return 'bad';
  if(s.includes('revisao') || s==='prospect' || s==='pendente') return 'warn';
  if(s.includes('producao')) return 'accent';
  if(s.includes('proposta') || s.includes('briefing')) return 'blue';
  return 'neutral';
}

function projectStatusClass(status){
  const s=normalize(status);
  if(s.includes('proposta') || s.includes('briefing')) return 'status-proposta';
  if(s.includes('producao')) return 'status-producao';
  if(s.includes('revisao')) return 'status-revisao';
  if(s.includes('concluido')) return 'status-concluido';
  if(s.includes('cancelado')) return 'status-cancelado';
  return 'status-neutro';
}

function toast(message, type='good'){
  let box = $('.toast-container');
  if(!box){ box = document.createElement('div'); box.className='toast-container'; document.body.appendChild(box); }
  const item = document.createElement('div'); item.className=`toast ${type}`; item.textContent=message; box.appendChild(item);
  setTimeout(()=>item.remove(), 3200);
}

function renderShellProfile(){
  const p=load(LS.profile,{});
  $$('.profile-name').forEach(el=>el.textContent=p.name||'Você');
  $$('.profile-role').forEach(el=>el.textContent=`${p.role||'Produtor'} • ${p.studio||'Harmonia'}`);
  $$('.avatar').forEach(el=>el.textContent=initials(p.name||'Você').slice(0,1));
}

function openProfile(){
  const p=load(LS.profile,{}), modal=$('#profileModal'); if(!modal) return;
  $('#profileForm').dataset.version=p.version;$('#profileName').value=p.name||''; $('#profileRole').value=p.role||''; $('#profileStudio').value=p.studio||''; $('#profileEmail').value=p.email||'';
  modal.classList.add('open');
}

function clientById(id){return load(LS.clients).find(x=>x.id===id)}

function arrangementById(id){return load(LS.arrangements).find(x=>x.id===id)}

function projectById(id){return load(LS.projects).find(x=>x.id===id)}

function renderDashboard(){
  if(document.body.dataset.page!=='index') return;
  const clients=load(LS.clients), arrangements=load(LS.arrangements), projects=load(LS.projects), p=load(LS.profile,{});
  $('#welcomeName').textContent=p.name||'Você';
  $('#dashArrangements').textContent=arrangements.length;
  $('#dashClients').textContent=clients.filter(c=>c.status==='Ativo').length;
  $('#dashProjects').textContent=projects.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length;
  $('#dashRevenue').textContent=money(projects.filter(p=>p.paid).reduce((s,p)=>s+Number(p.value||0),0));
  const activity=state.activity||[], maximum=Math.max(1,...activity.map(m=>m.count));
  if($('#projectActivity'))$('#projectActivity').innerHTML=activity.map(m=>`<div class="bar-wrap"><span class="bar-count">${m.count}</span><div class="bar" style="height:${Math.round(m.count/maximum*75)}%" title="${esc(m.label)}: ${m.count} projeto(s)"></div><div class="bar-label">${esc(m.label)}</div></div>`).join('');
  const tbody=$('#recentProjects');
  tbody.innerHTML=projects.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,5).map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(clientById(p.clientId)?.name||'—')}</td><td>${esc(arrangementById(p.arrangementId)?.title||'—')}</td><td><span class="badge ${statusBadge(p.status)}">${esc(p.status)}</span></td><td>${money(p.value)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Nenhum projeto cadastrado.</div></td></tr>';
}

function renderClients(){
  const clients=load(LS.clients), projects=load(LS.projects), q=normalize($('#clientSearch')?.value||'');
  const filtered=clients.filter(c=>normalize([c.name,c.company,c.email,c.phone,c.city,c.status].join(' ')).includes(q));
  $('#clientTotal').textContent=clients.length; $('#clientActive').textContent=clients.filter(c=>c.status==='Ativo').length; $('#clientProspects').textContent=clients.filter(c=>c.status==='Prospect').length;
  const recurrence=clients.length?Math.round((clients.filter(c=>projects.filter(p=>p.clientId===c.id).length>1).length/clients.length)*100):0; $('#clientRecurrence').textContent=recurrence+'%';
  const selected=$('#clientDetail')?.dataset.selected||'';
  $('#clientRows').innerHTML=filtered.map(c=>{const count=projects.filter(p=>p.clientId===c.id).length;return `<tr class="client-row ${selected===c.id?'is-selected':''}" data-client-id="${c.id}"><td><div style="display:flex;align-items:center;gap:9px"><div class="client-avatar" style="width:32px;height:32px;border-radius:9px">${esc(initials(c.name))}</div><div><strong>${esc(c.name)}</strong><br><span style="color:#6f7e92;font-size:9px">${esc(c.company||c.type)}</span></div></div></td><td>${esc(c.email||'—')}<br><span style="color:#6f7e92;font-size:9px">${esc(c.phone||'')}</span></td><td>${esc(c.city||'—')}</td><td>${count}</td><td><span class="badge ${statusBadge(c.status)}">${esc(c.status)}</span></td><td><div class="table-actions"><button class="icon-btn" style="width:30px;height:30px" data-action="edit" data-id="${c.id}" title="Editar">✎</button><button class="icon-btn" style="width:30px;height:30px" data-action="delete" data-id="${c.id}" title="Excluir">×</button></div></td></tr>`}).join('')||'<tr><td colspan="6"><div class="empty-state"><strong>Nenhum cliente encontrado</strong>Ajuste a busca ou cadastre um novo cliente.</div></td></tr>';
  if(filtered[0] && (!selected || !filtered.some(c=>c.id===selected))) selectClient(filtered[0].id);
  if(!filtered.length){ const detail=$('#clientDetail'); if(detail){detail.dataset.selected='';detail.innerHTML='<div class="empty-state">Selecione um cliente para ver os detalhes.</div>';} }
}

function selectClient(id){
  const c=clientById(id); if(!c)return; const projects=load(LS.projects).filter(p=>p.clientId===id); const revenue=projects.filter(p=>p.paid).reduce((s,p)=>s+Number(p.value||0),0); const el=$('#clientDetail'); if(!el)return; el.dataset.selected=id;
  $$('#clientRows tr[data-client-id]').forEach(row=>row.classList.toggle('is-selected',row.dataset.clientId===id));
  el.innerHTML=`<div class="detail-title"><div class="client-avatar">${esc(initials(c.name))}</div><div><h4>${esc(c.name)}</h4><p>${esc(c.company||c.type)} • desde ${dateBR(c.createdAt)}</p></div></div><div class="detail-list"><div class="detail-row"><small>E-mail</small><strong>${esc(c.email||'—')}</strong></div><div class="detail-row"><small>Telefone</small><strong>${esc(c.phone||'—')}</strong></div><div class="detail-row"><small>Documento</small><strong>${esc(c.document||'—')}</strong></div><div class="detail-row"><small>Local</small><strong>${esc(c.city||'—')}</strong></div><div class="detail-row"><small>Projetos</small><strong>${projects.length} projeto(s) • ${money(revenue)} recebidos</strong></div><div class="detail-row"><small>Observações</small><span>${esc(c.notes||'Sem observações')}</span></div></div>`;
}

function editClient(id){ const c=clientById(id); if(!c)return; $('#clientForm').dataset.version=c.version;$('#clientId').value=c.id; $('#clientName').value=c.name; $('#clientType').value=c.type; $('#clientCompany').value=c.company||''; $('#clientEmail').value=c.email||''; $('#clientPhone').value=c.phone||''; $('#clientDocument').value=c.document||''; $('#clientCity').value=c.city||''; $('#clientNotes').value=c.notes||''; $('#clientStatus').value=c.status; $('#clientModalTitle').textContent='Editar cliente'; $('#clientModal').classList.add('open'); }

function renderArrangements(){
  const list=load(LS.arrangements), q=normalize($('#arrangementSearch')?.value||''), g=$('#arrangementGenreFilter')?.value||'';
  const genres=[...new Set(list.map(a=>a.genre).filter(Boolean))].sort(); const sel=$('#arrangementGenreFilter'); if(sel){const current=sel.value;sel.innerHTML='<option value="">Todos os gêneros</option>'+genres.map(x=>`<option ${x===current?'selected':''}>${esc(x)}</option>`).join('')}
  const filtered=list.filter(a=>(!g||a.genre===g)&&normalize([a.title,a.fileName,a.genre,a.key,...a.instruments,...a.tags].join(' ')).includes(q));
  $('#arrangementTotal').textContent=list.length; const knownBpm=list.filter(a=>a.bpm!==null);$('#arrangementAvgBpm').textContent=knownBpm.length?Math.round(knownBpm.reduce((s,a)=>s+a.bpm,0)/knownBpm.length):'—'; $('#arrangementGenres').textContent=genres.length; $('#arrangementFiles').textContent=list.filter(a=>a.fileName).length;
  $('#arrangementRows').innerHTML=filtered.map(a=>`<tr><td><strong>${esc(a.title)}</strong><br><span style="font-size:9px;color:#6f7e92">${esc(a.fileName)}</span></td><td>${esc(a.genre||'—')}</td><td>${a.bpm||'—'}</td><td>${esc(a.key||'—')}</td><td>${esc(a.instruments.join(', ')||'—')}</td><td>${a.tags.slice(0,2).map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</td><td><div class="table-actions"><button class="icon-btn" style="width:30px;height:30px" data-action="play" data-id="${a.id}" title="Ouvir">▶</button><button class="icon-btn" style="width:30px;height:30px" data-action="edit" data-id="${a.id}" title="Editar">✎</button><button class="icon-btn" style="width:30px;height:30px" data-action="download" data-id="${a.id}" title="Baixar">↓</button><button class="icon-btn" style="width:30px;height:30px" data-action="versions" data-id="${a.id}" title="Versões">≡</button><button class="icon-btn" style="width:30px;height:30px" data-action="delete" data-id="${a.id}" title="Excluir">×</button></div></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty-state"><strong>Nenhum arranjo encontrado</strong>Adicione um arquivo e categorize-o.</div></td></tr>';
}

function editArrangement(id){const a=arrangementById(id);if(!a)return;$('#arrangementForm').reset();$('#arrangementForm').dataset.version=a.version;$('#arrangementId').value=a.id;$('#arrangementTitle').value=a.title;$('#arrangementBpm').value=a.bpm;$('#arrangementKey').value=a.key;$('#arrangementGenre').value=a.genre;$('#arrangementInstruments').value=a.instruments.join(', ');$('#arrangementTags').value=a.tags.join(', ');$('#arrangementNotes').value=a.notes||'';$('#audioPicked').textContent=`Arquivo atual: ${a.fileName} (selecione outro para substituir)`;$('#arrangementModalTitle').textContent='Editar arranjo';$('#arrangementModal').classList.add('open')}

function renderArrangementCards(target, list){
  const el=$(target); if(!el)return; el.innerHTML=list.map((a,i)=>`<article class="audio-card"><div class="audio-card-top"><div><h4>${esc(a.title)}</h4><p>${esc(a.fileName)} • ${esc(a.genre)}</p></div><button class="play-btn" data-play-arr="${a.id}">▶</button></div><div class="audio-wave" aria-hidden="true">${Array.from({length:22},(_,n)=>`<i style="height:${14+((n*17+i*11)%38)}px"></i>`).join('')}</div><div class="audio-meta-grid"><div class="audio-meta-box"><small>BPM</small><strong>${a.bpm||'—'}</strong></div><div class="audio-meta-box"><small>Tom</small><strong>${esc(a.key||'—')}</strong></div><div class="audio-meta-box"><small>Formato</small><strong>${esc(a.fileType||'—')}</strong></div></div><div class="tag-row">${[...a.instruments,...a.tags].slice(0,5).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></article>`).join('')||'<div class="empty-state"><strong>Nenhum arquivo</strong>Cadastre arranjos para preencher a biblioteca.</div>';
  $$('[data-play-arr]',el).forEach(b=>b.addEventListener('click',()=>playArrangement(b.dataset.playArr)));
}

function initLibrary(){
  if(document.body.dataset.page!=='biblioteca') return;
  ['librarySearch','bpmMin','bpmMax','libraryGenre','libraryInstrument','libraryKey'].forEach(id=>$('#'+id)?.addEventListener(id==='librarySearch'?'input':'change',renderLibrary));
  $('#clearLibraryFilters')?.addEventListener('click',()=>{['librarySearch','bpmMin','bpmMax','libraryGenre','libraryInstrument','libraryKey'].forEach(id=>{if($('#'+id))$('#'+id).value=''});renderLibrary()});
  renderLibrary();
}

function renderLibrary(){
  const list=load(LS.arrangements); const q=normalize($('#librarySearch')?.value||''), min=Number($('#bpmMin')?.value||0), max=Number($('#bpmMax')?.value||999), g=$('#libraryGenre')?.value||'', inst=$('#libraryInstrument')?.value||'', key=$('#libraryKey')?.value||'';
  const genres=[...new Set(list.map(a=>a.genre).filter(Boolean))].sort(), instruments=[...new Set(list.flatMap(a=>a.instruments).filter(Boolean))].sort(), keys=[...new Set(list.map(a=>a.key).filter(Boolean))].sort();
  fillSelect('#libraryGenre',genres,'Todos os gêneros'); fillSelect('#libraryInstrument',instruments,'Todos os instrumentos'); fillSelect('#libraryKey',keys,'Todas as tonalidades');
  const filtered=list.filter(a=>{const text=normalize([a.title,a.fileName,a.genre,a.key,...a.instruments,...a.tags,a.notes].join(' '));return text.includes(q)&&Number(a.bpm)>=min&&Number(a.bpm)<=max&&(!g||a.genre===g)&&(!inst||a.instruments.includes(inst))&&(!key||a.key===key)});
  $('#libraryCount').textContent=`${filtered.length} de ${list.length} arquivos`; renderArrangementCards('#libraryGrid',filtered);
}

function fillSelect(sel,values,label){const el=$(sel);if(!el)return;const cur=el.value;el.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(v)}</option>`).join('')}

function populateProjectSelects(){
  const clients=load(LS.clients),arr=load(LS.arrangements),cs=$('#projectClient'),as=$('#projectArrangement');
  if(cs){const cur=cs.value;cs.innerHTML='<option value="">Selecione o cliente</option>'+clients.map(c=>`<option value="${c.id}" ${c.id===cur?'selected':''}>${esc(c.name)}</option>`).join('')}
  if(as){const cur=as.value;as.innerHTML='<option value="">Selecione o arranjo</option>'+arr.map(a=>`<option value="${a.id}" ${a.id===cur?'selected':''}>${esc(a.title)} • ${a.bpm} BPM</option>`).join('')}
}

function renderProjects(){
  const list=load(LS.projects), q=normalize($('#projectSearch')?.value||''), sf=$('#projectStatusFilter')?.value||'';
  const filtered=list.filter(p=>(!sf||p.status===sf)&&normalize([p.name,p.proposal||'',clientById(p.clientId)?.name,arrangementById(p.arrangementId)?.title,p.status].join(' ')).includes(q));
  $('#projectTotal').textContent=list.length;$('#projectActive').textContent=list.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length;$('#projectDone').textContent=list.filter(p=>p.status==='Concluído').length;$('#projectPipeline').textContent=money(list.filter(p=>p.status!=='Cancelado'&&!p.paid).reduce((sum,p)=>sum+Number(p.value||0),0));
  $('#projectRows').innerHTML=filtered.map(p=>`<tr class="project-row ${projectStatusClass(p.status)}"><td><strong>${esc(p.name)}</strong><br><span style="font-size:9px;color:#6f7e92">Entrega: ${dateBR(p.dueDate)}</span></td><td>${esc(clientById(p.clientId)?.name||'—')}</td><td>${esc(arrangementById(p.arrangementId)?.title||'—')}</td><td><select class="select project-status-select ${projectStatusClass(p.status)}" style="height:32px;min-width:126px" data-project-status="${p.id}">${PROJECT_STATUSES.map(status=>`<option ${status===p.status?'selected':''}>${status}</option>`).join('')}</select></td><td>${money(p.value)}</td><td><div class="table-actions"><button class="icon-btn" style="width:30px;height:30px" data-action="edit" data-id="${p.id}" title="Editar">✎</button><button class="icon-btn" style="width:30px;height:30px" data-action="delete" data-id="${p.id}" title="Excluir">×</button></div></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-state"><strong>Nenhum projeto encontrado</strong>Crie um projeto e vincule cliente e arranjo.</div></td></tr>';
  renderBoard(filtered);
}

function renderBoard(list){
  const board=$('#projectBoard');if(!board)return;const columns=['Proposta','Em produção','Revisão','Concluído'];
  board.innerHTML=columns.map(status=>{const items=list.filter(p=>p.status===status);return `<div class="project-column ${projectStatusClass(status)}"><div class="project-column-head"><strong>${status}</strong><span class="project-count">${items.length}</span></div>${items.map(p=>{const proposal=(p.proposal||'').trim();return `<div class="project-card ${projectStatusClass(p.status)}" data-edit-project="${p.id}"><h4>${esc(p.name)}</h4><p>${proposal?`${esc(proposal.slice(0,95))}${proposal.length>95?'…':''}`:'Sem proposta cadastrada.'}</p><div class="project-card-foot"><span>${esc(clientById(p.clientId)?.name||'—')}</span><strong>${money(p.value)}</strong></div></div>`}).join('')||'<div class="empty-state" style="padding:25px 8px">Nenhum projeto</div>'}</div>`}).join('');
  $$('[data-edit-project]',board).forEach(card=>card.addEventListener('click',()=>editProject(card.dataset.editProject)));
}

function editProject(id){
  const p=projectById(id);if(!p)return;populateProjectSelects();$('#projectForm').dataset.version=p.version;$('#projectId').value=p.id;$('#projectName').value=p.name;$('#projectClient').value=p.clientId;$('#projectArrangement').value=p.arrangementId;$('#projectProposal').value=p.proposal||'';$('#projectStatus').value=p.status;$('#projectValue').value=p.value;$('#projectDueDate').value=p.dueDate||'';$('#projectModalTitle').textContent='Editar projeto';$('#projectModal').classList.add('open');
}

function initAI(){
  if(document.body.dataset.page!=='busca-ia') return;
  $('#aiSend')?.addEventListener('click',()=>runAISearch($('#aiQuery').value));
  $('#aiQuery')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();runAISearch(e.target.value)}});
  $$('.chip[data-prompt]').forEach(c=>c.addEventListener('click',()=>{$('#aiQuery').value=c.dataset.prompt;runAISearch(c.dataset.prompt)}));
  $('#aiResults')?.addEventListener('click',e=>{
    const play=e.target.closest('[data-ai-play]'); if(play){playArrangement(play.dataset.aiPlay);return}
    const download=e.target.closest('[data-ai-download]'); if(download) downloadArrangement(download.dataset.aiDownload);
  });
}

function openFinanceEdit(id){
  const project=projectById(id);if(!project)return;
  $('#financeEditForm').dataset.version=project.version;$('#financeEditProjectId').value=project.id;$('#financePaymentStatus').value=project.paid?'paid':'pending';$('#financeFiscalMode').value='add';$('#financeEditFile').value='';$('#financeEditPicked').textContent='Nenhum arquivo selecionado';$('#financeEditDescription').value='';
  $('#financeEditProjectInfo').innerHTML=`<strong>${esc(project.name)}</strong> • ${esc(clientById(project.clientId)?.name||'—')} • ${money(project.value)} • <span class="badge ${statusBadge(project.status)}">${esc(project.status)}</span>`;
  renderFinanceEditDocs(project.id);$('#financeEditModal').classList.add('open');
}

function renderFinanceEditDocs(projectId){
  const el=$('#financeEditDocs');if(!el)return;const docs=load(LS.docs).filter(d=>d.projectId===projectId);
  el.innerHTML=docs.map(d=>`<div class="doc-item fiscal-doc-card"><div class="doc-icon">NF</div><div class="fiscal-doc-content"><strong class="fiscal-project-name">${esc(projectById(d.projectId)?.name||'Sem projeto')}</strong><span class="fiscal-description">${esc(d.description||'Sem descrição')} • ${dateBR(d.date)}</span><span class="fiscal-file-name">${esc(d.fileName)}</span></div><div class="table-actions"><button type="button" class="icon-btn" style="width:30px;height:30px" data-fin-edit-doc-action="download" data-id="${d.id}" title="Baixar">↓</button><button type="button" class="icon-btn" style="width:30px;height:30px" data-fin-edit-doc-action="delete" data-id="${d.id}" title="Excluir">×</button></div></div>`).join('')||'<div class="empty-state" style="padding:18px"><strong>Nenhuma nota anexada</strong>Você pode adicionar uma ao salvar.</div>';
}

function populateFinanceProjects(){const sel=$('#fiscalProject');if(!sel)return;sel.innerHTML='<option value="">Selecione o projeto</option>'+load(LS.projects).map(p=>`<option value="${p.id}">${esc(p.name)} • ${esc(clientById(p.clientId)?.name||'')}</option>`).join('')}

function renderFinance(){
  const projects=load(LS.projects),docs=load(LS.docs),received=projects.filter(p=>p.paid).reduce((sum,p)=>sum+Number(p.value||0),0),receivable=projects.filter(p=>p.status==='Concluído'&&!p.paid).reduce((sum,p)=>sum+Number(p.value||0),0),forecast=projects.filter(p=>!['Concluído','Cancelado'].includes(p.status)&&!p.paid).reduce((sum,p)=>sum+Number(p.value||0),0);
  $('#finReceived').textContent=money(received);$('#finReceivable').textContent=money(receivable);$('#finForecast').textContent=money(forecast);$('#finDocs').textContent=docs.length;
  $('#financeRows').innerHTML=projects.filter(p=>p.status!=='Cancelado'||p.paid).map(p=>{const docCount=docs.filter(d=>d.projectId===p.id).length;return `<article class="finance-project-card ${projectStatusClass(p.status)}"><div class="finance-project-top"><div><h4>${esc(p.name)}</h4><p>${esc(clientById(p.clientId)?.name||'—')}</p></div><button class="icon-btn" data-finance-action="edit" data-id="${p.id}" title="Editar pagamento e nota fiscal">✎</button></div><div class="finance-project-meta"><div><small>Status</small><span class="badge ${statusBadge(p.status)}">${esc(p.status)}</span></div><div><small>Entrega</small><strong>${dateBR(p.dueDate)}</strong></div><div><small>Valor</small><strong>${money(p.value)}</strong></div><div><small>Pagamento</small><span class="badge ${p.paid?'good':'warn'}">${p.paid?'Recebido':'Pendente'}</span></div></div><div class="finance-project-foot"><span>${docCount} nota(s) / anexo(s)</span><span>Editar para alterar pagamento ou NF</span></div></article>`}).join('')||'<div class="empty-state"><strong>Nenhum projeto financeiro</strong>Crie projetos para iniciar a previsão de caixa.</div>';
  $('#docList').innerHTML=docs.map(d=>`<div class="doc-item fiscal-doc-card"><div class="doc-icon">NF</div><div class="fiscal-doc-content"><strong class="fiscal-project-name">${esc(projectById(d.projectId)?.name||'Sem projeto')}</strong><span class="fiscal-description">${esc(d.description||'Sem descrição')} • ${dateBR(d.date)}</span><span class="fiscal-file-name">${esc(d.fileName)}</span></div><div class="table-actions"><button class="icon-btn" style="width:30px;height:30px" data-doc-action="download" data-id="${d.id}" title="Baixar">↓</button><button class="icon-btn" style="width:30px;height:30px" data-doc-action="delete" data-id="${d.id}" title="Excluir">×</button></div></div>`).join('')||'<div class="empty-state"><strong>Nenhum documento anexado</strong>Use “Anexar nota fiscal” para organizar os arquivos por projeto.</div>';
}

function transcriptionTypeLabel(type){return type==='midi'?'MIDI':type==='partitura'?'Partitura':'Stems'}

function assistantIcon(){
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8M8 13h5"></path></svg>`;
}

function initAssistant(){
  if($('#sonotaAssistant')) return;
  const wrapper=document.createElement('div');
  wrapper.id='sonotaAssistant';
  wrapper.className='sonota-assistant';
  wrapper.innerHTML=`
    <button class="assistant-launcher" id="assistantLauncher" type="button" aria-label="Abrir Assistente Sonota" aria-expanded="false" title="Assistente Sonota">
      ${assistantIcon()}
      <span class="assistant-launcher-dot"></span>
    </button>
    <section class="assistant-panel" id="assistantPanel" aria-label="Assistente Sonota" aria-hidden="true">
      <header class="assistant-header">
        <div class="assistant-brand">
          <div class="assistant-avatar">✦</div>
          <div><strong>Assistente Sonota</strong><span>Ajuda rápida e ações no sistema</span></div>
        </div>
        <button class="assistant-close" id="assistantClose" type="button" aria-label="Fechar assistente">×</button>
      </header>
      <div class="assistant-messages" id="assistantMessages" aria-live="polite"></div>
      <div class="assistant-suggestions" id="assistantSuggestions">
        <button type="button" data-assistant-prompt='Alterar status do projeto "Campanha Aurora" para "Concluído"'>Concluir projeto</button>
        <button type="button" data-assistant-prompt='Marcar pagamento do projeto "EP Liminal" como recebido'>Pagamento recebido</button>
        <button type="button" data-assistant-prompt='Alterar BPM do arranjo "Theme Aurora" para 128'>Alterar BPM</button>
      </div>
      <form class="assistant-form" id="assistantForm">
        <input id="assistantInput" type="text" autocomplete="off" placeholder="Ex.: alterar status do projeto..." aria-label="Mensagem para o Assistente Sonota">
        <button type="submit" aria-label="Enviar mensagem">➜</button>
      </form>
      <div class="assistant-hint">Enter para enviar • revise as alterações antes de confirmar</div>
    </section>`;
  document.body.appendChild(wrapper);

  const launcher=$('#assistantLauncher'), panel=$('#assistantPanel'), input=$('#assistantInput');
  const setOpen=(open)=>{
    panel.classList.toggle('open',open);
    panel.setAttribute('aria-hidden',String(!open));
    launcher.setAttribute('aria-expanded',String(open));
    launcher.classList.toggle('is-open',open);
    if(open) setTimeout(()=>input?.focus(),120);
  };
  launcher.addEventListener('click',()=>setOpen(!panel.classList.contains('open')));
  $('#assistantClose')?.addEventListener('click',()=>setOpen(false));
  $('#assistantForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const text=input.value.trim();
    if(!text)return;
    input.value='';
    assistantAddMessage('user',text);
    void assistantProcess(text);
  });
  $('#assistantSuggestions')?.addEventListener('click',e=>{
    const btn=e.target.closest('[data-assistant-prompt]');
    if(!btn)return;
    input.value=btn.dataset.assistantPrompt;
    input.focus();
  });

  const history=assistantHistory();
  if(history.length){ history.forEach(item=>assistantRenderMessage(item.role,item.text,item.time,false)); }
  else assistantAddMessage('assistant','Oi! Posso ajudar a alterar dados do Sonota. Tente “alterar status do projeto Campanha Aurora para concluído” ou digite “ajuda” para ver os comandos disponíveis.');
}

function assistantRenderMessage(role,text,time,persist){
  const box=$('#assistantMessages'); if(!box)return;
  const item=document.createElement('div');
  item.className=`assistant-message ${role==='user'?'user':'assistant'}`;
  const content=document.createElement('div'); content.className='assistant-bubble'; content.textContent=text;
  const meta=document.createElement('small');
  const d=time?new Date(time):new Date();
  meta.textContent=role==='user'?'Você':`Sonota • ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  item.append(content,meta); box.appendChild(item); box.scrollTop=box.scrollHeight;
}

function assistantRefreshCurrentPage(){
  const page=document.body.dataset.page||'';
  if(page==='index') renderDashboard();
  else if(page==='clientes') renderClients();
  else if(page==='arranjos'){ renderArrangements(); renderTranscriptions(); }
  else if(page==='biblioteca') renderLibrary();
  else if(page==='projetos') renderProjects();
  else if(page==='financeiro') renderFinance();
  renderShellProfile();
}

async function reportError(error,form){
  if(error.status===401){location.replace('login.html');return;}
  const message=error.details?.map(d=>`${d.field}: ${d.message}`).join(' • ')||error.message||'Não foi possível concluir a operação.';
  toast(message,'bad');
  if(form){let box=$('.form-error',form);if(!box){box=document.createElement('p');box.className='form-error';box.setAttribute('role','alert');form.querySelector('.modal-body')?.appendChild(box);}box.textContent=message;}
}
const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(error=>reportError(error));
function onSubmit(selector,handler){
  const form=$(selector);if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(form.dataset.busy==='1')return;
    const button=$('button[type="submit"],.modal-footer .primary-btn',form);
    form.dataset.busy='1';if(button)button.disabled=true;$('.form-error',form)?.remove();
    try{await handler(form);}catch(error){await reportError(error,form);}
    finally{form.dataset.busy='0';if(button)button.disabled=false;}
  });
}
async function refresh(){state=await api('/bootstrap');assistantRefreshCurrentPage();}
async function saved(modal,message){await refresh();if(modal)$(modal)?.classList.remove('open');toast(message);}
function initCommon(){
  renderShellProfile();const page=document.body.dataset.page;
  $$('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===page));
  const sidebar=$('.sidebar'),overlay=$('.overlay');
  $('#menuToggle')?.addEventListener('click',()=>{if(innerWidth<=820){sidebar?.classList.toggle('open');overlay?.classList.toggle('open');}else document.body.classList.toggle('sidebar-collapsed');});
  overlay?.addEventListener('click',()=>{sidebar?.classList.remove('open');overlay.classList.remove('open');});
  window.addEventListener('resize',()=>{if(innerWidth>820){sidebar?.classList.remove('open');overlay?.classList.remove('open');}});
  $('#profileButton')?.addEventListener('click',openProfile);$('#profileTopButton')?.addEventListener('click',openProfile);
  document.addEventListener('click',event=>{
    const close=event.target.closest('[data-close-modal]');if(close)close.closest('.modal')?.classList.remove('open');
    if(event.target.classList.contains('modal'))event.target.classList.remove('open');
    const picker=event.target.closest('[data-pick-file]');if(picker&&event.target.tagName!=='INPUT')$('#'+picker.dataset.pickFile)?.click();
    const trigger=event.target.closest('[data-trigger]');if(trigger)$('#'+trigger.dataset.trigger)?.click();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal.open').forEach(m=>m.classList.remove('open'));});
  const top=$('.topbar');
  if(top){const refreshButton=document.createElement('button');refreshButton.id='refreshButton';refreshButton.className='ghost-btn';refreshButton.textContent='Atualizar';refreshButton.addEventListener('click',safe(async()=>{await refresh();toast('Dados atualizados.');}));top.prepend(refreshButton);
    const out=document.createElement('button');out.className='ghost-btn logout-btn';out.textContent='Sair';out.addEventListener('click',safe(async()=>{await api('/auth/logout',{method:'POST'});state={};location.replace('login.html');}));top.append(out);}
}
function initProfileForm(){
  const form=$('#profileForm');if(!form)return;
  $('.modal-body',form).insertAdjacentHTML('beforeend','<div class="form-group" style="margin-top:16px"><label for="profileCurrentPassword">Senha atual (somente para alterar o e-mail)</label><input id="profileCurrentPassword" type="password" autocomplete="current-password"></div><div class="backend-notice"><button type="button" class="ghost-btn" id="changePasswordBtn">Alterar senha</button> <a class="ghost-btn" href="/api/export">Exportar dados</a></div>');
  onSubmit('#profileForm',async form=>{
    const data={name:$('#profileName').value.trim(),role:$('#profileRole').value.trim(),studio:$('#profileStudio').value.trim(),email:$('#profileEmail').value.trim(),version:Number(form.dataset.version)};
    if($('#profileCurrentPassword').value)data.currentPassword=$('#profileCurrentPassword').value;
    await api('/profile',{method:'PATCH',body:data});$('#profileCurrentPassword').value='';await saved('#profileModal','Perfil atualizado.');
  });
  document.body.insertAdjacentHTML('beforeend','<div class="modal" id="passwordModal"><div class="modal-panel"><div class="modal-head"><strong>Alterar senha</strong><button class="icon-btn" data-close-modal type="button">×</button></div><form id="passwordForm"><div class="modal-body"><div class="form-group"><label>Senha atual</label><input id="oldPassword" type="password" autocomplete="current-password" required></div><div class="form-group"><label>Nova senha (mínimo 10 caracteres)</label><input id="newPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div></div><div class="modal-footer"><button class="primary-btn" type="submit">Salvar senha</button></div></form></div></div>');
  $('#changePasswordBtn').addEventListener('click',()=>{$('#passwordForm').reset();$('#passwordModal').classList.add('open');});
  onSubmit('#passwordForm',async form=>{await api('/auth/password',{method:'POST',body:{currentPassword:$('#oldPassword').value,newPassword:$('#newPassword').value}});form.reset();$('#profileModal').classList.remove('open');await saved('#passwordModal','Senha alterada. As outras sessões foram encerradas.');});
}
function initClients(){
  if(document.body.dataset.page!=='clientes')return;
  const open=()=>{$('#clientForm').reset();$('#clientId').value='';$('#clientModalTitle').textContent='Novo cliente';$('#clientModal').classList.add('open');};
  $('#newClientBtn')?.addEventListener('click',open);$('#newClientTop')?.addEventListener('click',open);$('#clientSearch')?.addEventListener('input',renderClients);
  onSubmit('#clientForm',async form=>{
    const data={name:$('#clientName').value.trim(),type:$('#clientType').value,company:$('#clientCompany').value.trim(),email:$('#clientEmail').value.trim(),phone:$('#clientPhone').value.trim(),document:$('#clientDocument').value.trim(),city:$('#clientCity').value.trim(),notes:$('#clientNotes').value.trim(),status:$('#clientStatus').value};
    const id=$('#clientId').value;if(id)data.version=Number(form.dataset.version);
    const item=await api('/clients'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:data});await saved('#clientModal','Cliente salvo.');selectClient(item.id);
  });
  $('#clientRows')?.addEventListener('click',safe(async event=>{const b=event.target.closest('button[data-action]');if(b){if(b.dataset.action==='edit')editClient(b.dataset.id);else await deleteClient(b.dataset.id);return;}const row=event.target.closest('[data-client-id]');if(row)selectClient(row.dataset.clientId);}));renderClients();
}
async function deleteClient(id){const c=clientById(id);if(!confirm(`Excluir o cliente “${c.name}”?`))return;await api('/clients/'+id,{method:'DELETE',headers:{'If-Match':String(c.version)}});await saved(null,'Cliente excluído.');}
function initArrangements(){
  if(document.body.dataset.page!=='arranjos')return;
  const open=()=>{$('#arrangementForm').reset();$('#arrangementId').value='';$('#arrangementModalTitle').textContent='Adicionar arranjo';$('#audioPicked').textContent='Nenhum arquivo selecionado';$('#arrangementModal').classList.add('open');};
  $('#newArrangementBtn')?.addEventListener('click',open);$('#newArrangementTop')?.addEventListener('click',open);
  $('#arrangementFile')?.addEventListener('change',()=>{$('#audioPicked').textContent=$('#arrangementFile').files[0]?.name||'Nenhum arquivo selecionado';});
  $('#arrangementSearch')?.addEventListener('input',renderArrangements);$('#arrangementGenreFilter')?.addEventListener('change',renderArrangements);
  onSubmit('#arrangementForm',async form=>{
    const id=$('#arrangementId').value,file=$('#arrangementFile').files[0];if(!id&&!file)throw new Error('Selecione um arquivo MP3, OGG ou WAV.');
    const data={title:$('#arrangementTitle').value.trim(),bpm:$('#arrangementBpm').value?Number($('#arrangementBpm').value):null,key:$('#arrangementKey').value.trim(),genre:$('#arrangementGenre').value.trim(),instruments:splitList($('#arrangementInstruments').value),tags:splitList($('#arrangementTags').value),notes:$('#arrangementNotes').value.trim()};
    if(id)data.version=Number(form.dataset.version);
    await api('/arrangements'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:file?formData(data,file):data});await saved('#arrangementModal','Arranjo salvo no acervo.');
  });
  $('#arrangementRows')?.addEventListener('click',safe(async event=>{const b=event.target.closest('[data-action]');if(!b)return;const {id,action}=b.dataset;if(action==='edit')editArrangement(id);if(action==='play')await playArrangement(id);if(action==='delete')await deleteArrangement(id);if(action==='download')downloadArrangement(id);if(action==='versions')await showVersions(id);}));renderArrangements();
}
async function deleteArrangement(id){const a=arrangementById(id);if(!confirm(`Excluir “${a.title}”, seu histórico de versões e resultados de áudio?`))return;await api('/arrangements/'+id,{method:'DELETE',headers:{'If-Match':String(a.version)}});await saved(null,'Arranjo excluído.');}
function fileLink(id,download=false){return '/api/files/'+encodeURIComponent(id)+(download?'?download=1':'');}
function downloadFile(id){const link=document.createElement('a');link.href=fileLink(id,true);document.body.append(link);link.click();link.remove();}
async function playArrangement(id){
  const a=arrangementById(id);if(!a?.fileId)return;
  player?.pause();$('.audio-player')?.remove();const box=document.createElement('div');box.className='audio-player';
  const name=document.createElement('strong');name.textContent=a.title;player=document.createElement('audio');player.controls=true;player.src=fileLink(a.fileId);
  const close=document.createElement('button');close.className='icon-btn';close.textContent='×';close.setAttribute('aria-label','Fechar player');close.addEventListener('click',()=>{player.pause();player.removeAttribute('src');box.remove();});
  player.addEventListener('error',()=>toast('Não foi possível reproduzir. Verifique a sessão ou baixe o arquivo.','bad'));
  box.append(name,player,close);document.body.append(box);try{await player.play();}catch{toast('Use o botão de reprodução no player.');}
}
function downloadArrangement(id){const a=arrangementById(id);if(a?.fileId)downloadFile(a.fileId);}
async function showVersions(id){
  const versions=await api('/arrangements/'+id+'/versions');$('#versionsModal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div class="modal open" id="versionsModal"><div class="modal-panel"><div class="modal-head"><strong>Versões de ${esc(arrangementById(id).title)}</strong><button class="icon-btn" data-close-modal>×</button></div><div class="modal-body version-list">${versions.map(v=>`<div class="version-item"><div><strong>Versão ${v.number} • ${esc(v.fileName)}</strong><small>${new Date(v.createdAt).toLocaleString('pt-BR')} • ${(v.size/1024/1024).toFixed(2)} MB</small></div><a class="ghost-btn" href="${fileLink(v.fileId,true)}">Baixar</a></div>`).join('')}</div></div></div>`);
}
function initProjects(){
  if(document.body.dataset.page!=='projetos')return;
  const open=()=>{$('#projectForm').reset();$('#projectId').value='';$('#projectStatus').value='Proposta';$('#projectModalTitle').textContent='Novo projeto';populateProjectSelects();$('#projectModal').classList.add('open');};
  $('#newProjectBtn')?.addEventListener('click',open);$('#newProjectTop')?.addEventListener('click',open);$('#projectSearch')?.addEventListener('input',renderProjects);$('#projectStatusFilter')?.addEventListener('change',renderProjects);
  onSubmit('#projectForm',async form=>{
    const id=$('#projectId').value,data={name:$('#projectName').value.trim(),clientId:$('#projectClient').value,arrangementId:$('#projectArrangement').value,proposal:$('#projectProposal').value.trim(),status:$('#projectStatus').value,value:Number($('#projectValue').value||0),dueDate:$('#projectDueDate').value};
    if(id)data.version=Number(form.dataset.version);await api('/projects'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:data});await saved('#projectModal','Projeto salvo.');
  });
  $('#projectRows')?.addEventListener('click',safe(async event=>{const b=event.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='edit')editProject(b.dataset.id);if(b.dataset.action==='delete')await deleteProject(b.dataset.id);}));
  $('#projectRows')?.addEventListener('change',safe(async event=>{const select=event.target.closest('[data-project-status]');if(!select)return;const p=projectById(select.dataset.projectStatus);select.disabled=true;try{await api('/projects/'+p.id,{method:'PATCH',body:{status:select.value,version:p.version}});await saved(null,'Status atualizado.');}catch(e){select.value=p.status;throw e;}finally{select.disabled=false;}}));renderProjects();
}
async function deleteProject(id){const p=projectById(id);if(!confirm(`Excluir “${p.name}” e seus documentos financeiros? Os áudios do acervo serão preservados.`))return;await api('/projects/'+id,{method:'DELETE',headers:{'If-Match':String(p.version)}});await saved(null,'Projeto excluído.');}
function initFinance(){
  if(document.body.dataset.page!=='financeiro')return;
  $('#newFiscalDocBtn')?.addEventListener('click',()=>{$('#fiscalForm').reset();populateFinanceProjects();$('#fiscalPicked').textContent='Nenhum arquivo selecionado';$('#fiscalModal').classList.add('open');});
  $('#fiscalFile')?.addEventListener('change',()=>{$('#fiscalPicked').textContent=$('#fiscalFile').files[0]?.name||'Nenhum arquivo selecionado';});
  onSubmit('#fiscalForm',async()=>{
    const file=$('#fiscalFile').files[0];if(!file)throw new Error('Selecione um documento.');
    await api('/documents',{method:'POST',body:formData({projectId:$('#fiscalProject').value,description:$('#fiscalDescription').value.trim()},file)});await saved('#fiscalModal','Documento anexado.');
  });
  $('#financeRows')?.addEventListener('click',e=>{const b=e.target.closest('[data-finance-action]');if(b)openFinanceEdit(b.dataset.id);});
  const docAction=safe(async e=>{
    const b=e.target.closest('[data-doc-action],[data-fin-edit-doc-action]');if(!b)return;const action=b.dataset.docAction||b.dataset.finEditDocAction;
    if(action==='download'){downloadFinanceDoc(b.dataset.id);return;}
    if(!confirm('Excluir este documento?'))return;await api('/documents/'+b.dataset.id,{method:'DELETE'});await refresh();
    const p=projectById($('#financeEditProjectId')?.value);if(p){$('#financeEditForm').dataset.version=p.version;renderFinanceEditDocs(p.id);}toast('Documento excluído.');
  });
  $('#docList')?.addEventListener('click',docAction);$('#financeEditDocs')?.addEventListener('click',docAction);
  $('#financeEditUploadZone')?.addEventListener('click',e=>{if(e.target.id!=='financeEditFile')$('#financeEditFile').click();});
  $('#financeEditFile')?.addEventListener('change',()=>{$('#financeEditPicked').textContent=$('#financeEditFile').files[0]?.name||'Nenhum arquivo selecionado';});
  onSubmit('#financeEditForm',async form=>{
    const id=$('#financeEditProjectId').value,file=$('#financeEditFile').files[0],mode=$('#financeFiscalMode').value;
    if(mode==='replace'&&file&&state.docs.some(d=>d.projectId===id)&&!confirm('Substituir todos os documentos atuais deste projeto?'))return;
    const data={paid:$('#financePaymentStatus').value==='paid',version:Number(form.dataset.version),mode:file?mode:'add',description:$('#financeEditDescription').value.trim()};
    await api('/projects/'+id+'/finance',{method:'PATCH',body:file?formData(data,file):data});await saved('#financeEditModal','Financeiro atualizado.');
  });renderFinance();
}
function downloadFinanceDoc(id){const d=state.docs.find(d=>d.id===id);if(d)downloadFile(d.fileId);}
async function runAISearch(query){
  query=query.trim();if(!query)return;const chat=$('#chatBody');$('#aiQuery').value='';chat.insertAdjacentHTML('beforeend',`<div class="message user">${esc(query)}<small>agora</small></div>`);
  try{
    const data=await api('/search',{method:'POST',body:{query}});
    chat.insertAdjacentHTML('beforeend',`<div class="message assistant">${data.total?`Encontrei ${data.total} arquivo(s).`:'Não encontrei arquivos compatíveis.'} ${esc(data.notice)}<small>Sonota • ${data.mode==='hybrid'?'IA semântica + metadados':'Metadados e contexto'}</small></div>`);
    $('#aiResults').innerHTML=data.results.map(({arrangement:a,relevance,linked})=>`<div class="search-result"><button class="play-btn" data-ai-play="${a.id}" title="Ouvir">▶</button><div><h4>${esc(a.title)}</h4><p>${esc(a.genre)} • ${a.bpm||'—'} BPM • ${esc(a.key||'—')} • ${esc(a.instruments.join(', '))}</p><p>${linked.length?`Relacionado a: ${esc(linked.map(p=>p.name).join(', '))}`:'Sem projeto vinculado'}</p></div><div class="search-result-actions"><div class="score">Relevância<strong>${relevance}/100</strong></div><button class="ghost-btn" data-ai-download="${a.id}">↓ Download</button></div></div>`).join('')||'<div class="empty-state"><strong>Nenhum resultado</strong>Tente ampliar a busca ou adicionar detalhes aos arranjos.</div>';
  }catch(error){chat.insertAdjacentHTML('beforeend',`<div class="message assistant">${esc(error.message)}</div>`);await reportError(error);}
  chat.scrollTop=chat.scrollHeight;
}
function assistantHistory(){return [];}
function assistantAddMessage(role,text){assistantRenderMessage(role,text,new Date().toISOString(),false);}
async function assistantProcess(text){
  const submit=$('#assistantForm button');if(submit.disabled)return;submit.disabled=true;
  try{
    const data=await api('/assistant/message',{method:'POST',body:{message:text}});assistantAddMessage('assistant',data.message);
    if(data.navigate){location.href=data.navigate;return;}
    if(data.action){
      const container=$('#assistantMessages').lastElementChild,changes=document.createElement('div');changes.className='assistant-changes';changes.textContent=data.action.changes.map(c=>`${c.field}: ${c.from} → ${c.to}`).join('\n');
      const button=document.createElement('button');button.type='button';button.className='assistant-confirm';button.textContent='Confirmar alteração';
      button.addEventListener('click',safe(async()=>{button.disabled=true;try{const result=await api('/assistant/actions/'+data.action.id+'/confirm',{method:'POST'});await refresh();assistantAddMessage('assistant',result.message);button.textContent='Alteração salva';}catch(error){button.textContent='Envie o comando novamente';throw error;}}));container.append(changes,button);$('#assistantMessages').scrollTop=$('#assistantMessages').scrollHeight;
    }
  }catch(error){assistantAddMessage('assistant',error.message);await reportError(error);}finally{submit.disabled=false;}
}
function initTranscription(){
  if(document.body.dataset.page!=='arranjos')return;
  $('#transcriptionType').insertAdjacentHTML('beforeend','<option value="analysis">Estimar BPM e tonalidade</option>');
  $('#transcribeBtn')?.addEventListener('click',()=>{
    if(!state.arrangements.length){toast('Adicione um arranjo primeiro.','bad');return;}
    $('#transcriptionArrangement').innerHTML=state.arrangements.map(a=>`<option value="${a.id}">${esc(a.title)}</option>`).join('');
    const options=$$('#transcriptionType option');options.forEach(o=>{o.disabled=!state.capabilities.audio[o.value];});
    const first=options.find(o=>!o.disabled);$('#transcriptionSubmit').disabled=!first;if(first)$('#transcriptionType').value=first.value;
    $('#transcriptionStatus').textContent=first?'O trabalho será processado em segundo plano. Você pode acompanhar o status abaixo.':'Modelos de áudio indisponíveis neste servidor. Consulte as instruções em audio/README.md para habilitar.';
    $('#transcriptionModal').classList.add('open');
  });
  onSubmit('#transcriptionForm',async()=>{await api('/jobs',{method:'POST',body:{arrangementId:$('#transcriptionArrangement').value,type:$('#transcriptionType').value}});await saved('#transcriptionModal','Áudio enviado para processamento.');});
  $('#transcriptionList')?.addEventListener('click',safe(async e=>{
    const b=e.target.closest('[data-job-action]');if(!b)return;const job=state.transcriptions.find(j=>j.id===b.dataset.id);if(!job)return;
    if(b.dataset.jobAction==='download'){downloadFile(job.fileId);return;}
    if(b.dataset.jobAction==='cancel'){if(confirm('Cancelar este processamento?'))await api('/jobs/'+job.id+'/cancel',{method:'POST'});}
    if(b.dataset.jobAction==='delete'){if(confirm('Excluir este resultado?'))await api('/jobs/'+job.id,{method:'DELETE'});}
    await refresh();
  }));renderTranscriptions();
  setInterval(async()=>{
    if(document.hidden||polling||!state.transcriptions.some(j=>['queued','running'].includes(j.status)))return;
    polling=true;try{await refresh();}catch(error){await reportError(error);}finally{polling=false;}
  },3000);
}
function renderTranscriptions(){
  const el=$('#transcriptionList');if(!el)return;
  const statuses={queued:'Na fila',running:'Processando',completed:'Concluído',failed:'Falhou',cancelled:'Cancelado'};
  el.innerHTML=load(LS.transcriptions).map(j=>{
    const active=['queued','running'].includes(j.status),analysis=j.type==='analysis';
    const result=analysis&&j.result?` • ${j.result.bpm||'—'} BPM • ${j.result.key||'—'} • ${j.result.applied?'campos vazios preenchidos':'estimativa disponível; metadados preservados'}`:'';
    return `<div class="generated-item"><div class="generated-icon">${analysis?'♫':'↓'}</div><div class="job-info"><strong>${esc(arrangementById(j.arrangementId)?.title||'Áudio')} • ${analysis?'BPM e tonalidade':transcriptionTypeLabel(j.type)}</strong><span>${statuses[j.status]}${esc(result)}${j.error?' • '+esc(j.error):''}</span></div><div class="job-actions">${j.fileId?`<button class="ghost-btn" data-job-action="download" data-id="${j.id}">↓ Baixar</button>`:''}<button class="ghost-btn" data-job-action="${active?'cancel':'delete'}" data-id="${j.id}">${active?'Cancelar':'Excluir'}</button></div></div>`;
  }).join('')||'<div class="empty-state"><strong>Nenhum processamento</strong>Os trabalhos e resultados aparecerão aqui.</div>';
}
async function initAll(){
  const loading=document.createElement('div');loading.className='boot-status';loading.textContent='Carregando seu estúdio…';document.body.prepend(loading);
  try{
    state=await api('/bootstrap');initCommon();initProfileForm();renderDashboard();initClients();initArrangements();initLibrary();initProjects();initAI();initFinance();initTranscription();initAssistant();
    document.body.classList.remove('booting');loading.remove();
  }catch(error){if(error.status===401){location.replace('login.html');return;}loading.textContent=error.message+' Recarregue a página para tentar novamente.';}
}
document.addEventListener('DOMContentLoaded',initAll);
