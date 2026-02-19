import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DoctorVerificationComponent } from './doctor-verification/doctor-verification.component';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';


const routes: Routes = [
  {path: '', redirectTo: 'login', pathMatch: 'full'},
  {path:'login', component: LoginComponent},
  {path: 'admin-panel', component: AdminPanelComponent,  children: [
    {path:'', redirectTo: 'Dashboard', pathMatch: 'full'},
    {path: 'Dashboard', component: DashboardComponent},
    {path: 'Doctor-verification', component: DoctorVerificationComponent}
  ]}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
