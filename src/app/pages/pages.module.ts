import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PagesRoutingModule } from './pages-routing.module';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';
import { LoginComponent } from './login/login.component';
import { DoctorVerificationComponent } from './doctor-verification/doctor-verification.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {Activity, BarChart3, Bell, Building2, Calendar, ChartColumn, CheckCircle, ChevronDown, ClipboardList, Clock, Download, ExternalLink, Eye, FilePen, FileText, LayoutDashboard, LogOut, LucideAngularModule, MessageSquare, ScrollText, Search, Settings, Shield, ShieldCheck, Sparkles, Stethoscope, TriangleAlert, Users, UserX} from 'lucide-angular';
import {NzAvatarModule} from 'ng-zorro-antd/avatar';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ApplicationDetailsComponent } from './application-details/application-details.component'
import { NzButtonComponent } from "ng-zorro-antd/button";
import { CardComponent } from '../components/card/card.component';
import { NgxEchartsDirective } from "ngx-echarts";
import { ContentComponent } from './content/content.component';
import { ContentEditorComponent } from './content-editor/content-editor.component';
import {NzDropdownModule} from 'ng-zorro-antd/dropdown';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzUploadModule} from 'ng-zorro-antd/upload';
import { PdfViewerComponent } from './pdf-viewer/pdf-viewer.component';
import { AnixiLogoComponent } from '../components/brand/anixi-logo.component';
import { AdminProfileMenuComponent } from '../components/admin-profile-menu/admin-profile-menu.component';
import {NzSkeletonModule} from 'ng-zorro-antd/skeleton';
import {NzResultModule} from 'ng-zorro-antd/result';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import { PostTitlePipe } from '../pipes/post-title.pipe';
import {NzPopconfirmModule} from 'ng-zorro-antd/popconfirm';
import { LinkifyPipe } from '../pipes/linkify-pipe';
import { UsersComponent } from './users/users.component';
import { EstablishmentsComponent } from './establishments/establishments.component';
import { RichTextEditorComponent } from '../components/rich-text-editor/rich-text-editor.component';

@NgModule({
  declarations: [
    AdminPanelComponent,
    LoginComponent,
    DoctorVerificationComponent,
    DashboardComponent,
    ApplicationDetailsComponent,
    CardComponent,
    ContentComponent,
    ContentEditorComponent,
    PdfViewerComponent,
    PostTitlePipe,
    LinkifyPipe,
    UsersComponent,
    EstablishmentsComponent,
    AnixiLogoComponent,
    AdminProfileMenuComponent,
    RichTextEditorComponent
  ],
  imports: [
    CommonModule,
    PagesRoutingModule,
    NzLayoutModule,
    NzIconModule,
    NzAvatarModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule.pick({
      Stethoscope, LayoutDashboard, FileText, Eye, Users, Activity,
      MessageSquare, Bell, UserX, TriangleAlert, ChevronDown, LogOut,
      ShieldCheck, Sparkles, Download, ExternalLink, Search, Calendar,
      ClipboardList, CheckCircle, FilePen, Clock, ChartColumn, BarChart3,
      Settings, ScrollText, Shield, Building2
    }),
    NzButtonComponent,
    NgxEchartsDirective,
    NzDropdownModule,
    NzModalModule,
    NzUploadModule,
    NzSkeletonModule,
    NzResultModule,
    NzSpinModule,
    NzPopconfirmModule,

]
})
export class PagesModule { }
