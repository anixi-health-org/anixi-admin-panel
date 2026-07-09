import { Component, Input } from '@angular/core';
import {
  displayNotificationMessage,
  ERROR_NOTIFICATION_BOX_POSITION,
  SUCCESS_NOTIFICATION_BOX_POSITION,
  UtilFunctions,
} from '../../../../const';
import { FirestoreService } from '../../services/firestore.service';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { BehaviorSubject, filter, switchMap } from 'rxjs';
import {
  DoctorRecord,
  formatDoctorField,
  formatTimestamp,
  getCertificateUrl,
  getDoctorDisplayName,
  getPracticeLicenseUrl,
  normalizeVerificationStatus,
  VerificationStatus,
} from '../../utils/doctor-record.utils';

@Component({
  selector: 'app-application-details',
  standalone: false,
  templateUrl: './application-details.component.html',
  styleUrl: './application-details.component.css',
})
export class ApplicationDetailsComponent {
  private doctorId$ = new BehaviorSubject<string | null>(null);
  private _id = '';
  isUpdating = false;
  isLoadingDetail = false;
  downloadingUrl: string | null = null;
  doctor: DoctorRecord | null = null;

  details$ = this.doctorId$.pipe(
    filter((id): id is string => !!id),
    switchMap((id) => this.fireStoreService.getDoctorsById(id))
  );

  @Input()
  set id(value: string | null) {
    if (value) {
      this._id = value;
      this.isLoadingDetail = true;
      this.doctor = null;
    }
    this.doctorId$.next(value);
  }

  constructor(
    public utilFunctions: UtilFunctions,
    private fireStoreService: FirestoreService,
    private notification: NzNotificationService
  ) {
    this.details$.subscribe((doctor) => {
      this.doctor = doctor;
      this.isLoadingDetail = false;
    });
  }

  get id(): string {
    return this._id;
  }

  displayName(doctor: DoctorRecord): string {
    return getDoctorDisplayName(doctor);
  }

  statusOf(doctor: DoctorRecord): VerificationStatus {
    return normalizeVerificationStatus(doctor.verificationStatus as string);
  }

  field(value: unknown): string {
    return formatDoctorField(value);
  }

  timestamp(value: unknown): string {
    return formatTimestamp(value);
  }

  certificateUrl(doctor: DoctorRecord): string | null {
    return getCertificateUrl(doctor);
  }

  licenseUrl(doctor: DoctorRecord): string | null {
    return getPracticeLicenseUrl(doctor);
  }

  profileImage(doctor: DoctorRecord): string | null {
    const url =
      (doctor.profileImageUrl as string) || (doctor.logoUrl as string) || null;
    return url && url.trim() ? url : null;
  }

  specialty(doctor: DoctorRecord): string {
    return formatDoctorField(doctor.medicalSpecialty || doctor.specialty);
  }

  registrationNumber(doctor: DoctorRecord): string {
    return formatDoctorField(
      doctor.hpcsaRegistrationNumber || doctor.licenseNumber
    );
  }

  practiceAddress(doctor: DoctorRecord): string {
    return formatDoctorField(doctor.practiceAddress || doctor.officeAddress);
  }

  contactMethods(doctor: DoctorRecord): string {
    const methods = doctor.preferredContactMethods;
    if (!Array.isArray(methods) || !methods.length) return '—';
    return methods.map((m) => formatDoctorField(m)).join(', ');
  }

  async downloadDocument(url: string, fileName: string): Promise<void> {
    if (!url || this.downloadingUrl) return;
    this.downloadingUrl = url;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.triggerDownload(objectUrl, this.buildFileName(url, fileName));
      URL.revokeObjectURL(objectUrl);
    } catch {
      this.triggerDownload(url, this.buildFileName(url, fileName), true);
    } finally {
      this.downloadingUrl = null;
    }
  }

  private buildFileName(url: string, fallbackName: string): string {
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('.');
    const extension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
    const safeExtension = /^[a-z0-9]{1,5}$/.test(extension) ? `.${extension}` : '';
    return `${fallbackName}${safeExtension}`;
  }

  private triggerDownload(href: string, fileName: string, external = false): void {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    if (external) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async updateDoctorStatus(
    doctorId: string,
    status: VerificationStatus,
    actionLabel: string
  ): Promise<void> {
    if (this.isUpdating) return;
    this.isUpdating = true;
    try {
      await this.fireStoreService.updateDoctorStatus(doctorId, status);
      this.notification.create(
        'success',
        'Success',
        displayNotificationMessage('success', `Doctor ${status}`),
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch {
      this.notification.create(
        'error',
        'Error',
        displayNotificationMessage('error', `you try ${actionLabel} to a doctor`),
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }
}
