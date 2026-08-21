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

export type DecisionModalKind =
  | 'approve'
  | 'reject'
  | 'hold'
  | 'suspend'
  | 'request_info';

type DecisionModalState = {
  kind: DecisionModalKind;
  reason: string;
  error: string | null;
};

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
  decisionModal: DecisionModalState | null = null;

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
      this.closeDecisionModal();
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

  /** Preserve emails, IDs, and URLs without title-casing. */
  plain(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return String(value);
    return String(value).trim() || '-';
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
    const value =
      doctor.hpcsaRegistrationNumber || doctor.licenseNumber || '';
    return String(value).trim() || '-';
  }

  practiceAddress(doctor: DoctorRecord): string {
    return formatDoctorField(doctor.practiceAddress || doctor.officeAddress);
  }

  yearsInPractice(doctor: DoctorRecord): string {
    const value = doctor.yearsInPractice;
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '-';
    }
    return String(value);
  }

  medicalAidAffiliation(doctor: DoctorRecord): string {
    if (doctor.hasMedicalAidAffiliation === true) {
      const type = doctor.medicalAidAffiliationType
        ? ` · ${formatDoctorField(doctor.medicalAidAffiliationType)}`
        : '';
      return `Yes${type}`;
    }
    if (doctor.hasMedicalAidAffiliation === false) return 'No';
    return '-';
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
        reason: String(
          doctor.hpcsaVerificationReference || doctor.hpcsaReviewerNotes || ''
        ),
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
    const safeExtension = /^[a-z0-9]{1,5}$/.test(extension)
      ? `.${extension}`
      : '';
    return `${fallbackName}${safeExtension}`;
  }

  private triggerDownload(
    href: string,
    fileName: string,
    external = false
  ): void {
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

  openDecisionModal(kind: DecisionModalKind): void {
    if (!this.doctor || this.isUpdating) return;
    if (kind === 'approve' && !this.approvalReady(this.doctor)) return;
    this.decisionModal = { kind, reason: '', error: null };
  }

  closeDecisionModal(): void {
    if (this.isUpdating) return;
    this.decisionModal = null;
  }

  onDecisionReasonChange(value: string): void {
    if (!this.decisionModal) return;
    this.decisionModal = {
      ...this.decisionModal,
      reason: value,
      error: null,
    };
  }

  decisionModalTitle(kind: DecisionModalKind): string {
    switch (kind) {
      case 'approve':
        return this.statusOf(this.doctor!) === 'suspended'
          ? 'Reinstate this doctor?'
          : 'Approve this doctor?';
      case 'reject':
        return 'Reject this application?';
      case 'hold':
        return 'Hold for further review?';
      case 'suspend':
        return 'Suspend this account?';
      case 'request_info':
        return 'Request more information?';
    }
  }

  decisionModalBody(kind: DecisionModalKind): string {
    switch (kind) {
      case 'approve':
        return 'Approving confirms you are satisfied with this application and activates their practice account so they can accept patients on Anixi immediately.';
      case 'reject':
        return 'The doctor will stay signed in but cannot access practice tools until a new decision is made.';
      case 'hold':
        return 'The application stays inactive while Anixi ops investigates. Share why you are holding it.';
      case 'suspend':
        return 'Suspension immediately blocks practice access. Provide a clear reason for the audit trail.';
      case 'request_info':
        return 'Tell the doctor exactly what is missing. They remain under review until you decide again.';
    }
  }

  decisionModalRequiresReason(kind: DecisionModalKind): boolean {
    return kind !== 'approve';
  }

  decisionModalReasonLabel(kind: DecisionModalKind): string {
    switch (kind) {
      case 'reject':
        return 'Reason for rejection';
      case 'hold':
        return 'Reason for holding';
      case 'suspend':
        return 'Reason for suspension';
      case 'request_info':
        return 'What information is required?';
      default:
        return 'Notes';
    }
  }

  decisionModalReasonPlaceholder(kind: DecisionModalKind): string {
    switch (kind) {
      case 'reject':
        return 'e.g. HPCSA registration could not be verified…';
      case 'hold':
        return 'e.g. Awaiting confirmation from professional board…';
      case 'suspend':
        return 'e.g. Reported credentials mismatch pending investigation…';
      case 'request_info':
        return 'e.g. Please upload a clear HPCSA certificate and practice licence…';
      default:
        return '';
    }
  }

  decisionModalConfirmLabel(kind: DecisionModalKind): string {
    switch (kind) {
      case 'approve':
        return this.statusOf(this.doctor!) === 'suspended'
          ? 'Reinstate doctor'
          : 'Approve doctor';
      case 'reject':
        return 'Reject application';
      case 'hold':
        return 'Hold for review';
      case 'suspend':
        return 'Suspend account';
      case 'request_info':
        return 'Send request';
    }
  }

  decisionModalTone(kind: DecisionModalKind): string {
    switch (kind) {
      case 'approve':
        return 'approve';
      case 'reject':
      case 'suspend':
        return 'danger';
      case 'hold':
        return 'hold';
      case 'request_info':
        return 'info';
    }
  }

  async confirmDecisionModal(): Promise<void> {
    const modal = this.decisionModal;
    if (!modal || !this.doctor || this.isUpdating) return;

    const reason = modal.reason.trim();
    if (this.decisionModalRequiresReason(modal.kind) && !reason) {
      this.decisionModal = {
        ...modal,
        error: 'Please enter a reason before continuing.',
      };
      return;
    }

    const kind = modal.kind;
    this.decisionModal = null;

    if (kind === 'request_info') {
      await this.submitMoreInformation(reason);
      return;
    }

    const statusMap: Record<
      Exclude<DecisionModalKind, 'request_info'>,
      VerificationStatus
    > = {
      approve: 'approved',
      reject: 'rejected',
      hold: 'on_hold',
      suspend: 'suspended',
    };

    await this.updateDoctorStatus(
      this.id,
      statusMap[kind],
      kind,
      this.decisionModalRequiresReason(kind) ? reason : undefined
    );
  }

  async updateDoctorStatus(
    doctorId: string,
    status: VerificationStatus,
    actionLabel: string,
    reason?: string
  ): Promise<void> {
    if (this.isUpdating || !this.doctor) return;

    if (status === 'approved' && !this.approvalReady(this.doctor)) {
      this.notification.create(
        'error',
        'Cannot approve yet',
        approvalBlockReasons(this.doctor).join(' · ') ||
          'Profile essentials are incomplete.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
      return;
    }

    this.isUpdating = true;
    try {
      const result = await this.fireStoreService.updateDoctorStatus(
        doctorId,
        status,
        { reason }
      );
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
          : displayNotificationMessage(
              'error',
              `you try ${actionLabel} to a doctor`
            );
      this.notification.create(
        'error',
        'Action failed',
        message,
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }

  async verifyIdentity(): Promise<void> {
    if (!this.doctor || this.isUpdating) return;
    if (
      !(this.doctor.fullName || this.doctor.displayName) ||
      !this.doctor.email
    ) {
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
      const result = await this.fireStoreService.recordIdentityVerification(
        this.id,
        notes
      );
      if (!result.verified)
        throw new Error('Identity verification was not persisted.');
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
      const result = await this.fireStoreService.recordManualHpcsaVerification(
        this.id,
        {
          verified: true,
          reference: referencePrompt,
          notes: notesPrompt,
        }
      );
      if (!result.verified)
        throw new Error('Manual HPCSA verification was not persisted.');
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
        error instanceof Error
          ? error.message
          : 'Could not save manual HPCSA verification.',
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
    if (this.isUpdating || !docRow.url) return;
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
        error instanceof Error
          ? error.message
          : 'Could not update document review.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }

  async requestMoreInformation(): Promise<void> {
    this.openDecisionModal('request_info');
  }

  private async submitMoreInformation(reason: string): Promise<void> {
    if (!this.doctor || this.isUpdating) return;
    this.isUpdating = true;
    try {
      const result = await this.fireStoreService.requestMoreInformation(
        this.id,
        reason
      );
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
        error instanceof Error
          ? error.message
          : 'Could not save information request.',
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isUpdating = false;
    }
  }
}
