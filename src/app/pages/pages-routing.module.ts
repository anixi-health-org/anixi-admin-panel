import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DoctorVerificationComponent } from './doctor-verification/doctor-verification.component';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';
import { ContentComponent } from './content/content.component';
import { ContentEditorComponent } from './content-editor/content-editor.component';
import { PdfViewerComponent } from './pdf-viewer/pdf-viewer.component';
import { UsersComponent } from './users/users.component';
import { authGuard } from '../guards/auth.guard';
import { guestGuard } from '../guards/guest.guard';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard],
  },
  {
    path: '',
    component: AdminPanelComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'content', component: ContentComponent },
      { path: 'content/new', component: ContentEditorComponent },
      { path: 'content/:id/edit', component: ContentEditorComponent },
      { path: 'doctor-verification', component: DoctorVerificationComponent },
      { path: 'certificat-viewer', component: PdfViewerComponent },
      { path: 'users', component: UsersComponent },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {}
