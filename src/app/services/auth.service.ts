import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  map,
} from 'rxjs';
import { AdminOpsRole, AdminPermissions, AdminUser } from '../models/admin-user';
import { DjangoApiService } from './django-api.service';

const SESSION_KEY = 'anixi_admin_session';

type StoredSession = {
  accessToken: string;
  refreshToken?: string;
  admin: AdminUser;
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly adminSubject = new BehaviorSubject<AdminUser | null>(null);
  private readonly authReadySubject = new BehaviorSubject(false);

  readonly adminUser$ = this.adminSubject.asObservable();
  readonly authReady$ = this.authReadySubject.asObservable();
  readonly isAuthenticatedAdmin$: Observable<boolean>;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private djangoApi: DjangoApiService,
    private router: Router,
  ) {
    this.isAuthenticatedAdmin$ = combineLatest([
      this.adminUser$,
      this.authReady$,
    ]).pipe(map(([adminUser, ready]) => ready && !!adminUser));
    this.djangoApi.setUnauthorizedHandler(() => this.forceSignOut());
    this.djangoApi.setTokensRefreshedHandler((access, refresh) => {
      const admin = this.adminSubject.value;
      if (!admin) return;
      this.persistSession(access, refresh, admin);
      this.scheduleRefresh(access);
    });
    void this.restoreSession();
  }

  private async restoreSession(): Promise<void> {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) {
        this.authReadySubject.next(true);
        return;
      }
      const stored = JSON.parse(raw) as StoredSession;
      if (!stored?.accessToken || !stored?.admin?.uid) {
        sessionStorage.removeItem(SESSION_KEY);
        this.authReadySubject.next(true);
        return;
      }
      this.djangoApi.setSession(stored.accessToken, stored.refreshToken ?? null);
      if (stored.refreshToken && this.accessExpiring(stored.accessToken)) {
        const refreshed = await this.djangoApi.refreshAccessToken();
        if (!refreshed) {
          this.forceSignOut();
          return;
        }
      }
      const me = await this.djangoApi.getMe();
      const role = String(me['role'] ?? '');
      const isStaff = Boolean(me['isStaff'] ?? me['is_staff']);
      if (role !== 'admin' && !isStaff) {
        this.clearSession();
        this.authReadySubject.next(true);
        return;
      }
      const admin = this.mapMeToAdminUser(me, stored.admin);
      this.adminSubject.next(admin);
      this.persistSession(
        this.djangoApi.getAccessToken() || stored.accessToken,
        this.djangoApi.getRefreshToken() || stored.refreshToken || '',
        admin,
      );
    } catch {
      this.forceSignOut();
    } finally {
      this.authReadySubject.next(true);
    }
  }

  private persistSession(accessToken: string, refreshToken: string, admin: AdminUser): void {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ accessToken, refreshToken, admin } satisfies StoredSession),
    );
    this.scheduleRefresh(accessToken);
  }

  private scheduleRefresh(accessToken: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const exp = this.readExpiry(accessToken);
    // Refresh one minute before expiry. If that moment has passed, refresh now.
    const delay = exp ? Math.max(exp - Date.now() - 60_000, 0) : 10 * 60_000;
    this.refreshTimer = setTimeout(() => {
      void this.djangoApi.refreshAccessToken().then((access) => {
        if (!access) this.forceSignOut();
      });
    }, delay);
  }

  private accessExpiring(token: string): boolean {
    const exp = this.readExpiry(token);
    return !exp || exp - Date.now() < 60_000;
  }

  private readExpiry(token: string): number | null {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return null;
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded)) as { exp?: number };
      return payload.exp ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    sessionStorage.removeItem(SESSION_KEY);
    this.djangoApi.setSession(null, null);
    this.adminSubject.next(null);
  }

  /** Drop the shell immediately when the API rejects the session. */
  forceSignOut(): void {
    this.clearSession();
    const onLogin = this.router.url.startsWith('/login');
    if (!onLogin) {
      void this.router.navigate(['/login'], { replaceUrl: true });
    }
  }

  async signIn(email: string, password: string): Promise<AdminUser> {
    const result = await this.djangoApi.login(email.trim(), password);
    const userRecord = result.user;
    const role = String(userRecord['role'] ?? '');
    const isStaff = Boolean(userRecord['isStaff'] ?? userRecord['is_staff']);
    if (role !== 'admin' && !isStaff) {
      this.clearSession();
      throw new Error(
        'Access denied. This account is not authorized for the admin portal.',
      );
    }
    this.djangoApi.setSession(result.tokens.access, result.tokens.refresh);
    const admin = this.mapMeToAdminUser(userRecord, {
      uid: String(userRecord['id'] ?? userRecord['uid'] ?? ''),
      email: String(userRecord['email'] ?? email),
      displayName: String(
        userRecord['displayName'] ?? userRecord['display_name'] ?? 'Admin',
      ),
      role: 'admin',
    });
    this.persistSession(result.tokens.access, result.tokens.refresh, admin);
    this.adminSubject.next(admin);
    this.authReadySubject.next(true);
    return admin;
  }

  async signOut(): Promise<void> {
    this.clearSession();
  }

  getAdminUser(): AdminUser | null {
    return this.adminSubject.value;
  }

  getAdminUserId(): string | null {
    return this.adminSubject.value?.uid ?? null;
  }

  hasPermission(key: keyof AdminPermissions): boolean {
    const admin = this.adminSubject.value;
    if (!admin) return false;
    if (admin.role === 'super_admin' || admin.opsRole === 'super_admin') return true;
    return Boolean(admin.permissions?.[key]);
  }

  private mapMeToAdminUser(
    me: Record<string, unknown>,
    fallback: AdminUser,
  ): AdminUser {
    const profile = (me['adminProfile'] ?? me['admin_profile']) as
      | Record<string, unknown>
      | undefined;
    const opsRole = String(profile?.['opsRole'] ?? profile?.['ops_role'] ?? '') as AdminOpsRole;
    const permissions = (profile?.['permissions'] ?? {}) as AdminPermissions;
    return {
      uid: String(me['id'] ?? me['uid'] ?? fallback.uid),
      email: String(me['email'] ?? fallback.email),
      displayName: String(me['displayName'] ?? me['display_name'] ?? fallback.displayName),
      role: opsRole === 'super_admin' ? 'super_admin' : 'admin',
      opsRole: opsRole || fallback.opsRole,
      permissions,
    };
  }
}
