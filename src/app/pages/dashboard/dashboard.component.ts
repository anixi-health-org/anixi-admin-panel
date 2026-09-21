import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { COMMUNITIES } from '../../../../const';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { PostService } from '../../services/post.service';
import {
  DoctorRecord,
  formatTimestamp,
  getDoctorDisplayName,
  isDoctorVerificationCandidate,
  normalizeVerificationStatus,
} from '../../utils/doctor-record.utils';
import {
  PlatformUser,
  formatUserTimestamp,
  getUserDisplayName,
  getUserRole,
} from '../../utils/user-record.utils';
import { paginateItems } from '../../utils/pagination.utils';

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'amber' | 'green' | 'blue' | 'red';
  route: string[];
  queryParams?: Record<string, string>;
};

type MetricCard = {
  id: string;
  label: string;
  value: string | number;
  hint: string;
  icon: string;
  tone?: 'green' | 'amber' | 'slate';
};

type QuickAction = {
  id: string;
  label: string;
  description: string;
  icon: string;
  route: string;
  queryParams?: Record<string, string>;
  primary?: boolean;
};

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  when: string;
  whenMs: number;
  tone: 'amber' | 'green' | 'blue' | 'slate';
};

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  isLoading = true;
  greetingName = 'Admin';
  greetingLine = 'Good day';

  totalPatients = 0;
  verifiedDoctors = 0;
  pendingDoctors = 0;
  communityPosts = 0;
  openActions = 0;
  communities = COMMUNITIES.length;

  attentionItems: AttentionItem[] = [];
  activityItems: ActivityItem[] = [];
  activityPageIndex = 1;
  activityPageSize = 5;
  metricCards: MetricCard[] = [];
  quickActions: QuickAction[] = [
    {
      id: 'create-content',
      label: 'Create content',
      description: 'Publish community articles and updates',
      icon: 'file-pen',
      route: '/content/new',
      primary: true,
    },
    {
      id: 'review-doctors',
      label: 'Review doctors',
      description: 'Verify credentials and approve access',
      icon: 'stethoscope',
      route: '/doctor-verification',
      queryParams: { status: 'pending' },
    },
    {
      id: 'manage-users',
      label: 'Manage users',
      description: 'Browse patients and platform accounts',
      icon: 'users',
      route: '/users',
    },
    {
      id: 'view-reports',
      label: 'View reports',
      description: 'Review flagged community content',
      icon: 'triangle-alert',
      route: '/content',
      queryParams: { filter: 'reported' },
    },
  ];

  todayLabel = '';

  private sub = new Subscription();

  constructor(
    private firestoreService: FirestoreService,
    private postService: PostService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.setGreeting();
    this.todayLabel = new Intl.DateTimeFormat('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Johannesburg',
    }).format(new Date());
    this.sub.add(
      this.authService.adminUser$.subscribe((admin) => {
        this.greetingName = admin?.displayName?.split(' ')[0] || 'Admin';
      })
    );

    this.sub.add(
      combineLatest([
        this.firestoreService.getDoctors(),
        this.firestoreService.getUsers(),
        this.postService.fetchAdminPost(),
      ]).subscribe({
        next: ([doctors, users, postsRes]) => {
          this.hydrate(doctors as DoctorRecord[], users as PlatformUser[], postsRes.data || []);
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        },
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  open(item: AttentionItem): void {
    void this.router.navigate(item.route, { queryParams: item.queryParams });
  }

  go(path: string, queryParams?: Record<string, string>): void {
    void this.router.navigate([path], { queryParams });
  }

  get pagedActivityItems(): ActivityItem[] {
    return paginateItems(this.activityItems, this.activityPageIndex, this.activityPageSize);
  }

  onActivityPageIndexChange(page: number): void {
    this.activityPageIndex = page;
  }

  onActivityPageSizeChange(size: number): void {
    this.activityPageSize = size;
    this.activityPageIndex = 1;
  }

  private setGreeting(): void {
    const hour = new Date().getHours();
    if (hour < 12) this.greetingLine = 'Good morning';
    else if (hour < 18) this.greetingLine = 'Good afternoon';
    else this.greetingLine = 'Good evening';
  }

  private hydrate(doctors: DoctorRecord[], users: PlatformUser[], posts: any[]): void {
    const clinicalDoctors = doctors.filter((d) => isDoctorVerificationCandidate(d));
    const pending = clinicalDoctors.filter(
      (d) => normalizeVerificationStatus(d.verificationStatus as string) === 'pending'
    );
    const approved = clinicalDoctors.filter(
      (d) => normalizeVerificationStatus(d.verificationStatus as string) === 'approved'
    );
    const suspended = clinicalDoctors.filter(
      (d) => normalizeVerificationStatus(d.verificationStatus as string) === 'suspended'
    );
    const patients = users.filter((u) => getUserRole(u) === 'patient');
    const reported = posts.filter((p) => p?.reported === true);
    const published = posts.filter((p) => (p?.status ?? 'Published') === 'Published');

    this.pendingDoctors = pending.length;
    this.verifiedDoctors = approved.length;
    this.totalPatients = patients.length;
    this.communityPosts = published.length;
    this.openActions = pending.length + reported.length + suspended.length;

    this.attentionItems = [];
    if (pending.length) {
      this.attentionItems.push({
        id: 'pending-doctors',
        title: `${pending.length} doctor${pending.length === 1 ? '' : 's'} awaiting verification`,
        detail: 'Review credentials before approving practice access on Anixi.',
        tone: 'amber',
        route: ['/doctor-verification'],
        queryParams: { status: 'pending' },
      });
    }
    if (reported.length) {
      this.attentionItems.push({
        id: 'reported-posts',
        title: `${reported.length} community post${reported.length === 1 ? '' : 's'} reported`,
        detail: 'Review flagged content in Community Content.',
        tone: 'red',
        route: ['/content'],
        queryParams: { filter: 'reported' },
      });
    }
    if (suspended.length) {
      this.attentionItems.push({
        id: 'suspended-doctors',
        title: `${suspended.length} suspended doctor account${suspended.length === 1 ? '' : 's'}`,
        detail: 'Confirm whether access should remain restricted.',
        tone: 'blue',
        route: ['/doctor-verification'],
        queryParams: { status: 'suspended' },
      });
    }
    this.metricCards = [
      {
        id: 'patients',
        label: 'Total patients',
        value: this.totalPatients,
        hint: 'Registered patient accounts',
        icon: 'users',
      },
      {
        id: 'verified-doctors',
        label: 'Verified doctors',
        value: this.verifiedDoctors,
        hint: 'Approved to practice',
        icon: 'shield-check',
        tone: 'green',
      },
      {
        id: 'pending-doctors',
        label: 'Pending review',
        value: this.pendingDoctors,
        hint: 'Awaiting credential verification',
        icon: 'clock',
        tone: this.pendingDoctors > 0 ? 'amber' : undefined,
      },
      {
        id: 'appointments',
        label: 'Appointments today',
        value: '—',
        hint: 'Not available in Admin',
        icon: 'calendar',
        tone: 'slate',
      },
      {
        id: 'community-posts',
        label: 'Community posts',
        value: this.communityPosts,
        hint: `Across ${this.communities} communities`,
        icon: 'message-square',
      },
      {
        id: 'open-actions',
        label: 'Open actions',
        value: this.openActions,
        hint: 'Require attention',
        icon: 'triangle-alert',
        tone: this.openActions > 0 ? 'amber' : undefined,
      },
    ];

    const doctorActivity = [...clinicalDoctors]
      .sort((a, b) => this.toMillis(b.verifiedAt ?? b.createdAt) - this.toMillis(a.verifiedAt ?? a.createdAt))
      .slice(0, 25)
      .map((doctor, index) => {
        const status = normalizeVerificationStatus(doctor.verificationStatus as string);
        const name = getDoctorDisplayName(doctor);
        const whenSource = doctor.verifiedAt ?? doctor.createdAt;
        const whenMs = this.toMillis(whenSource);
        if (status === 'approved') {
          return {
            id: `doc-${doctor.id || index}`,
            title: 'Doctor approved',
            detail: `${name} was approved for Anixi practice access.`,
            when: formatTimestamp(whenSource),
            whenMs,
            tone: 'green' as const,
          };
        }
        if (status === 'suspended') {
          return {
            id: `doc-${doctor.id || index}`,
            title: 'Doctor suspended',
            detail: `${name} access was restricted.`,
            when: formatTimestamp(whenSource),
            whenMs,
            tone: 'slate' as const,
          };
        }
        if (status === 'rejected') {
          return {
            id: `doc-${doctor.id || index}`,
            title: 'Application rejected',
            detail: `${name} was not approved.`,
            when: formatTimestamp(whenSource),
            whenMs,
            tone: 'slate' as const,
          };
        }
        return {
          id: `doc-${doctor.id || index}`,
          title: 'Doctor application submitted',
          detail: `${name} is awaiting credential review.`,
          when: formatTimestamp(doctor.createdAt),
          whenMs: this.toMillis(doctor.createdAt),
          tone: 'amber' as const,
        };
      });

    const userActivity = [...users]
      .sort((a, b) => this.toMillis(b.createdAt) - this.toMillis(a.createdAt))
      .slice(0, 15)
      .map((user, index) => ({
        id: `user-${user.id || index}`,
        title: 'User created',
        detail: `${getUserDisplayName(user)} joined as ${getUserRole(user)}.`,
        when: formatUserTimestamp(user.createdAt),
        whenMs: this.toMillis(user.createdAt),
        tone: 'blue' as const,
      }));

    const postActivity = [...posts]
      .sort((a, b) => this.toMillis(b.timeStamp) - this.toMillis(a.timeStamp))
      .slice(0, 15)
      .map((post, index) => ({
        id: `post-${post.id || index}`,
        title: 'Community article published',
        detail: `${post.title || 'Untitled article'} · ${post.groupName || 'Community'}`,
        when: formatTimestamp(post.timeStamp),
        whenMs: this.toMillis(post.timeStamp),
        tone: 'green' as const,
      }));

    this.activityItems = [...doctorActivity, ...postActivity, ...userActivity]
      .sort((a, b) => b.whenMs - a.whenMs)
      .slice(0, 50);
    this.activityPageIndex = 1;
  }

  private toMillis(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      const date = (value as { toDate: () => Date }).toDate?.();
      return date ? date.getTime() : 0;
    }
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value as string | number);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
}
