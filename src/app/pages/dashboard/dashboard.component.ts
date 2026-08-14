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

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'amber' | 'green' | 'blue' | 'red';
  route: string[];
  queryParams?: Record<string, string>;
};

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  when: string;
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

  private sub = new Subscription();

  constructor(
    private firestoreService: FirestoreService,
    private postService: PostService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.setGreeting();
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
    if (!this.attentionItems.length) {
      this.attentionItems.push({
        id: 'all-clear',
        title: 'No urgent actions right now',
        detail: 'Verification queue and reported content look clear.',
        tone: 'green',
        route: ['/doctor-verification'],
      });
    }

    const doctorActivity = [...clinicalDoctors]
      .sort((a, b) => this.toMillis(b.verifiedAt ?? b.createdAt) - this.toMillis(a.verifiedAt ?? a.createdAt))
      .slice(0, 6)
      .map((doctor, index) => {
        const status = normalizeVerificationStatus(doctor.verificationStatus as string);
        const name = getDoctorDisplayName(doctor);
        if (status === 'approved') {
          return {
            id: `doc-${doctor.id || index}`,
            title: 'Doctor approved',
            detail: `${name} was approved for Anixi practice access.`,
            when: formatTimestamp(doctor.verifiedAt ?? doctor.createdAt),
            tone: 'green' as const,
          };
        }
        if (status === 'suspended') {
          return {
            id: `doc-${doctor.id || index}`,
            title: 'Doctor suspended',
            detail: `${name} access was restricted.`,
            when: formatTimestamp(doctor.verifiedAt ?? doctor.createdAt),
            tone: 'slate' as const,
          };
        }
        if (status === 'rejected') {
          return {
            id: `doc-${doctor.id || index}`,
            title: 'Application rejected',
            detail: `${name} was not approved.`,
            when: formatTimestamp(doctor.verifiedAt ?? doctor.createdAt),
            tone: 'slate' as const,
          };
        }
        return {
          id: `doc-${doctor.id || index}`,
          title: 'Doctor application submitted',
          detail: `${name} is awaiting credential review.`,
          when: formatTimestamp(doctor.createdAt),
          tone: 'amber' as const,
        };
      });

    const userActivity = [...users]
      .sort((a, b) => this.toMillis(b.createdAt) - this.toMillis(a.createdAt))
      .slice(0, 3)
      .map((user, index) => ({
        id: `user-${user.id || index}`,
        title: 'User created',
        detail: `${getUserDisplayName(user)} joined as ${getUserRole(user)}.`,
        when: formatUserTimestamp(user.createdAt),
        tone: 'blue' as const,
      }));

    const postActivity = [...posts]
      .sort((a, b) => this.toMillis(b.timeStamp) - this.toMillis(a.timeStamp))
      .slice(0, 3)
      .map((post, index) => ({
        id: `post-${post.id || index}`,
        title: 'Community article published',
        detail: `${post.title || 'Untitled article'} · ${post.groupName || 'Community'}`,
        when: formatTimestamp(post.timeStamp),
        tone: 'green' as const,
      }));

    this.activityItems = [...doctorActivity, ...postActivity, ...userActivity]
      .sort((a, b) => (a.when < b.when ? 1 : -1))
      .slice(0, 8);
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
