import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import {
  combineLatest,
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
  userMatchesSearch,
  UserRoleFilter,
} from '../../utils/user-record.utils';
import { paginateItems } from '../../utils/pagination.utils';

const roleFilters: { label: string; value: UserRoleFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Patients', value: 'patient' },
  { label: 'Doctors', value: 'doctor' },
  { label: 'Clinic admins', value: 'clinic_admin' },
  { label: 'Caregivers', value: 'caregiver' },
  { label: 'Admins', value: 'admin' },
];

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
  userList$!: Observable<PlatformUser[]>;
  filteredUsers$!: Observable<PlatformUser[]>;
  totalCount$!: Observable<number>;
  patientCount$!: Observable<number>;
  doctorCount$!: Observable<number>;
  clinicAdminCount$!: Observable<number>;
  caregiverCount$!: Observable<number>;
  adminCount$!: Observable<number>;
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
      })
    );
    this.sub.add(
      combineLatest([
        this.roleFilter.valueChanges.pipe(startWith(this.roleFilter.value)),
        this.searchQuery.valueChanges.pipe(startWith(this.searchQuery.value)),
      ]).subscribe(() => {
        this.pageIndex = 1;
      })
    );

    this.userList$ = combineLatest([
      this.fireStoreService.getUsers(),
      this.fireStoreService.getDoctors(),
    ]).pipe(
      switchMap(([users, doctors]) =>
        this.fireStoreService
          .getPracticesForAdmin(users as PlatformUser[], doctors)
          .pipe(
            map((practices) =>
              this.fireStoreService.buildUsersWithPracticeContext(
                users as PlatformUser[],
                doctors as Array<Record<string, unknown> & { id: string }>,
                practices
              )
            )
          )
      ),
      tap({
        next: (users) => {
          this.isLoadingSkeleton = false;
          if (this.selectedUser) {
            this.selectedUser = users.find((u) => u.id === this.selectedUser?.id) ?? this.selectedUser;
          }
        },
        error: () => (this.isLoadingSkeleton = false),
      }),
      shareReplay(1)
    );

    this.filteredUsers$ = combineLatest([
      this.userList$,
      this.roleFilter.valueChanges.pipe(startWith(this.roleFilter.value)),
      this.searchQuery.valueChanges.pipe(startWith(this.searchQuery.value)),
    ]).pipe(
      map(([users, role, query]) =>
        users.filter((user) => {
          const userRole = getUserRole(user);
          const matchesRole = role === 'all' || userRole === role;
          return matchesRole && userMatchesSearch(user, query || '');
        })
      )
    );

    this.totalCount$ = this.userList$.pipe(map((users) => users.length));
    this.patientCount$ = this.userList$.pipe(
      map((users) => users.filter((u) => getUserRole(u) === 'patient').length)
    );
    this.doctorCount$ = this.userList$.pipe(
      map((users) => users.filter((u) => getUserRole(u) === 'doctor').length)
    );
    this.clinicAdminCount$ = this.userList$.pipe(
      map((users) => users.filter((u) => getUserRole(u) === 'clinic_admin').length)
    );
    this.caregiverCount$ = this.userList$.pipe(
      map((users) => users.filter((u) => getUserRole(u) === 'caregiver').length)
    );
    this.adminCount$ = this.userList$.pipe(
      map((users) => users.filter((u) => getUserRole(u) === 'admin').length)
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  pageItems(users: PlatformUser[] | null): PlatformUser[] {
    return paginateItems(users ?? [], this.pageIndex, this.pageSize);
  }

  onPageIndexChange(page: number): void {
    this.pageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
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
