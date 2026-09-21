import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  AdminNotification,
  AdminNotificationsService,
} from '../../services/admin-notifications.service';
import { AuthService } from '../../services/auth.service';
import { paginateItems } from '../../utils/pagination.utils';

@Component({
  selector: 'app-notifications',
  standalone: false,
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css',
})
export class NotificationsComponent implements OnInit, OnDestroy {
  notifications: AdminNotification[] = [];
  isLoading = true;
  loadError: string | null = null;
  pageIndex = 1;
  pageSize = 20;
  private sub = new Subscription();

  constructor(
    private notificationsService: AdminNotificationsService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.notificationsService.listenNotifications(100).subscribe({
        next: (items) => {
          this.notifications = items;
          this.isLoading = false;
          this.loadError = null;
        },
        error: () => {
          this.isLoading = false;
          this.loadError = 'Could not load notifications from the API.';
        },
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get pagedNotifications(): AdminNotification[] {
    return paginateItems(this.notifications, this.pageIndex, this.pageSize);
  }

  onPageIndexChange(page: number): void {
    this.pageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
  }

  get unreadCount(): number {
    return this.notificationsService.unreadCount(
      this.notifications,
      this.authService.getAdminUserId()
    );
  }

  isUnread(item: AdminNotification): boolean {
    return this.notificationsService.isUnread(
      item,
      this.authService.getAdminUserId()
    );
  }

  formatWhen(item: AdminNotification): string {
    return this.notificationsService.formatWhen(item.createdAt);
  }

  async openNotification(item: AdminNotification): Promise<void> {
    await this.notificationsService.markAsRead(item.id);
    const href = item.href?.trim() || '/doctor-verification';
    void this.router.navigateByUrl(href);
  }

  async markAllRead(): Promise<void> {
    await this.notificationsService.markAllAsRead(this.notifications);
    this.notifications = this.notifications.map((item) => {
      const adminId = this.authService.getAdminUserId();
      if (!adminId || !item.id) return item;
      const readBy = new Set(item.readBy ?? []);
      readBy.add(adminId);
      return { ...item, readBy: [...readBy] };
    });
  }
}
