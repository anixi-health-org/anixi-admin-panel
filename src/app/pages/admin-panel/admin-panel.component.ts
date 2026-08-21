import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AdminUser } from '../../models/admin-user';

type NavItem = {
  name: string;
  icon: string;
  path?: string;
  exact?: boolean;
  queryParams?: Record<string, string>;
  comingSoon?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', icon: 'layout-dashboard', path: '/dashboard', exact: true }],
  },
  {
    label: 'Clinical operations',
    items: [
      { name: 'Doctor Verification', icon: 'stethoscope', path: '/doctor-verification' },
      { name: 'Clinics', icon: 'building-2', path: '/establishments' },
      { name: 'Patients / Users', icon: 'users', path: '/users' },
      { name: 'Appointments', icon: 'calendar', comingSoon: true },
    ],
  },
  {
    label: 'Community',
    items: [
      { name: 'Community', icon: 'file-text', path: '/content', exact: true },
      {
        name: 'Published',
        icon: 'check-circle',
        path: '/content',
        queryParams: { status: 'Published' },
      },
      {
        name: 'Drafts',
        icon: 'file-pen',
        path: '/content',
        queryParams: { status: 'Draft' },
      },
      {
        name: 'Scheduled',
        icon: 'clock',
        path: '/content',
        queryParams: { status: 'Scheduled' },
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      { name: 'Notifications', icon: 'bell', comingSoon: true },
      { name: 'Analytics', icon: 'chart-column', comingSoon: true },
      { name: 'Settings', icon: 'settings', comingSoon: true },
    ],
  },
  {
    label: 'Governance',
    items: [
      { name: 'Audit Log', icon: 'scroll-text', comingSoon: true },
      { name: 'Security / Access', icon: 'shield', comingSoon: true },
    ],
  },
];

@Component({
  selector: 'app-admin-panel',
  standalone: false,
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.css',
})
export class AdminPanelComponent implements OnInit, OnDestroy {
  isCollapsed = false;
  navGroups = navGroups;
  adminUser: AdminUser | null = null;
  searchQuery = '';
  currentPath = '';
  currentQuery = new URLSearchParams();
  private sub = new Subscription();

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.syncRoute(this.router.url);
    this.sub.add(
      this.authService.adminUser$.subscribe((admin) => {
        this.adminUser = admin;
      })
    );
    this.sub.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.syncRoute(event.urlAfterRedirects);
        })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private syncRoute(url: string): void {
    const [pathPart, queryPart = ''] = url.split('?');
    this.currentPath = pathPart || '';
    this.currentQuery = new URLSearchParams(queryPart);
  }

  onChange(isCollapsed: boolean): void {
    this.isCollapsed = isCollapsed;
  }

  isActive(item: NavItem): boolean {
    if (!item.path) return false;
    if (item.exact) {
      return this.currentPath === item.path && !this.currentQuery.get('status');
    }
    if (item.queryParams?.['status']) {
      return (
        this.currentPath === item.path &&
        this.currentQuery.get('status') === item.queryParams['status']
      );
    }
    return this.currentPath === item.path || this.currentPath.startsWith(`${item.path}/`);
  }

  roleLabel(): string {
    if (!this.adminUser?.role) return 'Administrator';
    return this.adminUser.role === 'super_admin' ? 'Super admin' : 'Administrator';
  }

  onSearchSubmit(): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    // Global search routes to Users with a query param the page can read.
    void this.router.navigate(['/users'], { queryParams: { q } });
  }
}
