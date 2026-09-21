import { Injectable } from '@angular/core';
import {
  interval,
  merge,
  Observable,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import { AuthService } from './auth.service';
import { DjangoApiService } from './django-api.service';

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  doctorId?: string | null;
  createdAt?: { toDate?: () => Date } | Date | string | null;
  readBy?: string[];
};

@Injectable({
  providedIn: 'root',
})
export class AdminNotificationsService {
  private readIds = new Set<string>();
  private readonly refresh$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private djangoApi: DjangoApiService,
  ) {}

  listenNotifications(max = 50): Observable<AdminNotification[]> {
    return merge(interval(60_000).pipe(startWith(0)), this.refresh$).pipe(
      switchMap(async () => {
        const adminId = this.authService.getAdminUserId();
        if (!adminId) {
          return [] as AdminNotification[];
        }

        this.loadReadIds(adminId);

        try {
          const doctors = await this.djangoApi.listDoctors('pending');
          return doctors.slice(0, max).map((doctor) => {
            const id = String(doctor['id'] ?? '');
            return {
              id,
              type: 'doctor_application',
              title: 'Doctor application pending review',
              body: String(doctor['displayName'] ?? doctor['email'] ?? 'Unknown doctor'),
              href: '/doctor-verification',
              doctorId: id,
              createdAt: doctor['createdAt'] ?? null,
              readBy: this.readIds.has(id) ? [adminId] : [],
            };
          });
        } catch {
          return [] as AdminNotification[];
        }
      }),
    );
  }

  isUnread(notification: AdminNotification, adminId?: string | null): boolean {
    const uid = adminId || this.authService.getAdminUserId();
    if (!uid) return true;
    const readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
    return !readBy.includes(uid);
  }

  unreadCount(notifications: AdminNotification[], adminId?: string | null): number {
    return notifications.filter((n) => this.isUnread(n, adminId)).length;
  }

  async markAsRead(notificationId: string): Promise<void> {
    const id = notificationId.trim();
    if (!id) return;
    this.readIds.add(id);
    this.persistReadIds();
    this.refresh$.next();
  }

  async markAllAsRead(notifications: AdminNotification[]): Promise<void> {
    for (const notification of notifications) {
      if (notification.id) {
        this.readIds.add(notification.id);
      }
    }
    this.persistReadIds();
    this.refresh$.next();
  }

  formatWhen(value: AdminNotification['createdAt']): string {
    if (!value) return '';
    const date =
      value instanceof Date
        ? value
        : typeof value === 'string'
          ? new Date(value)
          : typeof value === 'object' && value && 'toDate' in value
            ? value.toDate?.()
            : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  private storageKey(adminId: string): string {
    return `anixi-admin-read-notification-ids:${adminId}`;
  }

  private loadReadIds(adminId: string): void {
    try {
      const raw = localStorage.getItem(this.storageKey(adminId));
      const parsed = raw ? JSON.parse(raw) : [];
      this.readIds = new Set(
        Array.isArray(parsed) ? parsed.map((value) => String(value)) : [],
      );
    } catch {
      this.readIds = new Set();
    }
  }

  private persistReadIds(): void {
    const adminId = this.authService.getAdminUserId();
    if (!adminId) return;
    localStorage.setItem(
      this.storageKey(adminId),
      JSON.stringify([...this.readIds]),
    );
  }
}
