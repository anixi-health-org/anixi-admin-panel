import { Injectable } from '@angular/core';
import { interval, Observable, startWith, switchMap } from 'rxjs';
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
  constructor(
    private authService: AuthService,
    private djangoApi: DjangoApiService,
  ) {}

  listenNotifications(max = 50): Observable<AdminNotification[]> {
    return interval(60_000).pipe(
      startWith(0),
      switchMap(async () => {
        if (!this.authService.getAdminUserId()) {
          return [] as AdminNotification[];
        }
        try {
          const doctors = await this.djangoApi.listDoctors('pending');
          return doctors.slice(0, max).map((doctor) => ({
            id: String(doctor['id'] ?? ''),
            type: 'doctor_application',
            title: 'Doctor application pending review',
            body: String(doctor['displayName'] ?? doctor['email'] ?? 'Unknown doctor'),
            href: '/doctor-verification',
            doctorId: String(doctor['id'] ?? ''),
            createdAt: doctor['createdAt'] ?? null,
            readBy: [],
          }));
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

  async markAsRead(_notificationId: string): Promise<void> {
    return;
  }

  async markAllAsRead(_notifications: AdminNotification[]): Promise<void> {
    return;
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
}
