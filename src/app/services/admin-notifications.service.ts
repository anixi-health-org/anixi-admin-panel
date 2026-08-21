import { Injectable } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  Firestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  doctorId?: string | null;
  createdAt?: { toDate?: () => Date } | Date | null;
  readBy?: string[];
};

@Injectable({
  providedIn: 'root',
})
export class AdminNotificationsService {
  constructor(
    private db: Firestore,
    private authService: AuthService
  ) {}

  listenNotifications(max = 50): Observable<AdminNotification[]> {
    return new Observable((observer) => {
      const ref = query(
        collection(this.db, 'admin_notifications'),
        orderBy('createdAt', 'desc'),
        limit(max)
      );
      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const items = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminNotification, 'id'>),
          }));
          observer.next(items);
        },
        (error) => observer.error(error)
      );
      return () => unsubscribe();
    });
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
    const uid = this.authService.getAdminUserId();
    if (!uid || !notificationId) return;
    await updateDoc(doc(this.db, 'admin_notifications', notificationId), {
      readBy: arrayUnion(uid),
    });
  }

  async markAllAsRead(notifications: AdminNotification[]): Promise<void> {
    const uid = this.authService.getAdminUserId();
    if (!uid) return;
    const unread = notifications.filter((n) => this.isUnread(n, uid));
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(this.db, 'admin_notifications', n.id), {
          readBy: arrayUnion(uid),
        })
      )
    );
  }

  formatWhen(value: AdminNotification['createdAt']): string {
    if (!value) return '';
    const date =
      value instanceof Date
        ? value
        : typeof value === 'object' && value && 'toDate' in value
          ? value.toDate?.()
          : null;
    if (!date) return '';
    return date.toLocaleString();
  }
}
