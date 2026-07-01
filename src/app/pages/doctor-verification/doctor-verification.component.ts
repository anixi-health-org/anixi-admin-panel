import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { UtilFunctions } from '../../../../const';
import { map, Observable, shareReplay, Subscription, tap } from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';
import {BreakpointObserver} from '@angular/cdk/layout';

const statCards = [
  {'label': 'Pending Review', 'status': 'pending', 'color': '#f69e23'},
  {'label': 'Approved',  'status': 'approved','color': '#2cab6f'},
  {'label': 'Rejected', 'status': 'rejected', 'color': '#dc2928'},
  {'label': 'Suspended', 'status': 'suspended', 'color': '#66758a'}
]
const customInput = [
  {'label': 'All', 'value': 'all'},
  {'label': 'Pending', 'value': 'pending'},
  {'label': 'Approved', 'value': 'approved'},
  {'label': 'Rejected', 'value': 'rejected'},
  {'label': 'Suspended', 'value': 'suspended'},
]


@Component({
  selector: 'app-doctor-verification',
  standalone: false,
  
  templateUrl: './doctor-verification.component.html',
  styleUrl: './doctor-verification.component.css'
})
export class DoctorVerificationComponent implements OnInit, OnDestroy{
  statCards = statCards;
  customInput = customInput;
  doctorsList!: any[];
  verificationStatus! : FormControl;
  isClicked = false;
  selectedDoctor! : string
  doctorId!: string;
  doctorList$!: Observable<any[]>;
  totalCount$!: Observable<number>;
  approvedCount$!: Observable<number>;
  pendingCount$!: Observable<number>;
  rejectedCount$!:Observable<number>;
  suspendedCount$!:Observable<number>;
  isLoadingSkeleton!: boolean;
  private sub!: Subscription;
  isResponsive = false;

  constructor(public utilFunctions: UtilFunctions, 
    private fireStoreService: FirestoreService,
    private breakPoint: BreakpointObserver
  ) {}
  
  async ngOnInit() {
    this.isLoadingSkeleton = true;
    this.verificationStatus = new FormControl('all'); 
    this.doctorList$ = this.fireStoreService.getDoctors().pipe(
      tap({
        next: () => this.isLoadingSkeleton = false,
      error: () => this.isLoadingSkeleton = false
    }),
      shareReplay(1)
    );
    this.totalCount$ = this.doctorList$.pipe(
      map(doctors => doctors.length)
    );
    this.approvedCount$ = this.doctorList$.pipe(
      map(doctors => 
        doctors.filter(d => d.verificationStatus === 'approved').length
      )
    );
    this.pendingCount$ = this.doctorList$.pipe(
      map(doctors => 
        doctors.filter(d => d.verificationStatus === 'pending').length
      )
    );
    this.rejectedCount$ = this.doctorList$.pipe(
      map(doctors => 
        doctors.filter(d => d.verificationStatus === 'rejected').length
      )
    );
    this.suspendedCount$ = this.doctorList$.pipe(
      map(doctors => 
        doctors.filter(d => d.verificationStatus === 'suspended').length
      )
    );
    this.sub = this.breakPoint.observe('(max-width:980px)')
    .subscribe(result => {
      this.isResponsive = result.matches;
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  getStatusValue() {
    return this.verificationStatus.value;
  }

  setSelectedDoctor(doctor:any) {
    this.selectedDoctor = doctor.fullName;
    this.doctorId = doctor.id;
    this.isClicked = true;
    if (!this.isResponsive) {
      window.scroll({
        behavior: 'smooth',
        top: 0,
        left: 0
      });
    }
    else {
      window.scroll({
        behavior: 'smooth',
        top: document.body.scrollHeight,
        left: 0
      })
    }
  }

  getCount(status:string): Observable<number> {
    let count$: Observable<number>;
    switch(status) {
      case 'approved':
        count$ = this.approvedCount$;
        break;
      case 'rejected':
        count$ =  this.rejectedCount$;
        break;
      case 'suspended':
        count$ = this.suspendedCount$;
        break;
      default: 
        count$ = this.pendingCount$;
    }
    return count$;
  }

}
