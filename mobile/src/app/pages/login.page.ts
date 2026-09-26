import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent,IonButton,IonInput,IonItem } from '@ionic/angular/standalone';
import { ApiService } from '../services/api.service';

@Component({
  standalone:true,
  imports:[CommonModule,FormsModule,IonContent,IonButton,IonInput,IonItem],
  template:`
    <ion-content class="black">
      <div class="login">
        <img src="assets/logo.jpg" class="logo">
        <h1>Sonota</h1>
        <p>Gestão musical</p>

        <h2>{{cadastro ? 'Criar conta' : 'Entrar'}}</h2>

        <ion-item *ngIf="cadastro">
          <ion-input label="Nome" labelPlacement="stacked" [(ngModel)]="name"></ion-input>
        </ion-item>

        <ion-item *ngIf="cadastro">
          <ion-input label="Estúdio ou empresa" labelPlacement="stacked" [(ngModel)]="studio"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input label="E-mail" labelPlacement="stacked" type="email" [(ngModel)]="email"></ion-input>
        </ion-item>

        <ion-item>
          <ion-input label="Senha" labelPlacement="stacked" type="password" [(ngModel)]="password"></ion-input>
        </ion-item>

        <ion-item *ngIf="cadastro">
          <ion-input label="Confirmar senha" labelPlacement="stacked" type="password" [(ngModel)]="confirmPassword"></ion-input>
        </ion-item>

        <p class="hint" *ngIf="cadastro">A senha deve ter pelo menos 10 caracteres.</p>
        <p class="error" *ngIf="error">{{error}}</p>

        <ion-button expand="block" (click)="submit()">
          {{cadastro ? 'Criar conta' : 'Entrar'}}
        </ion-button>

        <ion-button expand="block" fill="outline" (click)="alternar()">
          {{cadastro ? 'Já tenho uma conta' : 'Criar uma conta'}}
        </ion-button>
      </div>
    </ion-content>
  `
})
export class LoginPage {
  cadastro=false;
  name='';
  studio='';
  email='';
  password='';
  confirmPassword='';
  error='';

  constructor(private api:ApiService,private router:Router){}

  alternar(){
    this.cadastro=!this.cadastro;
    this.error='';
    this.password='';
    this.confirmPassword='';
  }

  async submit(){
    this.error='';

    if(!this.email.trim() || !this.password){
      this.error='Preencha o e-mail e a senha.';
      return;
    }

    if(this.cadastro){
      if(!this.name.trim()){
        this.error='Preencha o seu nome.';
        return;
      }
      if(this.password.length<10){
        this.error='A senha deve ter pelo menos 10 caracteres.';
        return;
      }
      if(this.password!==this.confirmPassword){
        this.error='As senhas não conferem.';
        return;
      }
    }

    try{
      if(this.cadastro){
        await this.api.register({
          name:this.name.trim(),
          studio:this.studio.trim(),
          email:this.email.trim(),
          password:this.password
        });
      }else{
        await this.api.login({email:this.email.trim(),password:this.password});
      }
      await this.router.navigateByUrl('/tabs/inicio');
    }catch(e:any){
      this.error=e?.error?.error?.message || (this.cadastro?'Não foi possível criar a conta.':'E-mail ou senha incorretos.');
    }
  }
}
