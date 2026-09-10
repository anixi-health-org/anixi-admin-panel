import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  map,
} from 'rxjs';
import { AdminUser } from '../models/admin-user';
import { DjangoApiService } from './django-api.service';

const SESSION_KEY = 'anixi_admin_session';

type StoredSession = {
  accessToken: string;
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

  constructor(private djangoApi: DjangoApiService) {
    this.isAuthenticatedAdmin$ = combineLatest([
      this.adminUser$,
      this.authReady$,
    ]).pipe(map(([adminUser, ready]) => ready && !!adminUser));
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
      this.djangoApi.setAccessToken(stored.accessToken);
      const me = await this.djangoApi.getMe();
      const role = String(me['role'] ?? '');
      const isStaff = Boolean(me['isStaff'] ?? me['is_staff']);
      if (role !== 'admin' && !isStaff) {
        this.clearSession();
        this.authReadySubject.next(true);
        return;
      }
      const admin: AdminUser = {
        uid: String(me['id'] ?? me['uid'] ?? stored.admin.uid),
        email: String(me['email'] ?? stored.admin.email),
        displayName: String(
          me['displayName'] ?? me['display_name'] ?? stored.admin.displayName,
        ),
        role: 'admin',
      };
      this.adminSubject.next(admin);
      this.persistSession(stored.accessToken, admin);
    } catch {
      this.clearSession();
    } finally {
      this.authReadySubject.next(true);
    }
  }

  private persistSession(accessToken: string, admin: AdminUser): void {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ accessToken, admin } satisfies StoredSession),
    );
  }

  private clearSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
    this.djangoApi.setAccessToken(null);
    this.adminSubject.next(null);
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
    this.djangoApi.setAccessToken(result.tokens.access);
    const admin: AdminUser = {
      uid: String(userRecord['id'] ?? userRecord['uid'] ?? ''),
      email: String(userRecord['email'] ?? email),
      displayName: String(
        userRecord['displayName'] ?? userRecord['display_name'] ?? 'Admin',
      ),
      role: 'admin',
    };
    this.persistSession(result.tokens.access, admin);
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
}
