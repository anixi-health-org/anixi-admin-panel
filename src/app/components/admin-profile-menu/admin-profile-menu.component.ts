import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AdminUser } from '../../models/admin-user';

@Component({
  selector: 'app-admin-profile-menu',
  standalone: false,
  templateUrl: './admin-profile-menu.component.html',
  styleUrl: './admin-profile-menu.component.css',
})
export class AdminProfileMenuComponent implements OnDestroy {
  @Input() adminUser: AdminUser | null = null;

  isOpen = false;
  isSigningOut = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) {
      return;
    }
    const target = event.target as Node;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.isOpen = false;
    }
  }

  ngOnDestroy(): void {
    this.isOpen = false;
  }

  get initials(): string {
    const name = this.adminUser?.displayName || 'Admin';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  get firstName(): string {
    return this.adminUser?.displayName?.split(' ')[0] || 'Admin';
  }

  get roleLabel(): string {
    return this.adminUser?.role === 'super_admin' ? 'Super Admin' : 'Admin';
  }

  toggleMenu(): void {
    this.isOpen = !this.isOpen;
  }

  closeMenu(): void {
    this.isOpen = false;
  }

  async signOut(): Promise<void> {
    if (this.isSigningOut) {
      return;
    }
    this.isSigningOut = true;
    this.closeMenu();
    try {
      await this.authService.signOut();
      await this.router.navigate(['/login']);
    } finally {
      this.isSigningOut = false;
    }
  }
}
