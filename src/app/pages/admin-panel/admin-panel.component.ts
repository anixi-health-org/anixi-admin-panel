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
  /** Section can be toggled open/closed in the sidebar. */
  collapsible?: boolean;
  /** When collapsible, start closed unless the user opens it or navigates here. */
  defaultCollapsed?: boolean;
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
      { name: 'Marketplace partners', icon: 'store', path: '/marketplace-partners' },
      { name: 'Corporates & Insurances', icon: 'handshake', path: '/corporates-insurances' },
      { name: 'Patients / Users', icon: 'users', path: '/users' },
      { name: 'Patient Import', icon: 'upload', path: '/patient-import' },
      { name: 'Ayah', icon: 'sparkles', path: '/ayah' },
    ],
  },
  {
    label: 'Community',
    collapsible: true,
    defaultCollapsed: true,
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
    label: 'CRM',
    items: [
      { name: 'Pending activations', icon: 'clock', path: '/pending-activations' },
      { name: 'Team & access', icon: 'shield', path: '/team-access' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { name: 'Notifications', icon: 'bell', path: '/notifications' },
      { name: 'Analytics', icon: 'chart-column', path: '/analytics' },
      { name: 'Orders', icon: 'shopping-bag', path: '/orders' },
      { name: 'Medical schemes', icon: 'heart', path: '/medical-schemes' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { name: 'Audit Log', icon: 'scroll-text', path: '/audit-log' },
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
  /** Sidebar section expand/collapse (Community collapsed by default). */
  expandedGroups: Record<string, boolean> = {};
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
    for (const group of this.navGroups) {
      this.expandedGroups[group.label] = !(group.defaultCollapsed ?? false);
    }
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
    if (pathPart === '/content' || pathPart.startsWith('/content/')) {
      this.expandedGroups = { ...this.expandedGroups, ['Community']: true };
    }
  }

  isGroupExpanded(group: NavGroup): boolean {
    if (this.isCollapsed) return true;
    if (!group.collapsible) return true;
    return this.expandedGroups[group.label] ?? true;
  }

  toggleGroup(group: NavGroup, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.expandedGroups = {
      ...this.expandedGroups,
      [group.label]: !this.isGroupExpanded(group),
    };
  }

  isGroupActive(group: NavGroup): boolean {
    return group.items.some((item) => this.isActive(item));
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

  onSearchSubmit(): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    // Global search routes to Users with a query param the page can read.
    void this.router.navigate(['/users'], { queryParams: { q } });
  }
}
