import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PagesRoutingModule } from './pages-routing.module';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';
import { LoginComponent } from './login/login.component';
import { DoctorVerificationComponent } from './doctor-verification/doctor-verification.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {Eye, FileText, LayoutDashboard, LucideAngularModule, Stethoscope} from 'lucide-angular';
import {NzAvatarModule} from 'ng-zorro-antd/avatar';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ApplicationDetailsComponent } from './application-details/application-details.component'
import { NzButtonComponent } from "ng-zorro-antd/button";



@NgModule({
  declarations: [
    AdminPanelComponent,
    LoginComponent,
    DoctorVerificationComponent,
    DashboardComponent,
    ApplicationDetailsComponent
  ],
  imports: [
    CommonModule,
    PagesRoutingModule,
    NzLayoutModule,
    NzIconModule,
    NzAvatarModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule.pick({ Stethoscope, LayoutDashboard, FileText, Eye }),
    NzButtonComponent
]
})
export class PagesModule { }
