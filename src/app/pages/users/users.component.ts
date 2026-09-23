import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  Observable,
  shareReplay,
  startWith,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';
import {
  ERROR_NOTIFICATION_BOX_POSITION,
  SUCCESS_NOTIFICATION_BOX_POSITION,
} from '../../../../const';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import {
  formatAccountStatusLabel,
  formatUserRoleLabel,
  formatUserTimestamp,
  getUserDisplayName,
  getUserEmail,
  getUserPhone,
  getUserRole,
  PlatformUser,
  UserRoleFilter,
} from '../../utils/user-record.utils';

const roleFilters: { label: string; value: UserRoleFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Patients', value: 'patient' },
  { label: 'Doctors', value: 'doctor' },
  { label: 'Clinic admins', value: 'clinic_admin' },
  { label: 'Caregivers', value: 'caregiver' },
  { label: 'Admins', value: 'admin' },
];

type AdminUserStats = {
  totalUsers: number;
  patients: number;
  doctors: number;
  clinicAdmins: number;
  caregivers: number;
  admins: number;
};

@Component({
  selector: 'app-users',
  standalone: false,
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
})
export class UsersComponent implements OnInit, OnDestroy {
  roleFilters = roleFilters;
  isLoadingSkeleton = true;
  pageIndex = 1;
  pageSize = 25;
  selectedUser: PlatformUser | null = null;
  isUpdating = false;
  isEditingContact = false;
  canEditContact = false;
  contactDisplayName = '';
  contactEmail = '';
  contactPhone = '';
  roleFilter = new FormControl<UserRoleFilter>('all');
  searchQuery = new FormControl('');
  filteredUsers$!: Observable<PlatformUser[]>;
  directoryTotal$!: Observable<number>;
  totalCount$!: Observable<number>;
  patientCount$!: Observable<number>;
  doctorCount$!: Observable<number>;
  clinicAdminCount$!: Observable<number>;
  caregiverCount$!: Observable<number>;
  adminCount$!: Observable<number>;
  private pageIndex$ = new BehaviorSubject(1);
  private pageSize$ = new BehaviorSubject(25);
  private stats$!: Observable<AdminUserStats>;
  private sub = new Subscription();

  constructor(
    private fireStoreService: FirestoreService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private notification: NzNotificationService
  ) {}

  ngOnInit(): void {
    this.canEditContact = this.authService.hasPermission('editUserContact');
    this.sub.add(
      this.route.queryParamMap.subscribe((params) => {
        const q = params.get('q');
        if (q) this.searchQuery.setValue(q);
        const role = params.get('role') as UserRoleFilter | null;
        if (role && this.roleFilters.some((filter) => filter.value === role)) {
          this.roleFilter.setValue(role);
        }
      })
    );

    this.stats$ = this.fireStoreService.getAdminStats().pipe(
      map(
        (stats): AdminUserStats => ({
          totalUsers: stats.totalUsers ?? 0,
          patients: stats.patients ?? 0,
          doctors: stats.doctors ?? 0,
          clinicAdmins: stats.clinicAdmins ?? 0,
          caregivers: stats.caregivers ?? 0,
          admins: stats.admins ?? 0,
        })
      ),
      shareReplay(1)
    );

    this.totalCount$ = this.stats$.pipe(map((s) => s.totalUsers));
    this.patientCount$ = this.stats$.pipe(map((s) => s.patients));
    this.doctorCount$ = this.stats$.pipe(map((s) => s.doctors));
    this.clinicAdminCount$ = this.stats$.pipe(map((s) => s.clinicAdmins));
    this.caregiverCount$ = this.stats$.pipe(map((s) => s.caregivers));
    this.adminCount$ = this.stats$.pipe(map((s) => s.admins));

    const roleForApi$ = this.roleFilter.valueChanges.pipe(
      startWith(this.roleFilter.value),
      map((role) => (role && role !== 'all' ? role : undefined)),
      distinctUntilChanged()
    );

    const search$ = this.searchQuery.valueChanges.pipe(
      debounceTime(250),
      startWith(this.searchQuery.value),
      map((q) => (q || '').trim()),
      distinctUntilChanged()
    );

    this.sub.add(
      combineLatest([roleForApi$, search$]).subscribe(() => {
        this.pageIndex = 1;
        this.pageIndex$.next(1);
      })
    );

    const directoryPage$ = combineLatest([
      roleForApi$,
      search$,
      this.pageIndex$,
      this.pageSize$,
    ]).pipe(
      tap(() => {
        this.isLoadingSkeleton = true;
      }),
      switchMap(([role, q, page, pageSize]) =>
        this.fireStoreService.getUsersPage({
          role,
          q: q || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
      ),
      tap({
        next: (page) => {
          this.isLoadingSkeleton = false;
          if (this.selectedUser) {
            this.selectedUser =
              page.users.find((u) => u.id === this.selectedUser?.id) ?? this.selectedUser;
          }
        },
        error: () => {
          this.isLoadingSkeleton = false;
        },
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    // Eager subscribe: template async pipes sit behind the skeleton gate and would
    // otherwise never start this request (deadlock → infinite skeleton).
    this.sub.add(directoryPage$.subscribe());

    this.filteredUsers$ = directoryPage$.pipe(
      map((page) => page.users as PlatformUser[]),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.directoryTotal$ = directoryPage$.pipe(map((page) => page.total));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  pageItems(users: PlatformUser[] | null): PlatformUser[] {
    return users ?? [];
  }

  onPageIndexChange(page: number): void {
    this.pageIndex = page;
    this.pageIndex$.next(page);
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
    this.pageIndex$.next(1);
    this.pageSize$.next(size);
  }

  countFor(role: UserRoleFilter): Observable<number> {
    switch (role) {
      case 'patient':
        return this.patientCount$;
      case 'doctor':
        return this.doctorCount$;
      case 'clinic_admin':
        return this.clinicAdminCount$;
      case 'caregiver':
        return this.caregiverCount$;
      case 'admin':
        return this.adminCount$;
      default:
        return this.totalCount$;
    }
  }

  displayName(user: PlatformUser): string {
    return getUserDisplayName(user);
  }

  email(user: PlatformUser): string {
    return getUserEmail(user);
  }

  phone(user: PlatformUser): string {
    return getUserPhone(user);
  }

  role(user: PlatformUser): string {
    return formatUserRoleLabel(getUserRole(user));
  }

  roleClass(user: PlatformUser): string {
    const r = getUserRole(user);
    if (r === 'doctor') return 'ops-badge--blue';
    if (r === 'patient') return 'ops-badge--green';
    if (r === 'caregiver') return 'ops-badge--pending';
    if (r === 'clinic_admin') return 'ops-badge--hold';
    if (r === 'admin') return 'ops-badge--slate';
    return 'ops-badge--slate';
  }

  created(user: PlatformUser): string {
    return formatUserTimestamp(user.createdAt);
  }

  accountStatus(user: PlatformUser): string {
    return formatAccountStatusLabel(user.accountStatus || user.verificationStatus);
  }

  managedClinic(user: PlatformUser): string {
    const name = typeof user.managedClinicName === 'string' ? user.managedClinicName.trim() : '';
    return name || '—';
  }

  isDoctor(user: PlatformUser): boolean {
    return getUserRole(user) === 'doctor';
  }

  isClinicAdmin(user: PlatformUser): boolean {
    return getUserRole(user) === 'clinic_admin';
  }

  canHoldOrSuspend(user: PlatformUser): boolean {
    return this.isDoctor(user) || this.isClinicAdmin(user);
  }

  isHeld(user: PlatformUser): boolean {
    const status = String(user.accountStatus || user.verificationStatus || '').toLowerCase();
    return status === 'on_hold';
  }

  isSuspended(user: PlatformUser): boolean {
    return String(user.accountStatus || user.verificationStatus || '').toLowerCase() === 'suspended';
  }

  initials(user: PlatformUser): string {
    const name = getUserDisplayName(user);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  selectUser(user: PlatformUser): void {
    this.selectedUser = user;
    this.isEditingContact = false;
    this.syncContactForm(user);
  }

  clearSelection(): void {
    this.selectedUser = null;
    this.isEditingContact = false;
  }

  startContactEdit(): void {
    if (!this.selectedUser || !this.canEditContact) return;
    this.syncContactForm(this.selectedUser);
    this.isEditingContact = true;
  }

  cancelContactEdit(): void {
    this.isEditingContact = false;
    if (this.selectedUser) this.syncContactForm(this.selectedUser);
  }

  private syncContactForm(user: PlatformUser): void {
    this.contactDisplayName = getUserDisplayName(user);
    this.contactEmail = getUserEmail(user);
    this.contactPhone = getUserPhone(user);
  }

  async saveContactDetails(): Promise<void> {
    if (!this.selectedUser || !this.canEditContact || this.isUpdating) return;
    this.isUpdating = true;
    try {
      await this.fireStoreService.updateUserContact(this.selectedUser.id, {
        displayName: this.contactDisplayName.trim(),
        email: this.contactEmail.trim(),
        phoneNumber: this.contactPhone.trim(),
      });
      this.selectedUser = {
        ...this.selectedUser,
        displayName: this.contactDisplayName.trim(),
        email: this.contactEmail.trim(),
        phoneNumber: this.contactPhone.trim(),
      };
      this.isEditingContact = false;
      this.notification.create(
        'success',
        'Contact updated',
        'User contact details were saved.',
        SUCCESS_NOTIFICATION_BOX_POSITION,
      );
    } catch (error) {
      this.notification.create(
        'error',
        'Save failed',
        error instanceof Error ? error.message : 'Could not update contact details.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    } finally {
      this.isUpdating = false;
    }
  }

  async markAsClinicAdmin(): Promise<void> {
    if (!this.selectedUser || this.isUpdating) return;
    const confirmed = window.confirm(
      `${this.displayName(this.selectedUser)} will be treated as a clinic administrator, not a practicing doctor. Continue?`
    );
    if (!confirmed) return;
    this.isUpdating = true;
    try {
      await this.fireStoreService.markAsClinicAdmin(this.selectedUser.id);
      this.notification.create(
        'success',
        'Updated',
        'This account is now a clinic admin.',
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch (error) {
      this.notification.create(
        'error',
        'Action failed',
        error instanceof Error ? error.message : 'Could not reclassify this account.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }

  async setAccountStatus(status: 'on_hold' | 'suspended' | 'active'): Promise<void> {
    if (!this.selectedUser || this.isUpdating) return;
    let reason: string | undefined;
    if (status !== 'active') {
      const prompted = window.prompt(
        status === 'on_hold'
          ? 'Reason for holding this account for further review (required):'
          : 'Reason for suspending this account (required):'
      );
      if (prompted === null) return;
      reason = prompted.trim();
      if (!reason) {
        this.notification.create(
          'error',
          'Reason required',
          'Please provide a reason before continuing.',
          ERROR_NOTIFICATION_BOX_POSITION
        );
        return;
      }
    }
    this.isUpdating = true;
    try {
      await this.fireStoreService.updateUserAccountStatus(this.selectedUser.id, status, reason);
      this.notification.create(
        'success',
        'Updated',
        status === 'active'
          ? 'Account reinstated.'
          : status === 'on_hold'
            ? 'Account held for further review.'
            : 'Account suspended.',
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch (error) {
      this.notification.create(
        'error',
        'Action failed',
        error instanceof Error ? error.message : 'Could not update account status.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }
}
