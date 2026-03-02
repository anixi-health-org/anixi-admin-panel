import { Component, Input, OnInit} from '@angular/core';
import { displayNotificationMessage, ERROR_NOTIFICATION_BOX_POSITION, SUCCESS_NOTIFICATION_BOX_POSITION, UtilFunctions } from '../../../../const';
import { FirestoreService } from '../../services/firestore.service';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { BehaviorSubject, filter, Observable, switchMap } from 'rxjs';

@Component({
  selector: 'app-application-details',
  standalone: false,
  
  templateUrl: './application-details.component.html',
  styleUrl: './application-details.component.css'
})
export class ApplicationDetailsComponent {

  private doctorId$ = new BehaviorSubject<string | null>(null);
  detailList!: any;
  private _id!: string;

  @Input()
  set id(value: string | null) {
    if(value !== null) {
      this._id = value
    }
    this.doctorId$.next(value);
  }

  details$ = this.doctorId$.pipe(
    filter((id): id is string => !!id),
    switchMap(id =>this.fireStoreService.getDoctorsById(id))
  );
  
  constructor(public utilFunctions: UtilFunctions,
    private fireStoreService: FirestoreService,
    private notification: NzNotificationService
  ) {}

  get id(): string {
    return this._id;
  }

   updateDoctorStatus(id:string, status:string, errorMessage:string) {
    this.fireStoreService.updateDoctorStatus(id, status).
    then(() => this.notification.create(
      'success',
      'Success',
      displayNotificationMessage('success', `Doctor ${status}`),
      SUCCESS_NOTIFICATION_BOX_POSITION,
    ))
    .catch(() => this.notification.create(
      'error',
      'Error',
      displayNotificationMessage('error', `you try ${errorMessage} to  a doctor`),
      ERROR_NOTIFICATION_BOX_POSITION
    ))
  }

}
