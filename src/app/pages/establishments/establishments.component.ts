import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  combineLatest,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';
import {
  formatMemberRole,
  formatPracticeLocations,
  getPracticeName,
  getPracticeOrgType,
  practiceMatchesSearch,
  PracticeMemberRecord,
  PracticeRecord,
} from '../../utils/practice-record.utils';
import { formatUserTimestamp, PlatformUser } from '../../utils/user-record.utils';
import { paginateItems } from '../../utils/pagination.utils';

@Component({
  selector: 'app-establishments',
  standalone: false,
  templateUrl: './establishments.component.html',
  styleUrl: './establishments.component.css',
})
export class EstablishmentsComponent implements OnInit {
  isLoadingSkeleton = true;
  selectedPractice: PracticeRecord | null = null;
  searchQuery = new FormControl('');
  pageIndex = 1;
  pageSize = 25;
  clinicList$!: Observable<PracticeRecord[]>;
  filteredClinics$!: Observable<PracticeRecord[]>;
  members$!: Observable<PracticeMemberRecord[]>;
  clinicCount$!: Observable<number>;

  constructor(private firestoreService: FirestoreService) {}

  ngOnInit(): void {
    this.clinicList$ = combineLatest([
      this.firestoreService.getUsers(),
      this.firestoreService.getDoctors(),
    ]).pipe(
      switchMap(([users, doctors]) =>
        this.firestoreService.getPracticesForAdmin(
          users as PlatformUser[],
          doctors as Array<Record<string, unknown> & { id: string }>
        )
      ),
      map((practices) => practices.filter((p) => getPracticeOrgType(p) === 'clinic')),
      tap({
        next: () => (this.isLoadingSkeleton = false),
        error: () => (this.isLoadingSkeleton = false),
      }),
      shareReplay(1)
    );

    this.filteredClinics$ = combineLatest([
      this.clinicList$,
      this.searchQuery.valueChanges.pipe(startWith(this.searchQuery.value)),
    ]).pipe(
      map(([practices, query]) =>
        practices.filter((practice) => practiceMatchesSearch(practice, query || ''))
      )
    );

    this.clinicCount$ = this.clinicList$.pipe(map((items) => items.length));

    this.members$ = of([]);

    this.searchQuery.valueChanges.pipe(startWith(this.searchQuery.value)).subscribe(() => {
      this.pageIndex = 1;
    });
  }

  pageItems(practices: PracticeRecord[] | null): PracticeRecord[] {
    return paginateItems(practices ?? [], this.pageIndex, this.pageSize);
  }

  onPageIndexChange(page: number): void {
    this.pageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
  }

  name(practice: PracticeRecord): string {
    return getPracticeName(practice);
  }

  locations(practice: PracticeRecord): string {
    return formatPracticeLocations(practice);
  }

  created(practice: PracticeRecord): string {
    return formatUserTimestamp(practice.createdAt);
  }

  memberRole(member: PracticeMemberRecord): string {
    return formatMemberRole(member.role);
  }

  memberKind(member: PracticeMemberRecord): string {
    if (member.isClinician === false) return 'Administrator';
    if (member.isClinician === true || member.role === 'doctor') return 'Doctor';
    return formatMemberRole(member.role);
  }

  selectPractice(practice: PracticeRecord): void {
    this.selectedPractice = practice;
    this.members$ = this.firestoreService.getPracticeMembers(practice.id);
  }

  clearSelection(): void {
    this.selectedPractice = null;
    this.members$ = of([]);
  }
}
