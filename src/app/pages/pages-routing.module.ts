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
import { EstablishmentsComponent } from './establishments/establishments.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { MarketplacePartnersComponent } from './marketplace-partners/marketplace-partners.component';
import { PatientImportComponent } from './patient-import/patient-import.component';
import { AnalyticsComponent } from './analytics/analytics.component';
import { AuditLogComponent } from './audit-log/audit-log.component';
import { TeamAccessComponent } from './team-access/team-access.component';
import { PendingActivationsComponent } from './pending-activations/pending-activations.component';
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
      { path: 'establishments', component: EstablishmentsComponent },
      { path: 'marketplace-partners', component: MarketplacePartnersComponent },
      { path: 'patient-import', component: PatientImportComponent },
      { path: 'certificat-viewer', component: PdfViewerComponent },
      { path: 'users', component: UsersComponent },
      { path: 'notifications', component: NotificationsComponent },
      { path: 'analytics', component: AnalyticsComponent },
      { path: 'audit-log', component: AuditLogComponent },
      { path: 'team-access', component: TeamAccessComponent },
      { path: 'pending-activations', component: PendingActivationsComponent },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {}
