import { Injectable } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { catchError, from, map, Observable, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
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
    private db: Firestore,
    private authService: AuthService
  ) {}

  getAllDoctors(): Observable<any[]> {
    const ref = collection(this.db, 'doctors');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((d) => ({
          ...(d.data() as Omit<any, 'id'>),
          id: d.id,
        }))
      )
    );
  }

  getUsers(): Observable<any[]> {
    return new Observable((observer) => {
      const ref = collection(this.db, 'Users');
      const unsubscribe = onSnapshot(ref, (snapshot) => {
        const users = snapshot.docs.map((d) => ({
          ...(d.data() as Omit<any, 'id'>),
          id: d.id,
        }));
        observer.next(users);
      });
      return () => unsubscribe();
    });
  }

  private historyEvent(action: string, reason?: string, entity?: { type: string; id: string }) {
    const adminId = this.authService.getAdminUserId() || 'unknown';
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      adminId,
      at: new Date(),
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      ...(entity ? { entityType: entity.type, entityId: entity.id } : {}),
    };
  }

  async updateDoctorStatus(
    doctorId: string,
    status: string,
    options?: { reason?: string }
  ): Promise<{ verified: boolean; status: string | null }> {
    const ref = doc(this.db, `doctors/${doctorId}`);
    const adminId = this.authService.getAdminUserId();
    let doctorForApprove: DoctorRecord | null = null;

    if (status === 'approved') {
      const current = await getDoc(ref);
      if (!current.exists()) {
        throw new Error('Doctor record not found.');
      }
      doctorForApprove = {
        ...(current.data() as DoctorRecord),
        id: doctorId,
      };
      if (!canApproveDoctor(doctorForApprove)) {
        throw new Error(
          `Cannot approve: ${approvalBlockReasons(doctorForApprove).join(' | ')}`
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

    const payload: Record<string, unknown> = {
      verificationStatus: status,
      verifiedAt: serverTimestamp(),
      verifiedBy: adminId,
      updatedAt: serverTimestamp(),
      verificationHistory: arrayUnion(
        this.historyEvent(actionLabel, options?.reason, {
          type: 'doctor',
          id: doctorId,
        })
      ),
    };
    if (options?.reason?.trim()) {
      payload['statusReason'] = options.reason.trim();
      payload['statusReasonAt'] = serverTimestamp();
      payload['statusReasonBy'] = adminId;
      if (status === 'rejected' || status === 'suspended' || status === 'on_hold') {
        payload['rejectionReason'] = options.reason.trim();
      }
    }
    if (status === 'approved' && doctorForApprove) {
      payload['informationRequested'] = false;
      // Approving records admin satisfaction and unlocks practice access.
      payload['identityVerified'] = true;
      payload['identityVerifiedAt'] = serverTimestamp();
      payload['identityVerifiedBy'] = adminId;
      payload['hpcsaManuallyVerified'] = true;
      payload['hpcsaVerificationMethod'] = 'manual';
      payload['hpcsaVerifiedAt'] = serverTimestamp();
      payload['hpcsaVerifiedBy'] = adminId;

      const reviews: Record<string, unknown> = {
        ...((doctorForApprove.documentReviews as Record<string, unknown>) || {}),
      };
      for (const key of [
        'hpcsa_certificate',
        'practice_license',
        'medical_aid_contract',
      ] as const) {
        const url =
          key === 'hpcsa_certificate'
            ? getCertificateUrl(doctorForApprove)
            : key === 'practice_license'
              ? getPracticeLicenseUrl(doctorForApprove)
              : ((doctorForApprove.medicalAidContractUrl as string) || '').trim() ||
                null;
        if (!url) continue;
        const existing = (reviews[key] as Record<string, unknown> | undefined) || {};
        if (
          existing['status'] === 'rejected' ||
          existing['status'] === 'requires_replacement'
        ) {
          continue;
        }
        reviews[key] = {
          ...existing,
          status: 'verified',
          reviewerId: adminId,
          reviewedAt: new Date(),
          notes:
            (existing['notes'] as string) || 'Marked verified on approval',
        };
      }
      payload['documentReviews'] = reviews;
    }
    if (status === 'rejected' || status === 'pending' || status === 'on_hold') {
      // verificationStatus is the source of truth for doctor web/mobile access.
    }
    await setDoc(ref, payload, { merge: true });
    await this.mirrorUserAccountStatus(doctorId, status, options?.reason);

    const snap = await getDoc(ref);
    if (!snap.exists()) return { verified: false, status: null };
    const data = snap.data() as Record<string, unknown>;
    return {
      verified: data['verificationStatus'] === status,
      status: (data['verificationStatus'] as string) || null,
    };
  }

  async recordManualHpcsaVerification(
    doctorId: string,
    input: {
      verified: boolean;
      reference?: string;
      notes?: string;
    }
  ): Promise<{ verified: boolean }> {
    const ref = doc(this.db, `doctors/${doctorId}`);
    const adminId = this.authService.getAdminUserId();
    await setDoc(
      ref,
      {
        hpcsaManuallyVerified: input.verified,
        hpcsaVerificationMethod: 'manual',
        hpcsaVerificationReference: (input.reference || '').trim(),
        hpcsaReviewerNotes: (input.notes || '').trim(),
        hpcsaVerifiedAt: serverTimestamp(),
        hpcsaVerifiedBy: adminId,
        updatedAt: serverTimestamp(),
        verificationHistory: arrayUnion(
          this.historyEvent(
            input.verified ? 'HPCSA manually verified' : 'HPCSA verification cleared',
            input.notes || input.reference,
            { type: 'hpcsa', id: doctorId }
          )
        ),
      },
      { merge: true }
    );
    const snap = await getDoc(ref);
    const data = snap.data() as Record<string, unknown> | undefined;
    return { verified: data?.['hpcsaManuallyVerified'] === input.verified };
  }

  async recordIdentityVerification(
    doctorId: string,
    notes?: string
  ): Promise<{ verified: boolean }> {
    const ref = doc(this.db, `doctors/${doctorId}`);
    const adminId = this.authService.getAdminUserId();
    await setDoc(
      ref,
      {
        identityVerified: true,
        identityVerifiedAt: serverTimestamp(),
        identityVerifiedBy: adminId,
        identityReviewerNotes: (notes || '').trim(),
        updatedAt: serverTimestamp(),
        verificationHistory: arrayUnion(
          this.historyEvent('Identity verified', notes, {
            type: 'identity',
            id: doctorId,
          })
        ),
      },
      { merge: true }
    );
    const snap = await getDoc(ref);
    const data = snap.data() as Record<string, unknown> | undefined;
    return { verified: data?.['identityVerified'] === true };
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
    }
  ): Promise<{ verified: boolean; status: DocumentReviewStatus | null }> {
    const ref = doc(this.db, `doctors/${doctorId}`);
    const adminId = this.authService.getAdminUserId();
    const review = {
      documentKey: input.documentKey,
      documentName: input.documentName,
      documentType: input.documentType,
      url: input.url,
      status: input.status,
      reviewerId: adminId,
      reviewedAt: new Date(),
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

    await setDoc(
      ref,
      {
        [`documentReviews.${input.documentKey}`]: review,
        updatedAt: serverTimestamp(),
        verificationHistory: arrayUnion(
          this.historyEvent(action, input.notes, {
            type: 'document',
            id: input.documentKey,
          })
        ),
      },
      { merge: true }
    );

    const snap = await getDoc(ref);
    const data = snap.data() as Record<string, unknown> | undefined;
    const reviews = (data?.['documentReviews'] as Record<string, { status?: string }>) || {};
    const saved = reviews[input.documentKey];
    return {
      verified: saved?.status === input.status,
      status: (saved?.status as DocumentReviewStatus) || null,
    };
  }

  async requestMoreInformation(
    doctorId: string,
    reason: string
  ): Promise<{ verified: boolean }> {
    const ref = doc(this.db, `doctors/${doctorId}`);
    const adminId = this.authService.getAdminUserId();
    const trimmed = reason.trim();
    await setDoc(
      ref,
      {
        informationRequested: true,
        informationRequestReason: trimmed,
        informationRequestedAt: serverTimestamp(),
        informationRequestedBy: adminId,
        // Keep pending — do not activate.
        verificationStatus: 'pending',
        updatedAt: serverTimestamp(),
        verificationHistory: arrayUnion(
          this.historyEvent('More information requested', trimmed, {
            type: 'doctor',
            id: doctorId,
          })
        ),
      },
      { merge: true }
    );
    const snap = await getDoc(ref);
    const data = snap.data() as Record<string, unknown> | undefined;
    return {
      verified:
        data?.['informationRequested'] === true &&
        data?.['informationRequestReason'] === trimmed &&
        data?.['verificationStatus'] !== 'approved',
    };
  }

  getDoctors(): Observable<any[]> {
    return new Observable((observer) => {
      const ref = collection(this.db, 'doctors');
      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const doctors = snapshot.docs.map((d) => ({
            ...(d.data() as Omit<any, 'id'>),
            id: d.id,
          }));
          observer.next(doctors);
        },
        (error) => observer.error(error)
      );
      return () => unsubscribe();
    });
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
            (d) => !d.verificationStatus || d.verificationStatus === 'pending'
          ).length,
          approvedDoctors: clinical.filter((d) => d.verificationStatus === 'approved')
            .length,
          rejectedDoctors: clinical.filter((d) => d.verificationStatus === 'rejected')
            .length,
          suspendedDoctors: clinical.filter((d) => d.verificationStatus === 'suspended')
            .length,
        };
      })
    );
  }

  getPractices(): Observable<PracticeRecord[]> {
    return new Observable((observer) => {
      const ref = collection(this.db, 'practices');
      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const practices = snapshot.docs.map((d) => ({
            ...(d.data() as Omit<PracticeRecord, 'id'>),
            id: d.id,
          }));
          observer.next(practices);
        },
        (error) => observer.error(error)
      );
      return () => unsubscribe();
    });
  }

  getPracticeById(practiceId: string): Observable<PracticeRecord | null> {
    return from(getDoc(doc(this.db, `practices/${practiceId}`))).pipe(
      map((snap) =>
        snap.exists()
          ? ({ ...(snap.data() as Omit<PracticeRecord, 'id'>), id: snap.id } as PracticeRecord)
          : null
      )
    );
  }

  /** List establishments; falls back to linked practice IDs when collection list is empty. */
  getPracticesForAdmin(
    users: PlatformUser[],
    doctors: Array<Record<string, unknown> & { id: string }>
  ): Observable<PracticeRecord[]> {
    return this.getPractices().pipe(
      catchError(() => of([] as PracticeRecord[])),
      switchMap((practices) => {
        if (practices.length > 0) {
          return of(this.uniquePractices(practices));
        }
        return from(this.loadPracticesFallback(users, doctors));
      })
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
    doctors: Array<Record<string, unknown> & { id: string }>
  ): Promise<PracticeRecord[]> {
    const byId = new Map<string, PracticeRecord>();
    const addPractice = (practice: PracticeRecord | null) => {
      if (practice) byId.set(practice.id, practice);
    };

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
        const snap = await getDoc(doc(this.db, `practices/${id}`));
        addPractice(
          snap.exists()
            ? ({ ...(snap.data() as Omit<PracticeRecord, 'id'>), id: snap.id } as PracticeRecord)
            : null
        );
      })
    );

    const ownerIds = new Set<string>();
    for (const user of users) {
      if (String(user.accountType ?? user.role ?? '').toLowerCase() === 'doctor') {
        ownerIds.add(user.id);
      }
    }
    for (const doctor of doctors) {
      ownerIds.add(doctor.id);
    }

    await Promise.all(
      [...ownerIds].map(async (ownerId) => {
        if ([...byId.values()].some((practice) => practice.ownerId === ownerId)) return;
        const snap = await getDocs(
          query(collection(this.db, 'practices'), where('ownerId', '==', ownerId))
        );
        snap.docs.forEach((d) =>
          addPractice({
            ...(d.data() as Omit<PracticeRecord, 'id'>),
            id: d.id,
          })
        );
      })
    );

    return [...byId.values()];
  }

  buildUsersWithPracticeContext(
    users: PlatformUser[],
    doctors: Array<Record<string, unknown> & { id: string }>,
    practices: PracticeRecord[]
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

  /** Persist clinic-admin flags for accounts that own a clinic establishment. */
  async syncClinicAdminAccounts(
    _users: PlatformUser[],
    doctors: Array<Record<string, unknown> & { id: string }>,
    practices: PracticeRecord[]
  ): Promise<void> {
    const clinicOwners = practices.filter((p) => getPracticeOrgType(p) === 'clinic');
    if (!clinicOwners.length) return;

    const doctorById = new Map(doctors.map((d) => [d.id, d]));

    for (const practice of clinicOwners) {
      const ownerId = String(practice.ownerId ?? '').trim();
      if (!ownerId) continue;
      const doctor = doctorById.get(ownerId);
      if (doctor?.['accountKind'] === 'clinic_admin') continue;
      await this.markAsClinicAdmin(ownerId);
    }
  }

  getPracticeMembers(practiceId: string): Observable<PracticeMemberRecord[]> {
    return new Observable((observer) => {
      const ref = collection(this.db, `practices/${practiceId}/members`);
      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const members = snapshot.docs.map((d) => ({
            ...(d.data() as Omit<PracticeMemberRecord, 'id'>),
            id: d.id,
            uid: (d.data()['uid'] as string) || d.id,
          }));
          observer.next(members);
        },
        (error) => observer.error(error)
      );
      return () => unsubscribe();
    });
  }

  async markAsClinicAdmin(userId: string): Promise<void> {
    const adminId = this.authService.getAdminUserId();
    const payload = {
      accountKind: 'clinic_admin',
      requiresClinicalVerification: false,
      verificationStatus: 'not_required',
      joinIntent: 'clinic',
      applicationComplete: false,
      updatedAt: serverTimestamp(),
      verificationHistory: arrayUnion(
        this.historyEvent('Reclassified as clinic admin', undefined, {
          type: 'user',
          id: userId,
        })
      ),
    };
    await setDoc(doc(this.db, `doctors/${userId}`), payload, { merge: true });
    await setDoc(
      doc(this.db, `Users/${userId}`),
      {
        accountKind: 'clinic_admin',
        joinIntent: 'clinic',
        accountStatus: 'active',
        updatedAt: serverTimestamp(),
        lastReviewedBy: adminId,
      },
      { merge: true }
    );
  }

  async updateUserAccountStatus(
    userId: string,
    status: 'active' | 'on_hold' | 'suspended',
    reason?: string
  ): Promise<void> {
    await this.mirrorUserAccountStatus(userId, status, reason);
    const doctorRef = doc(this.db, `doctors/${userId}`);
    const doctorSnap = await getDoc(doctorRef);
    if (!doctorSnap.exists()) return;

    const data = doctorSnap.data() as Record<string, unknown>;
    const isClinicAdmin =
      data['accountKind'] === 'clinic_admin' || data['requiresClinicalVerification'] === false;
    const verificationStatus =
      status === 'active'
        ? isClinicAdmin
          ? 'not_required'
          : 'approved'
        : status === 'on_hold'
          ? 'on_hold'
          : 'suspended';
    await setDoc(
      doctorRef,
      {
        verificationStatus,
        accountStatus: status,
        updatedAt: serverTimestamp(),
        ...(reason?.trim()
          ? {
              statusReason: reason.trim(),
              statusReasonAt: serverTimestamp(),
              statusReasonBy: this.authService.getAdminUserId(),
            }
          : {}),
        verificationHistory: arrayUnion(
          this.historyEvent(
            status === 'active'
              ? 'Account reinstated'
              : status === 'on_hold'
                ? 'Held for further review'
                : 'Account suspended',
            reason,
            { type: 'user', id: userId }
          )
        ),
      },
      { merge: true }
    );
  }

  private async mirrorUserAccountStatus(
    userId: string,
    status: string,
    reason?: string
  ): Promise<void> {
    const accountStatus =
      status === 'approved' || status === 'not_required' || status === 'active'
        ? 'active'
        : status;
    try {
      await setDoc(
        doc(this.db, `Users/${userId}`),
        {
          accountStatus,
          updatedAt: serverTimestamp(),
          lastReviewedBy: this.authService.getAdminUserId(),
          ...(reason?.trim() ? { accountStatusReason: reason.trim() } : {}),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn('[admin] Users accountStatus mirror skipped', error);
    }
  }

  getDoctorsById(id: string): Observable<any | null> {
    return new Observable((observer) => {
      const ref = doc(this.db, `doctors/${id}`);
      const unsubscribe = onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
          observer.next({
            ...(snapshot.data() as Omit<any, 'id'>),
            id: snapshot.id,
          });
        } else {
          observer.next(null);
        }
      });
      return () => unsubscribe();
    });
  }
}
