import { Injectable } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { from, map, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import {
  approvalBlockReasons,
  canApproveDoctor,
  DocumentReviewStatus,
  DoctorDocumentKey,
} from '../utils/doctor-verification.utils';
import { DoctorRecord, isDoctorVerificationCandidate } from '../utils/doctor-record.utils';

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

    if (status === 'approved') {
      const current = await getDoc(ref);
      if (!current.exists()) {
        throw new Error('Doctor record not found.');
      }
      const doctor = {
        ...(current.data() as DoctorRecord),
        id: doctorId,
      };
      if (!canApproveDoctor(doctor)) {
        throw new Error(`Cannot approve: ${approvalBlockReasons(doctor).join(' | ')}`);
      }
    }

    const actionLabel =
      status === 'approved'
        ? 'Application approved'
        : status === 'rejected'
          ? 'Application rejected'
          : status === 'suspended'
            ? 'Doctor suspended'
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
      if (status === 'rejected') {
        payload['rejectionReason'] = options.reason.trim();
      }
    }
    if (status === 'approved') {
      payload['informationRequested'] = false;
    }
    if (status === 'rejected' || status === 'pending') {
      // Explicitly ensure rejection/info-request never leaves an approved flag elsewhere.
      // verificationStatus is the source of truth for doctor web/mobile access.
    }
    await setDoc(ref, payload, { merge: true });

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
