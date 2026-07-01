import { Component } from '@angular/core';

const menuIcons = [
  {'name': 'Dashboard', 'icon': 'layout-dashboard', 
    'path':'./dashboard'},
  {'name': 'Content', 'icon': 'file-text', 
    'path': './content'},
    {'name': 'Doctor verification', 'icon': 'stethoscope', 
      'path': './doctor-verification'},
    {'name': 'Users', 'icon': 'users', 
      'path': './users'},
  ];

@Component({
  selector: 'app-admin-panel',
  standalone: false,
  
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.css'
})
export class AdminPanelComponent {
  isCollapsed = false;
  menuIcons = menuIcons;
  onChange(isCollapsed: boolean) {
    this.isCollapsed = isCollapsed;
  }
}
