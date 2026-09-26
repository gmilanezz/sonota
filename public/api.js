/* Sessão via cookie HttpOnly. Nenhuma senha ou token fica no localStorage. */
window.SonotaAPI = (() => {
  let csrf = '';
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const isForm = options.body instanceof FormData;
    if (options.body !== undefined && !isForm) headers.set('Content-Type', 'application/json');
    if (!['GET','HEAD'].includes(options.method || 'GET') && csrf) headers.set('X-CSRF-Token', csrf);
    let response;
    try { response = await fetch('/api' + path, {...options,headers,credentials:'same-origin',body:options.body === undefined || isForm ? options.body : JSON.stringify(options.body)}); }
    catch { throw new Error('Não foi possível conectar ao servidor. Verifique se o Sonota está rodando.'); }
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error?.message || 'A operação não pôde ser concluída.');
      error.status=response.status;error.code=data?.error?.code;error.details=data?.error?.details;
      throw error;
    }
    if (data?.csrf) csrf=data.csrf;
    return data;
  }
  function multipart(metadata,file) { const form=new FormData();form.append('metadata',JSON.stringify(metadata));if(file)form.append('file',file);return form; }
  return {request,multipart};
})();
