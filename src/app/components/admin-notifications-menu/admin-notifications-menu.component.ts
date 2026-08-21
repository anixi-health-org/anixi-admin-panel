import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  AdminNotification,
  AdminNotificationsService,
} from '../../services/admin-notifications.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-notifications-menu',
  standalone: false,
  templateUrl: './admin-notifications-menu.component.html',
  styleUrl: './admin-notifications-menu.component.css',
})
export class AdminNotificationsMenuComponent implements OnInit, OnDestroy {
  isOpen = false;
  notifications: AdminNotification[] = [];
  unreadCount = 0;
  private sub = new Subscription();

  constructor(
    private notificationsService: AdminNotificationsService,
    private authService: AuthService,
    private router: Router,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.notificationsService.listenNotifications(20).subscribe({
        next: (items) => {
          this.notifications = items;
          this.unreadCount = this.notificationsService.unreadCount(
            items,
            this.authService.getAdminUserId()
          );
        },
        error: () => {
          this.notifications = [];
          this.unreadCount = 0;
        },
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.isOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    const target = event.target as Node;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.isOpen = false;
    }
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
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
    this.close();
    const href = item.href?.trim() || '/doctor-verification';
    void this.router.navigateByUrl(href);
  }

  async markAllRead(): Promise<void> {
    await this.notificationsService.markAllAsRead(this.notifications);
  }

  viewAll(): void {
    this.close();
    void this.router.navigate(['/notifications']);
  }
}
