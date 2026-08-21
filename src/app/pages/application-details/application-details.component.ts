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
  getDoctorProfilePhotoUrl,
  getPracticeLicenseUrl,
  normalizeVerificationStatus,
  VerificationStatus,
} from '../../utils/doctor-record.utils';
import {
  approvalBlockReasons,
  buildVerificationChecklist,
  canApproveDoctor,
  ChecklistItem,
  DoctorDocumentReview,
  DocumentReviewStatus,
  documentStatusLabel,
  formatHistoryWhen,
  listDoctorDocuments,
  sortVerificationHistory,
  VerificationHistoryEvent,
} from '../../utils/doctor-verification.utils';

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
  showApproveConfirm = false;

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
    return getDoctorProfilePhotoUrl(doctor);
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
    if (!Array.isArray(methods) || !methods.length) return '-';
    return methods.map((m) => formatDoctorField(m)).join(', ');
  }

  checklist(doctor: DoctorRecord): ChecklistItem[] {
    return buildVerificationChecklist(doctor);
  }

  approvalReady(doctor: DoctorRecord): boolean {
    return canApproveDoctor(doctor);
  }

  approvalBlockReasonsList(doctor: DoctorRecord): string[] {
    return approvalBlockReasons(doctor);
  }

  documents(doctor: DoctorRecord): DoctorDocumentReview[] {
    return listDoctorDocuments(doctor);
  }

  docStatusLabel(status: DocumentReviewStatus): string {
    return documentStatusLabel(status);
  }

  history(doctor: DoctorRecord): VerificationHistoryEvent[] {
    const events = sortVerificationHistory(doctor.verificationHistory);
    if (events.length) return events;
    // Fallback seed from known scalars when history array is empty.
    const seeded: VerificationHistoryEvent[] = [];
    if (doctor.createdAt) {
      seeded.push({
        id: 'submitted',
        action: 'Application submitted',
        adminId: 'system',
        at: doctor.createdAt,
      });
    }
    if (doctor.identityVerified) {
      seeded.push({
        id: 'identity',
        action: 'Identity verified',
        adminId: String(doctor.identityVerifiedBy || '-'),
        at: doctor.identityVerifiedAt || doctor.createdAt || new Date(),
      });
    }
    if (doctor.hpcsaManuallyVerified) {
      seeded.push({
        id: 'hpcsa',
        action: 'HPCSA manually verified',
        adminId: String(doctor.hpcsaVerifiedBy || '-'),
        at: doctor.hpcsaVerifiedAt || new Date(),
        reason: String(doctor.hpcsaVerificationReference || doctor.hpcsaReviewerNotes || ''),
      });
    }
    if (doctor.verifiedAt && doctor.verificationStatus) {
      seeded.push({
        id: 'decision',
        action: `Application ${doctor.verificationStatus}`,
        adminId: String(doctor.verifiedBy || '-'),
        at: doctor.verifiedAt,
        reason: String(doctor.statusReason || doctor.rejectionReason || ''),
      });
    }
    return sortVerificationHistory(seeded);
  }

  historyWhen(value: unknown): string {
    return formatHistoryWhen(value);
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

  requestApprove(): void {
    if (!this.doctor || !this.approvalReady(this.doctor)) return;
    this.showApproveConfirm = true;
  }

  cancelApproveConfirm(): void {
    this.showApproveConfirm = false;
  }

  async confirmApprove(): Promise<void> {
    this.showApproveConfirm = false;
    await this.updateDoctorStatus(this.id, 'approved', 'approve');
  }

  async updateDoctorStatus(
    doctorId: string,
    status: VerificationStatus,
    actionLabel: string
  ): Promise<void> {
    if (this.isUpdating || !this.doctor) return;

    let reason: string | undefined;
    if (status === 'rejected' || status === 'suspended' || status === 'on_hold') {
      const prompted = window.prompt(
        status === 'rejected'
          ? 'Reason for rejection (required):'
          : status === 'on_hold'
            ? 'Reason for holding this account for further review (required):'
            : 'Reason for suspension (required):'
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

    if (status === 'approved' && !this.approvalReady(this.doctor)) {
      this.notification.create(
        'error',
        'Cannot approve yet',
        'Complete all required verification steps before approving this doctor.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
      return;
    }

    this.isUpdating = true;
    try {
      const result = await this.fireStoreService.updateDoctorStatus(doctorId, status, {
        reason,
      });
      if (!result.verified) {
        throw new Error(
          `Backend verification failed. Expected "${status}", found "${result.status}".`
        );
      }
      this.notification.create(
        'success',
        'Confirmed',
        displayNotificationMessage('success', `Doctor ${status}`),
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : displayNotificationMessage('error', `you try ${actionLabel} to a doctor`);
      this.notification.create('error', 'Action failed', message, ERROR_NOTIFICATION_BOX_POSITION);
    } finally {
      this.isUpdating = false;
    }
  }

  async verifyIdentity(): Promise<void> {
    if (!this.doctor || this.isUpdating) return;
    if (!(this.doctor.fullName || this.doctor.displayName) || !this.doctor.email) {
      this.notification.create(
        'error',
        'Identity incomplete',
        'Name and email must be present before identity can be verified.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
      return;
    }
    const notes = window.prompt('Identity reviewer notes (optional):');
    if (notes === null) return;
    this.isUpdating = true;
    try {
      const result = await this.fireStoreService.recordIdentityVerification(this.id, notes);
      if (!result.verified) throw new Error('Identity verification was not persisted.');
      this.notification.create(
        'success',
        'Identity verified',
        'Identity verification saved to the doctor record.',
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch (error) {
      this.notification.create(
        'error',
        'Error',
        error instanceof Error ? error.message : 'Could not verify identity.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }

  async recordManualHpcsa(): Promise<void> {
    if (!this.doctor || this.isUpdating) return;
    if (this.registrationNumber(this.doctor) === '-') {
      this.notification.create(
        'error',
        'Registration required',
        'This application has no HPCSA / registration number to verify.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
      return;
    }
    const referencePrompt = window.prompt(
      'Verification reference (optional — e.g. register lookup ID):'
    );
    if (referencePrompt === null) return;
    const notesPrompt = window.prompt('Reviewer notes (optional):');
    if (notesPrompt === null) return;
    this.isUpdating = true;
    try {
      const result = await this.fireStoreService.recordManualHpcsaVerification(this.id, {
        verified: true,
        reference: referencePrompt,
        notes: notesPrompt,
      });
      if (!result.verified) throw new Error('Manual HPCSA verification was not persisted.');
      this.notification.create(
        'success',
        'HPCSA recorded',
        'Manual HPCSA verification saved.',
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch (error) {
      this.notification.create(
        'error',
        'Error',
        error instanceof Error ? error.message : 'Could not save manual HPCSA verification.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }

  async reviewDocument(
    docRow: DoctorDocumentReview,
    status: DocumentReviewStatus
  ): Promise<void> {
    if (this.isUpdating) return;
    let notes = '';
    if (status === 'rejected' || status === 'requires_replacement') {
      const prompted = window.prompt(
        status === 'rejected'
          ? 'Reason for rejecting this document (required):'
          : 'What replacement is required? (required):'
      );
      if (prompted === null) return;
      notes = prompted.trim();
      if (!notes) {
        this.notification.create(
          'error',
          'Reason required',
          'A reason is required for this document decision.',
          ERROR_NOTIFICATION_BOX_POSITION
        );
        return;
      }
    } else if (status === 'verified') {
      const prompted = window.prompt('Reviewer notes (optional):');
      if (prompted === null) return;
      notes = prompted.trim();
    }

    this.isUpdating = true;
    try {
      const result = await this.fireStoreService.updateDocumentReview(this.id, {
        documentKey: docRow.documentKey,
        documentName: docRow.documentName,
        documentType: docRow.documentType,
        url: docRow.url,
        status,
        notes,
      });
      if (!result.verified) {
        throw new Error('Document review was not persisted correctly.');
      }
      this.notification.create(
        'success',
        'Document updated',
        `${docRow.documentName} marked ${documentStatusLabel(status)}.`,
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch (error) {
      this.notification.create(
        'error',
        'Error',
        error instanceof Error ? error.message : 'Could not update document review.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }

  async requestMoreInformation(): Promise<void> {
    if (!this.doctor || this.isUpdating) return;
    const prompted = window.prompt('What additional information is required? (required):');
    if (prompted === null) return;
    const reason = prompted.trim();
    if (!reason) {
      this.notification.create(
        'error',
        'Reason required',
        'Please describe what information is needed.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
      return;
    }
    this.isUpdating = true;
    try {
      const result = await this.fireStoreService.requestMoreInformation(this.id, reason);
      if (!result.verified) throw new Error('Request was not persisted.');
      this.notification.create(
        'success',
        'Request saved',
        'More information requested. Doctor remains inactive.',
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
    } catch (error) {
      this.notification.create(
        'error',
        'Error',
        error instanceof Error ? error.message : 'Could not save information request.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }
}
