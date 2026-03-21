import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DoctorVerificationComponent } from './doctor-verification/doctor-verification.component';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';
import { ContentComponent } from './content/content.component';


const routes: Routes = [
  // {path: '', redirectTo: 'login', pathMatch: 'full'},
  // {path:'login', component: LoginComponent},
    {path: '', component: AdminPanelComponent,  children: [
    {path:'', redirectTo: 'dashboard', pathMatch: 'full'},
    {path: 'dashboard', component: DashboardComponent},
    {path: 'content', component: ContentComponent},
    {path: 'doctor-verification', component: DoctorVerificationComponent}
  ]}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
