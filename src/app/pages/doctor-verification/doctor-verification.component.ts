import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { UtilFunctions } from '../../../../const';
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
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  doctorMatchesSearch,
  getDoctorDisplayName,
  getDoctorProfilePhotoUrl,
  isDoctorVerificationCandidate,
  isIncompleteDoctorApplication,
  normalizeVerificationStatus,
} from '../../utils/doctor-record.utils';
import { paginateItems } from '../../utils/pagination.utils';

const statCards = [
  { label: 'Pending Review', status: 'pending', color: '#f69e23' },
  { label: 'On hold', status: 'on_hold', color: '#9a6110' },
  { label: 'Approved', status: 'approved', color: '#2cab6f' },
  { label: 'Rejected', status: 'rejected', color: '#dc2928' },
  { label: 'Suspended', status: 'suspended', color: '#66758a' },
];

const customInput = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'On hold', value: 'on_hold' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Suspended', value: 'suspended' },
];

@Component({
  selector: 'app-doctor-verification',
  standalone: false,
  templateUrl: './doctor-verification.component.html',
  styleUrl: './doctor-verification.component.css',
})
export class DoctorVerificationComponent implements OnInit, OnDestroy {
  statCards = statCards;
  customInput = customInput;
  verificationStatus = new FormControl('all');
  searchQuery = new FormControl('');
  selectedDoctorId: string | null = null;
  doctorList$!: Observable<any[]>;
  filteredDoctors$!: Observable<any[]>;
  totalCount$!: Observable<number>;
  approvedCount$!: Observable<number>;
  pendingCount$!: Observable<number>;
  rejectedCount$!: Observable<number>;
  suspendedCount$!: Observable<number>;
  onHoldCount$!: Observable<number>;
  isLoadingSkeleton = true;
  pageIndex = 1;
  pageSize = 20;
  private sub = new Subscription();
  isResponsive = false;

  constructor(
    public utilFunctions: UtilFunctions,
    private fireStoreService: FirestoreService,
    private breakPoint: BreakpointObserver,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const status = params.get('status');
      if (status && ['all', 'pending', 'approved', 'rejected', 'suspended', 'on_hold'].includes(status)) {
        this.verificationStatus.setValue(status);
      }
    });

    this.doctorList$ = this.fireStoreService.getDoctors(undefined, { limit: 100 }).pipe(
      map((doctors) => doctors.filter((doctor) => isDoctorVerificationCandidate(doctor))),
      tap({
        next: () => (this.isLoadingSkeleton = false),
        error: () => (this.isLoadingSkeleton = false),
      }),
      shareReplay(1)
    );
    this.filteredDoctors$ = combineLatest([
      this.doctorList$,
      this.verificationStatus.valueChanges.pipe(startWith(this.verificationStatus.value)),
      this.searchQuery.valueChanges.pipe(startWith(this.searchQuery.value)),
    ]).pipe(
      map(([doctors, status, query]) =>
        doctors.filter((doctor) => {
          const doctorStatus = normalizeVerificationStatus(doctor.verificationStatus);
          const matchesStatus = status === 'all' || doctorStatus === status;
          const matchesSearch = doctorMatchesSearch(doctor, query || '');
          return matchesStatus && matchesSearch;
        })
      )
    );

    this.totalCount$ = this.doctorList$.pipe(map((doctors) => doctors.length));
    this.approvedCount$ = this.doctorList$.pipe(
      map((doctors) =>
        doctors.filter((d) => normalizeVerificationStatus(d.verificationStatus) === 'approved')
          .length
      )
    );
    this.pendingCount$ = this.doctorList$.pipe(
      map((doctors) =>
        doctors.filter((d) => normalizeVerificationStatus(d.verificationStatus) === 'pending')
          .length
      )
    );
    this.rejectedCount$ = this.doctorList$.pipe(
      map((doctors) =>
        doctors.filter((d) => normalizeVerificationStatus(d.verificationStatus) === 'rejected')
          .length
      )
    );
    this.suspendedCount$ = this.doctorList$.pipe(
      map((doctors) =>
        doctors.filter((d) => normalizeVerificationStatus(d.verificationStatus) === 'suspended')
          .length
      )
    );
    this.onHoldCount$ = this.doctorList$.pipe(
      map((doctors) =>
        doctors.filter((d) => normalizeVerificationStatus(d.verificationStatus) === 'on_hold')
          .length
      )
    );

    this.sub.add(
      this.breakPoint.observe('(max-width:980px)').subscribe((result) => {
        this.isResponsive = result.matches;
      })
    );

    this.sub.add(
      combineLatest([
        this.verificationStatus.valueChanges.pipe(startWith(this.verificationStatus.value)),
        this.searchQuery.valueChanges.pipe(startWith(this.searchQuery.value)),
      ]).subscribe(() => {
        this.pageIndex = 1;
      })
    );
  }

  pageItems(doctors: any[] | null): any[] {
    return paginateItems(doctors ?? [], this.pageIndex, this.pageSize);
  }

  onPageIndexChange(page: number): void {
    this.pageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  getStatusValue(): string {
    return this.verificationStatus.value || 'all';
  }

  getCount(status: string): Observable<number> {
    switch (status) {
      case 'approved':
        return this.approvedCount$;
      case 'rejected':
        return this.rejectedCount$;
      case 'suspended':
        return this.suspendedCount$;
      case 'on_hold':
        return this.onHoldCount$;
      case 'all':
        return this.totalCount$;
      default:
        return this.pendingCount$;
    }
  }

  doctorName(doctor: any): string {
    return getDoctorDisplayName(doctor);
  }

  profilePhoto(doctor: any): string | null {
    return getDoctorProfilePhotoUrl(doctor);
  }

  doctorStatus(doctor: any): string {
    return normalizeVerificationStatus(doctor.verificationStatus);
  }

  isIncomplete(doctor: any): boolean {
    return isIncompleteDoctorApplication(doctor);
  }

  setSelectedDoctor(doctor: any): void {
    this.selectedDoctorId = doctor.id;
    if (!this.isResponsive) {
      window.scroll({ behavior: 'smooth', top: 0, left: 0 });
    } else {
      window.scroll({ behavior: 'smooth', top: document.body.scrollHeight, left: 0 });
    }
  }
}
