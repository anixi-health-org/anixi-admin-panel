import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { map, Observable, shareReplay, tap } from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';

const usersCard = [
  {'label': 'Total Users', 'value': 'all'},
  {'label': 'Patients', 'value': 'patient' },
  {'label': 'Doctors', 'value': 'doctor'},
  {'label': 'Caregiver', 'value': 'caregiver'},
]
const customInput = [
  {'label': 'All', 'value': 'all'},
  {'label': 'Doctors', 'value': 'doctor'},
  {'label': 'Patients', 'value': 'patient'},
  {'label': 'Caregivers', 'value': 'caregiver'}
]

@Component({
  selector: 'app-users',
  standalone: false,
  
  templateUrl: './users.component.html',
  styleUrl: './users.component.css'
})
export class UsersComponent implements OnInit {
  cards = usersCard;
  input = customInput;
  isLoadingSkeleton = false;
  selectedUser!: string;
  userType! : FormControl;
  userList$!: Observable<any[]>;
  totalUser$!: Observable<number>;
  doctorCount$!: Observable<number>;
  patientCount$!: Observable<number>;
  caregiverCount$!: Observable<number>
  constructor(private fireStoreService: FirestoreService) {}

  ngOnInit(): void {
    this.isLoadingSkeleton = true;
    this.userType = new FormControl('all');
    this.userList$ = this.fireStoreService.getUsers().pipe(
      tap({
        next: () => this.isLoadingSkeleton = false,
        error: () => this.isLoadingSkeleton = false,
      }),
      shareReplay(1)
    );
    this.totalUser$ = this.userList$.pipe(
      map(users => users.length)
    );
    this.doctorCount$ = this.userList$.pipe(
      map(users => users.filter(user => user.accountType === 'doctor').length)
    );
    this.patientCount$ = this.userList$.pipe(
      map(users => users.filter(user => user.accountType === 'patient').length)
    );
    this.caregiverCount$ = this.userList$.pipe(
      map(users => users.filter(user => user.accountType === 'caregiver').length)
    );
  }

  getUserTypeValue() {
    return this.userType.value;
  }

  setSelectedUser(user: any) {
    this.selectedUser = user.id;
  }

  getCount(user:string): Observable<number> {
    let count$: Observable<number>;
    switch(user) {
      case 'doctor':
        count$ = this.doctorCount$;
        break;
      case 'patient':
        count$ = this.patientCount$;
        break;
      case 'caregiver':
        count$ = this.caregiverCount$;
        break;
      default:
        count$ = this.totalUser$;
    }
    return count$;
  }
  
}
