import { Routes } from '@angular/router';
import { LoginPage } from './pages/login.page';
import { TabsPage } from './pages/tabs.page';
import { DashboardPage } from './pages/dashboard.page';
import { ClientsPage } from './pages/clients.page';
import { ProjectsPage } from './pages/projects.page';
import { LibraryPage } from './pages/library.page';
import { MorePage } from './pages/more.page';
import { ArrangementsPage } from './pages/arrangements.page';
import { SearchPage } from './pages/search.page';
import { FinancePage } from './pages/finance.page';
import { ProfilePage } from './pages/profile.page';
import { AssistantPage } from './pages/assistant.page';
import { ProjectPage } from './pages/project.page';

export const routes:Routes=[
 {path:'login',component:LoginPage},
 {path:'tabs',component:TabsPage,children:[
  {path:'inicio',component:DashboardPage},{path:'clientes',component:ClientsPage},{path:'projetos',component:ProjectsPage},{path:'biblioteca',component:LibraryPage},{path:'mais',component:MorePage},{path:'',redirectTo:'inicio',pathMatch:'full'}
 ]},
 {path:'arranjos',component:ArrangementsPage},{path:'busca',component:SearchPage},{path:'financeiro',component:FinancePage},{path:'perfil',component:ProfilePage},{path:'assistente',component:AssistantPage},{path:'projeto/:id',component:ProjectPage},
 {path:'',redirectTo:'login',pathMatch:'full'},{path:'**',redirectTo:'login'}
];
