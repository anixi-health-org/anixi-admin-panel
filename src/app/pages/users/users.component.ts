import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  combineLatest,
  map,
  Observable,
  shareReplay,
  startWith,
  Subscription,
  tap,
} from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';
import {
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

const roleFilters: { label: string; value: UserRoleFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Patients', value: 'patient' },
  { label: 'Doctors', value: 'doctor' },
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
  selectedUser: PlatformUser | null = null;
  roleFilter = new FormControl<UserRoleFilter>('all');
  searchQuery = new FormControl('');
  userList$!: Observable<PlatformUser[]>;
  filteredUsers$!: Observable<PlatformUser[]>;
  totalCount$!: Observable<number>;
  patientCount$!: Observable<number>;
  doctorCount$!: Observable<number>;
  caregiverCount$!: Observable<number>;
  adminCount$!: Observable<number>;
  private sub = new Subscription();

  constructor(
    private fireStoreService: FirestoreService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.route.queryParamMap.subscribe((params) => {
        const q = params.get('q');
        if (q) this.searchQuery.setValue(q);
      })
    );

    this.userList$ = this.fireStoreService.getUsers().pipe(
      map((users) => users as PlatformUser[]),
      tap({
        next: () => (this.isLoadingSkeleton = false),
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

  countFor(role: UserRoleFilter): Observable<number> {
    switch (role) {
      case 'patient':
        return this.patientCount$;
      case 'doctor':
        return this.doctorCount$;
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
    if (r === 'admin') return 'ops-badge--slate';
    return 'ops-badge--slate';
  }

  created(user: PlatformUser): string {
    return formatUserTimestamp(user.createdAt);
  }

  initials(user: PlatformUser): string {
    const name = getUserDisplayName(user);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  selectUser(user: PlatformUser): void {
    this.selectedUser = user;
  }

  clearSelection(): void {
    this.selectedUser = null;
  }
}
