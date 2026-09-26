import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({providedIn:'root'})
export class ApiService {
  csrf=sessionStorage.getItem('sonota_csrf')||'';
  constructor(private http:HttpClient){}
  async request(path:string,method='GET',body?:any,headers:Record<string,string>={}){
    let h=new HttpHeaders(headers);
    if(!['GET','HEAD'].includes(method)&&this.csrf) h=h.set('X-CSRF-Token',this.csrf);
    const data:any=await firstValueFrom(this.http.request(method,'/api'+path,{body,headers:h,withCredentials:true}));
    if(data?.csrf){this.csrf=data.csrf;sessionStorage.setItem('sonota_csrf',this.csrf)}
    return data;
  }
  me(){return this.request('/auth/me')}
  login(data:any){return this.request('/auth/login','POST',data)}
  register(data:any){return this.request('/auth/register','POST',data)}
  logout(){return this.request('/auth/logout','POST')}
  bootstrap(){return this.request('/bootstrap')}
  dashboard(){return this.request('/dashboard')}
  create(type:string,data:any){return this.request('/'+type,'POST',data)}
  update(type:string,id:string,data:any){return this.request(`/${type}/${id}`,'PATCH',data)}
  remove(type:string,id:string,version:number){return this.request(`/${type}/${id}`,'DELETE',undefined,{'If-Match':String(version)})}
  search(query:string){return this.request('/search','POST',{query,limit:30})}
  workspace(id:string){return this.request(`/projects/${id}/workspace`)}
  finance(projectId:string,data:any,file?:File){const f=this.form(data,file);return this.request(`/projects/${projectId}/finance`,'PATCH',f)}
  uploadArrangement(data:any,file:File){return this.request('/arrangements','POST',this.form(data,file))}
  addVersion(projectId:string,data:any,file?:File){return this.request(`/projects/${projectId}/versions`,'POST',this.form(data,file))}
  whatsapp(projectId:string,data:any){return this.request(`/projects/${projectId}/whatsapp`,'POST',data)}
  assistant(message:string){return this.request('/assistant/message','POST',{message})}
  confirmAction(id:string){return this.request(`/assistant/actions/${id}/confirm`,'POST')}
  updateProfile(data:any){return this.request('/profile','PATCH',data)}
  changePassword(data:any){return this.request('/auth/password','POST',data)}
  fileUrl(id:string,download=false){return `/api/files/${id}${download?'?download=1':''}`}
  form(data:any,file?:File){const f=new FormData();f.append('metadata',JSON.stringify(data));if(file)f.append('file',file);return f}
}
