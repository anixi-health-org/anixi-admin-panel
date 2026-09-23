import { Injectable } from '@angular/core';
import {
  catchError,
  from,
  interval,
  map,
  Observable,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { AuthService } from './auth.service';
import { DjangoApiService } from './django-api.service';
import {
  approvalBlockReasons,
  canApproveDoctor,
  DocumentReviewStatus,
  DoctorDocumentKey,
} from '../utils/doctor-verification.utils';
import {
  DoctorRecord,
  getCertificateUrl,
  getPracticeLicenseUrl,
  isDoctorVerificationCandidate,
} from '../utils/doctor-record.utils';
import {
  getPracticeName,
  getPracticeOrgType,
  PracticeMemberRecord,
  PracticeRecord,
} from '../utils/practice-record.utils';
import {
  enrichUserWithPracticeContext,
  isClinicAdminUser,
  PlatformUser,
} from '../utils/user-record.utils';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  constructor(
    private authService: AuthService,
    private djangoApi: DjangoApiService,
  ) {}

  getAllDoctors(): Observable<any[]> {
    return from(this.djangoApi.listDoctors(undefined, { limit: 100 })).pipe(
      map((doctors) =>
        doctors.map((d) =>
          this.djangoApi.enrichDoctorMedia({
            ...d,
            id: String(d['id'] ?? ''),
          }),
        ),
      ),
    );
  }

  /** Lightweight user directory page (server-paginated). */
  getUsersPage(options?: {
    role?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Observable<{ users: any[]; total: number }> {
    return from(
      this.djangoApi.listUsersPage({
        role: options?.role,
        q: options?.q,
        limit: options?.limit ?? 25,
        offset: options?.offset ?? 0,
      }),
    ).pipe(
      map(({ data, metadata }) => ({
        users: data.map((u) => ({ ...u, id: String(u['id'] ?? '') })),
        total: Number(metadata?.['total'] ?? data.length),
      })),
    );
  }

  /** @deprecated Prefer getUsersPage — kept for dashboard/analytics light loads. */
  getUsers(options?: { role?: string; limit?: number }): Observable<any[]> {
    return from(
      this.djangoApi.listUsers({
        role: options?.role,
        limit: options?.limit ?? 25,
        offset: 0,
      }),
    ).pipe(map((users) => users.map((u) => ({ ...u, id: String(u['id'] ?? '') }))));
  }

  getAdminStats() {
    return from(this.djangoApi.getAdminStats());
  }

  private historyEvent(
    action: string,
    reason?: string,
    entity?: { type: string; id: string },
  ) {
    const adminId = this.authService.getAdminUserId() || 'unknown';
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      adminId,
      at: new Date().toISOString(),
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      ...(entity ? { entityType: entity.type, entityId: entity.id } : {}),
    };
  }

  private async appendDoctorHistory(
    doctorId: string,
    action: string,
    reason?: string,
    entity?: { type: string; id: string },
  ): Promise<void> {
    const current = await this.djangoApi.getDoctor(doctorId);
    const history = Array.isArray(current['verificationHistory'])
      ? [...(current['verificationHistory'] as unknown[])]
      : [];
    history.push(this.historyEvent(action, reason, entity));
    await this.djangoApi.patchDoctor(doctorId, { verificationHistory: history });
  }

  async updateDoctorStatus(
    doctorId: string,
    status: string,
    options?: { reason?: string },
  ): Promise<{ verified: boolean; status: string | null }> {
    if (status === 'approved') {
      const current = await this.djangoApi.getDoctor(doctorId);
      const doctor = { ...(current as DoctorRecord), id: doctorId };
      if (!canApproveDoctor(doctor)) {
        throw new Error(
          `Cannot approve: ${approvalBlockReasons(doctor).join(' | ')}`,
        );
      }
    }

    const actionLabel =
      status === 'approved'
        ? 'Application approved'
        : status === 'rejected'
          ? 'Application rejected'
          : status === 'suspended'
            ? 'Doctor suspended'
            : status === 'on_hold'
              ? 'Held for further review'
              : `Status set to ${status}`;

    await this.djangoApi.updateDoctorStatus(
      doctorId,
      status,
      options?.reason,
    );
    await this.appendDoctorHistory(
      doctorId,
      actionLabel,
      options?.reason,
      { type: 'doctor', id: doctorId },
    );

    if (status === 'approved') {
      const current = await this.djangoApi.getDoctor(doctorId);
      const reviews = {
        ...((current['documentReviews'] as Record<string, unknown>) || {}),
      };
      const doctor = { ...(current as DoctorRecord), id: doctorId };
      for (const key of [
        'hpcsa_certificate',
        'practice_license',
        'medical_aid_contract',
      ] as const) {
        const url =
          key === 'hpcsa_certificate'
            ? getCertificateUrl(doctor)
            : key === 'practice_license'
              ? getPracticeLicenseUrl(doctor)
              : String(doctor.medicalAidContractUrl ?? '').trim() || null;
        if (!url) continue;
        const existing = (reviews[key] as Record<string, unknown>) || {};
        if (
          existing['status'] === 'rejected' ||
          existing['status'] === 'requires_replacement'
        ) {
          continue;
        }
        reviews[key] = {
          ...existing,
          status: 'verified',
          reviewedAt: new Date().toISOString(),
        };
      }
      await this.djangoApi.patchDoctor(doctorId, {
        identityVerified: true,
        hpcsaManuallyVerified: true,
        informationRequested: false,
        documentReviews: reviews,
      });
    }

    return { verified: true, status };
  }

  async recordManualHpcsaVerification(
    doctorId: string,
    input: {
      verified: boolean;
      reference?: string;
      notes?: string;
    },
  ): Promise<{ verified: boolean }> {
    const adminId = this.authService.getAdminUserId();
    await this.djangoApi.patchDoctor(doctorId, {
      hpcsaManuallyVerified: input.verified,
      hpcsaVerificationMethod: 'manual',
      hpcsaVerificationReference: (input.reference || '').trim(),
      hpcsaReviewerNotes: (input.notes || '').trim(),
      hpcsaVerifiedAt: new Date().toISOString(),
      hpcsaVerifiedBy: adminId,
    });
    await this.appendDoctorHistory(
      doctorId,
      input.verified ? 'HPCSA manually verified' : 'HPCSA verification cleared',
      input.notes || input.reference,
      { type: 'hpcsa', id: doctorId },
    );
    return { verified: input.verified };
  }

  async recordIdentityVerification(
    doctorId: string,
    notes?: string,
  ): Promise<{ verified: boolean }> {
    const adminId = this.authService.getAdminUserId();
    await this.djangoApi.patchDoctor(doctorId, {
      identityVerified: true,
      identityVerifiedAt: new Date().toISOString(),
      identityVerifiedBy: adminId,
      identityReviewerNotes: (notes || '').trim(),
    });
    await this.appendDoctorHistory(doctorId, 'Identity verified', notes, {
      type: 'identity',
      id: doctorId,
    });
    return { verified: true };
  }

  async updateDocumentReview(
    doctorId: string,
    input: {
      documentKey: DoctorDocumentKey;
      documentName: string;
      documentType: string;
      url: string;
      status: DocumentReviewStatus;
      notes?: string;
    },
  ): Promise<{ verified: boolean; status: DocumentReviewStatus | null }> {
    const adminId = this.authService.getAdminUserId();
    const current = await this.djangoApi.getDoctor(doctorId);
    const reviews = {
      ...((current['documentReviews'] as Record<string, unknown>) || {}),
    };
    reviews[input.documentKey] = {
      documentKey: input.documentKey,
      documentName: input.documentName,
      documentType: input.documentType,
      url: input.url,
      status: input.status,
      reviewerId: adminId,
      reviewedAt: new Date().toISOString(),
      notes: (input.notes || '').trim(),
    };
    const action =
      input.status === 'verified'
        ? `Document verified: ${input.documentName}`
        : input.status === 'rejected'
          ? `Document rejected: ${input.documentName}`
          : input.status === 'requires_replacement'
            ? `Replacement requested: ${input.documentName}`
            : `Document marked ${input.status}: ${input.documentName}`;
    await this.djangoApi.patchDoctor(doctorId, { documentReviews: reviews });
    await this.appendDoctorHistory(doctorId, action, input.notes, {
      type: 'document',
      id: input.documentKey,
    });
    return { verified: true, status: input.status };
  }

  async requestMoreInformation(
    doctorId: string,
    reason: string,
  ): Promise<{ verified: boolean }> {
    const adminId = this.authService.getAdminUserId();
    const trimmed = reason.trim();
    await this.djangoApi.patchDoctor(doctorId, {
      informationRequested: true,
      informationRequestReason: trimmed,
      informationRequestedAt: new Date().toISOString(),
      informationRequestedBy: adminId,
      verificationStatus: 'pending',
    });
    await this.appendDoctorHistory(
      doctorId,
      'More information requested',
      trimmed,
      { type: 'doctor', id: doctorId },
    );
    return { verified: true };
  }

  getDoctors(status?: string, options?: { limit?: number }): Observable<any[]> {
    return from(
      this.djangoApi.listDoctors(status, { limit: options?.limit ?? 50, offset: 0 }),
    ).pipe(
      map((doctors) =>
        doctors.map((d) =>
          this.djangoApi.enrichDoctorMedia({
            ...d,
            id: String(d['id'] ?? ''),
            verificationStatus: d['verificationStatus'] ?? d['verification_status'],
          }),
        ),
      ),
    );
  }

  getDoctorsPage(
    status?: string,
    options?: { limit?: number; offset?: number },
  ): Observable<{ doctors: any[]; total: number }> {
    return from(
      this.djangoApi.listDoctorsPage(status, {
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
      }),
    ).pipe(
      map(({ data, metadata }) => ({
        doctors: data.map((d) =>
          this.djangoApi.enrichDoctorMedia({
            ...d,
            id: String(d['id'] ?? ''),
            verificationStatus: d['verificationStatus'] ?? d['verification_status'],
          }),
        ),
        total: Number(metadata?.['total'] ?? data.length),
      })),
    );
  }

  getDashboardStats(): Observable<{
    totalDoctors: number;
    pendingDoctors: number;
    approvedDoctors: number;
    rejectedDoctors: number;
    suspendedDoctors: number;
  }> {
    return this.getDoctors().pipe(
      map((doctors) => {
        const clinical = doctors.filter((d) => isDoctorVerificationCandidate(d));
        return {
          totalDoctors: clinical.length,
          pendingDoctors: clinical.filter(
            (d) => !d.verificationStatus || d.verificationStatus === 'pending',
          ).length,
          approvedDoctors: clinical.filter((d) => d.verificationStatus === 'approved')
            .length,
          rejectedDoctors: clinical.filter((d) => d.verificationStatus === 'rejected')
            .length,
          suspendedDoctors: clinical.filter((d) => d.verificationStatus === 'suspended')
            .length,
        };
      }),
    );
  }

  getPractices(): Observable<PracticeRecord[]> {
    return from(this.djangoApi.listPractices()).pipe(
      map((rows) =>
        rows.map((row) => ({
          ...(row as Omit<PracticeRecord, 'id'>),
          id: String(row['id']),
        })),
      ),
    );
  }

  getPracticeById(practiceId: string): Observable<PracticeRecord | null> {
    return from(this.djangoApi.listPractices()).pipe(
      map((rows) => {
        const match = rows.find((row) => String(row['id']) === practiceId);
        return match
          ? ({ ...(match as Omit<PracticeRecord, 'id'>), id: practiceId } as PracticeRecord)
          : null;
      }),
    );
  }

  getPracticesForAdmin(
    users: PlatformUser[],
    doctors: Array<Record<string, unknown> & { id: string }>,
  ): Observable<PracticeRecord[]> {
    return this.getPractices().pipe(
      catchError(() => of([] as PracticeRecord[])),
      switchMap((practices) => {
        if (practices.length > 0) {
          return of(this.uniquePractices(practices));
        }
        return from(this.loadPracticesFallback(users, doctors));
      }),
    );
  }

  private uniquePractices(practices: PracticeRecord[]): PracticeRecord[] {
    const byId = new Map<string, PracticeRecord>();
    for (const practice of practices) {
      byId.set(practice.id, practice);
    }
    return [...byId.values()];
  }

  private async loadPracticesFallback(
    users: PlatformUser[],
    doctors: Array<Record<string, unknown> & { id: string }>,
  ): Promise<PracticeRecord[]> {
    const byId = new Map<string, PracticeRecord>();
    const linkedIds = new Set<string>();
    for (const user of users) {
      const practiceId = String(user.primaryPracticeId ?? '').trim();
      if (practiceId) linkedIds.add(practiceId);
    }
    for (const doctor of doctors) {
      const practiceId = String(doctor['primaryPracticeId'] ?? '').trim();
      if (practiceId) linkedIds.add(practiceId);
    }

    await Promise.all(
      [...linkedIds].map(async (id) => {
        const practice = await this.getPracticeById(id).toPromise();
        if (practice) byId.set(practice.id, practice);
      }),
    );

    return [...byId.values()];
  }

  buildUsersWithPracticeContext(
    users: PlatformUser[],
    doctors: Array<Record<string, unknown> & { id: string }>,
    practices: PracticeRecord[],
  ): PlatformUser[] {
    const doctorById = new Map(doctors.map((d) => [d.id, d]));
    const clinicByOwner = new Map<string, PracticeRecord>();
    for (const practice of practices) {
      if (getPracticeOrgType(practice) !== 'clinic') continue;
      const ownerId = String(practice.ownerId ?? '').trim();
      if (ownerId) clinicByOwner.set(ownerId, practice);
    }

    return users.map((user) => {
      const doctor = doctorById.get(user.id);
      const ownedClinic = clinicByOwner.get(user.id);
      let enriched =
        ownedClinic != null
          ? enrichUserWithPracticeContext(user, {
              doctor,
              ownedClinic: { id: ownedClinic.id, name: getPracticeName(ownedClinic) },
            })
          : enrichUserWithPracticeContext(user, { doctor });

      if (doctor && !isClinicAdminUser(enriched)) {
        const raw = String(enriched.accountType ?? enriched.role ?? '')
          .trim()
          .toLowerCase();
        if (!raw) {
          enriched = { ...enriched, accountType: 'doctor', role: enriched.role || 'doctor' };
        }
      }

      return enriched;
    });
  }

  async syncClinicAdminAccounts(
    _users: PlatformUser[],
    doctors: Array<Record<string, unknown> & { id: string }>,
    practices: PracticeRecord[],
  ): Promise<void> {
    const clinicOwners = practices.filter((p) => getPracticeOrgType(p) === 'clinic');
    for (const practice of clinicOwners) {
      const ownerId = String(practice.ownerId ?? '').trim();
      if (!ownerId) continue;
      const doctor = doctors.find((d) => d.id === ownerId);
      if (doctor?.['accountKind'] === 'clinic_admin') continue;
      await this.markAsClinicAdmin(ownerId);
    }
  }

  getPracticeMembers(practiceId: string): Observable<PracticeMemberRecord[]> {
    return from(this.djangoApi.listPracticeMembers(practiceId)).pipe(
      map((members) =>
        members.map((member) => ({
          ...(member as Omit<PracticeMemberRecord, 'id'>),
          id: String(member['uid'] ?? member['id'] ?? ''),
          uid: String(member['uid'] ?? member['id'] ?? ''),
        })),
      ),
    );
  }

  async markAsClinicAdmin(userId: string): Promise<void> {
    await this.djangoApi.patchDoctor(userId, {
      accountKind: 'clinic_admin',
      requiresClinicalVerification: false,
      verificationStatus: 'not_required',
    });
    await this.djangoApi.patchUser(userId, {
      accountStatus: 'active',
    });
    await this.appendDoctorHistory(
      userId,
      'Reclassified as clinic admin',
      undefined,
      { type: 'user', id: userId },
    );
  }

  async updateUserAccountStatus(
    userId: string,
    status: 'active' | 'on_hold' | 'suspended',
    reason?: string,
  ): Promise<void> {
    await this.djangoApi.patchUser(userId, {
      accountStatus: status,
      ...(reason?.trim() ? { accountStatusReason: reason.trim() } : {}),
    });
  }

  async updateUserContact(
    userId: string,
    patch: { displayName?: string; email?: string; phoneNumber?: string },
  ): Promise<void> {
    await this.djangoApi.patchUser(userId, patch);
  }

  listAdminTeam() {
    return from(this.djangoApi.listAdminTeam());
  }

  inviteAdminTeamMember(payload: {
    email: string;
    displayName?: string;
    opsRole: string;
  }) {
    return from(this.djangoApi.inviteAdminTeamMember(payload));
  }

  patchAdminTeamMember(userId: string, patch: Record<string, unknown>) {
    return from(this.djangoApi.patchAdminTeamMember(userId, patch));
  }

  listPendingActivations(params?: { practiceId?: string; limit?: number }) {
    return from(this.djangoApi.listPendingActivations(params));
  }

  remindPendingActivations(payload: {
    patientIds?: string[];
    all?: boolean;
    practiceId?: string;
  }) {
    return from(this.djangoApi.remindPendingActivations(payload));
  }

  getDoctorsById(id: string): Observable<any | null> {
    return interval(15_000).pipe(
      startWith(0),
      switchMap(() => from(this.djangoApi.getDoctor(id))),
      map((doctor) =>
        this.djangoApi.enrichDoctorMedia({
          ...doctor,
          id: String(doctor['id'] ?? id),
        }),
      ),
      catchError(() => of(null)),
    );
  }

  getWellnessProviders(): Observable<Array<Record<string, unknown> & { id: string }>> {
    return interval(30_000).pipe(
      startWith(0),
      switchMap(() => from(this.djangoApi.listWellnessProviders())),
      map((rows) => rows.map((row) => ({ ...row, id: String(row['id'] ?? '') }))),
    );
  }

  getMarketplacePartnerApplications(
    status?: string,
  ): Observable<Array<Record<string, unknown> & { id: string }>> {
    return from(this.djangoApi.listMarketplacePartnerApplications(status)).pipe(
      map((rows) => rows.map((row) => ({ ...row, id: String(row['id'] ?? '') }))),
    );
  }

  async approveMarketplacePartnerApplication(applicationId: string): Promise<void> {
    await this.djangoApi.approveMarketplacePartnerApplication(applicationId);
  }

  async rejectMarketplacePartnerApplication(
    applicationId: string,
    reason?: string,
  ): Promise<void> {
    await this.djangoApi.rejectMarketplacePartnerApplication(applicationId, reason);
  }

  async upsertWellnessProvider(
    id: string | null,
    data: Record<string, unknown>,
  ): Promise<string> {
    const metadata = {
      tagline: data['tagline'] ?? '',
      email: data['email'] ?? '',
      phone: data['phone'] ?? '',
      services: data['services'] ?? [],
    };
    const payload = {
      name: data['name'],
      category: data['category'],
      description: data['description'],
      city: data['city'],
      province: data['province'],
      published: data['published'],
      verified: data['verified'],
      metadata,
    };
    if (id) {
      await this.djangoApi.patchWellnessProvider(id, payload);
      return id;
    }
    const created = await this.djangoApi.createWellnessProvider(payload);
    return String(created['id']);
  }

  async deleteWellnessProvider(id: string): Promise<void> {
    await this.djangoApi.deleteWellnessProvider(id);
  }

  getPharmacies(): Observable<Array<Record<string, unknown> & { id: string }>> {
    return interval(30_000).pipe(
      startWith(0),
      switchMap(() => from(this.djangoApi.listPharmacies())),
      map((rows) => rows.map((row) => ({ ...row, id: String(row['id'] ?? '') }))),
    );
  }

  async upsertPharmacy(id: string | null, data: Record<string, unknown>): Promise<string> {
    if (id) {
      await this.djangoApi.patchPharmacy(id, data);
      return id;
    }
    const created = await this.djangoApi.createPharmacy(data);
    return String(created['id']);
  }

  async deletePharmacy(id: string): Promise<void> {
    await this.djangoApi.deletePharmacy(id);
  }

  getEmployers(): Observable<Array<Record<string, unknown> & { id: string }>> {
    if (!this.djangoApi.enabled) return of([]);
    return interval(60_000).pipe(
      startWith(0),
      switchMap(() =>
        from(this.djangoApi.listEmployers()).pipe(
          map((rows) =>
            rows.map((row) => ({
              ...row,
              id: String(row['id']),
            })),
          ),
          catchError(() => of([])),
        ),
      ),
    );
  }
}
