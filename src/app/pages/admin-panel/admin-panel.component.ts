import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AdminUser } from '../../models/admin-user';

const menuIcons = [
  { name: 'Dashboard', icon: 'layout-dashboard', path: './dashboard' },
  { name: 'Content', icon: 'file-text', path: './content' },
  {
    name: 'Doctor verification',
    icon: 'stethoscope',
    path: './doctor-verification',
  },
  { name: 'Users', icon: 'users', path: './users' },
];

@Component({
  selector: 'app-admin-panel',
  standalone: false,
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.css',
})
export class AdminPanelComponent implements OnInit, OnDestroy {
  isCollapsed = false;
  menuIcons = menuIcons;
  adminUser: AdminUser | null = null;

  private sub = new Subscription();

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.sub.add(
      this.authService.adminUser$.subscribe((admin) => {
        this.adminUser = admin;
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onChange(isCollapsed: boolean): void {
    this.isCollapsed = isCollapsed;
  }
}
