const $=s=>document.querySelector(s);let register=false;
SonotaAPI.request('/auth/me').then(()=>location.replace('index.html')).catch(()=>{});
SonotaAPI.request('/auth/options').then(o=>{$('#authToggle').hidden=!o.registration;}).catch(()=>{});
$('#authToggle').addEventListener('click',()=>{
  register=!register;
  document.querySelectorAll('.register-only').forEach(e=>e.classList.toggle('hidden',!register));
  $('#name').required=register;$('#password').minLength=register?10:1;
  $('#password').autocomplete=register?'new-password':'current-password';
  $('#authTitle').textContent=register?'Crie seu espaço no Sonota':'Entre no seu estúdio';
  $('#authSubmit').textContent=register?'Criar conta':'Entrar';
  $('#authToggle').textContent=register?'Já tenho conta':'Ainda não tenho conta';$('#authError').textContent='';
});
$('#authForm').addEventListener('submit',async e=>{
  e.preventDefault();if($('#authSubmit').disabled)return;$('#authSubmit').disabled=true;$('#authError').textContent='';
  try{
    const body={email:$('#email').value.trim(),password:$('#password').value};
    if(register){body.name=$('#name').value.trim();body.studio=$('#studio').value.trim();}
    await SonotaAPI.request(register?'/auth/register':'/auth/login',{method:'POST',body});location.replace('index.html');
  }catch(error){$('#authError').textContent=error.details?.map(d=>d.message).join(' ')||error.message;$('#authSubmit').disabled=false;}
});
