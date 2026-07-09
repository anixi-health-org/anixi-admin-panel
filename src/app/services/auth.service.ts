import { Injectable } from '@angular/core';
import {
  Auth,
  User,
  signInWithEmailAndPassword,
  signOut,
  user,
} from '@angular/fire/auth';
import { doc, Firestore, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  from,
  map,
  of,
  switchMap,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { AdminUser } from '../models/admin-user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly adminSubject = new BehaviorSubject<AdminUser | null>(null);
  private readonly authReadySubject = new BehaviorSubject(false);

  readonly firebaseUser$: Observable<User | null>;
  readonly adminUser$ = this.adminSubject.asObservable();
  readonly authReady$ = this.authReadySubject.asObservable();

  readonly isAuthenticatedAdmin$: Observable<boolean>;

  constructor(
    private auth: Auth,
    private firestore: Firestore
  ) {
    this.firebaseUser$ = user(this.auth);

    this.isAuthenticatedAdmin$ = combineLatest([
      this.firebaseUser$,
      this.adminUser$,
      this.authReady$,
    ]).pipe(
      map(([firebaseUser, adminUser, ready]) => ready && !!firebaseUser && !!adminUser)
    );

    this.firebaseUser$
      .pipe(
        switchMap((firebaseUser) => {
          if (!firebaseUser) {
            this.adminSubject.next(null);
            this.authReadySubject.next(true);
            return of(null);
          }
          return from(this.resolveAdminUser(firebaseUser));
        })
      )
      .subscribe((admin) => {
        this.adminSubject.next(admin);
        this.authReadySubject.next(true);
      });
  }

  async signIn(email: string, password: string): Promise<AdminUser> {
    const credential = await signInWithEmailAndPassword(
      this.auth,
      email.trim(),
      password
    );
    const admin = await this.resolveAdminUser(credential.user);
    if (!admin) {
      await signOut(this.auth);
      throw new Error(
        'Access denied. This account is not authorized for the admin portal.'
      );
    }
    this.adminSubject.next(admin);
    return admin;
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.adminSubject.next(null);
  }

  getAdminUser(): AdminUser | null {
    return this.adminSubject.value;
  }

  getAdminUserId(): string | null {
    return this.adminSubject.value?.uid ?? null;
  }

  private async resolveAdminUser(firebaseUser: User): Promise<AdminUser | null> {
    const uid = firebaseUser.uid;
    const email = firebaseUser.email ?? '';

    if (this.isAllowlistedAdmin(uid)) {
      await this.ensureAdminDocument(uid, email, firebaseUser.displayName);
      return {
        uid,
        email,
        displayName: firebaseUser.displayName || email.split('@')[0] || 'Admin',
        role: 'super_admin',
      };
    }

    const adminDoc = await getDoc(doc(this.firestore, 'admins', uid));
    if (!adminDoc.exists()) {
      return null;
    }

    const data = adminDoc.data();
    if (data['active'] === false) {
      return null;
    }

    return {
      uid,
      email: (data['email'] as string) || email,
      displayName:
        (data['displayName'] as string) ||
        firebaseUser.displayName ||
        'Admin',
      role: (data['role'] as AdminUser['role']) || 'admin',
    };
  }

  private isAllowlistedAdmin(uid: string): boolean {
    return environment.ADMIN_UIDS.includes(uid);
  }

  private async ensureAdminDocument(
    uid: string,
    email: string,
    displayName: string | null
  ): Promise<void> {
    const adminRef = doc(this.firestore, 'admins', uid);
    const existing = await getDoc(adminRef);
    if (existing.exists()) {
      return;
    }

    try {
      await setDoc(adminRef, {
        email,
        displayName: displayName || email.split('@')[0] || 'Admin',
        role: 'super_admin',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Rules may block auto-provision; allowlisted UID still works in app.
    }
  }
}
