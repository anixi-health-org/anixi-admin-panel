import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PagesRoutingModule } from './pages-routing.module';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';
import { LoginComponent } from './login/login.component';
import { DoctorVerificationComponent } from './doctor-verification/doctor-verification.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {Activity, Bell, Eye, FileText, LayoutDashboard, LucideAngularModule, MessageSquare, Stethoscope, TriangleAlert, User, Users, UserX} from 'lucide-angular';
import {NzAvatarModule} from 'ng-zorro-antd/avatar';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ApplicationDetailsComponent } from './application-details/application-details.component'
import { NzButtonComponent } from "ng-zorro-antd/button";
import { CardComponent } from '../components/card/card.component';
import { NgxEchartsDirective } from "ngx-echarts";
import { ContentComponent } from './content/content.component';



@NgModule({
  declarations: [
    AdminPanelComponent,
    LoginComponent,
    DoctorVerificationComponent,
    DashboardComponent,
    ApplicationDetailsComponent,
    CardComponent,
    ContentComponent
  ],
  imports: [
    CommonModule,
    PagesRoutingModule,
    NzLayoutModule,
    NzIconModule,
    NzAvatarModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule.pick({ Stethoscope, LayoutDashboard, FileText, Eye, Users, Activity,
        MessageSquare, Bell, UserX, TriangleAlert
    }),
    NzButtonComponent,
    NgxEchartsDirective
]
})
export class PagesModule { }
