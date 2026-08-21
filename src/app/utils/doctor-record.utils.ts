export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'on_hold';

export type DoctorRecord = Record<string, unknown> & {
  id?: string;
  title?: string;
  fullName?: string;
  displayName?: string;
  gender?: string;
  idOrPassportNumber?: string;
  nationality?: string;
  hpcsaRegistrationNumber?: string;
  licenseNumber?: string;
  medicalSpecialty?: string;
  specialty?: string;
  yearsInPractice?: number;
  hpcsaCertificateUrl?: string;
  practiceLicenseUrl?: string;
  practiceType?: string | string[];
  practiceName?: string;
  practiceNumberBhf?: string;
  vatNumber?: string;
  practiceFacility?: string;
  practiceProvince?: string;
  practiceCity?: string;
  practiceAddress?: string;
  officeAddress?: string;
  phoneNumber?: string;
  email?: string;
  preferredContactMethods?: string[];
  contactMethodDetails?: unknown;
  websiteOrSocialLink?: string;
  profileImageUrl?: string;
  logoUrl?: string;
  country?: string;
  currency?: string;
  verificationStatus?: string;
  verifiedAt?: { toDate?: () => Date };
  verifiedBy?: string;
  createdAt?: { toDate?: () => Date };
  hasMedicalAidAffiliation?: boolean;
  medicalAidAffiliationType?: string;
  medicalAidContractUrl?: string;
  hpcsaManuallyVerified?: boolean;
  hpcsaVerificationMethod?: string;
  hpcsaVerificationReference?: string;
  hpcsaReviewerNotes?: string;
  hpcsaVerifiedAt?: { toDate?: () => Date };
  hpcsaVerifiedBy?: string;
  identityVerified?: boolean;
  identityVerifiedAt?: { toDate?: () => Date };
  identityVerifiedBy?: string;
  identityReviewerNotes?: string;
  documentReviews?: Record<string, unknown>;
  verificationHistory?: unknown[];
  informationRequested?: boolean;
  informationRequestReason?: string;
  informationRequestedAt?: { toDate?: () => Date };
  informationRequestedBy?: string;
  statusReason?: string;
  rejectionReason?: string;
};

export function normalizeVerificationStatus(status?: string): VerificationStatus {
  if (
    status === 'approved' ||
    status === 'rejected' ||
    status === 'suspended' ||
    status === 'on_hold'
  ) {
    return status;
  }
  return 'pending';
}

/** Clinic portal admins are not clinicians and must not appear in doctor verification. */
export function isClinicAdminAccount(doctor: DoctorRecord): boolean {
  if (doctor['accountKind'] === 'clinic_admin') return true;
  if (doctor['requiresClinicalVerification'] === false) return true;
  if (doctor['joinIntent'] === 'clinic') return true;
  return false;
}

/**
 * Records that belong in Doctor Verification.
 * Excludes clinic admins and incomplete web onboarding drafts
 * (`applicationComplete: false`). Mobile signups historically omitted the
 * flag while still writing `verificationStatus: 'pending'` — treat missing
 * as submitted so they appear in Pending Review.
 */
export function isDoctorVerificationCandidate(doctor: DoctorRecord): boolean {
  if (isClinicAdminAccount(doctor)) return false;

  const status = normalizeVerificationStatus(doctor.verificationStatus);
  if (status === 'pending' && doctor['applicationComplete'] === false) {
    return false;
  }

  return true;
}

export function capitalizeWords(value?: string): string {
  if (!value) return '';
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function getDoctorDisplayName(doctor: DoctorRecord): string {
  const title = doctor.title ? `${capitalizeWords(doctor.title)} ` : '';
  const name =
    (doctor.fullName as string) ||
    (doctor.displayName as string) ||
    'Unknown doctor';
  return `${title}${name}`.trim();
}

export function formatDoctorField(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => capitalizeWords(String(item))).join(', ')
      : '-';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return capitalizeWords(String(value));
}

export function doctorMatchesSearch(doctor: DoctorRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    doctor.fullName,
    doctor.displayName,
    doctor.email,
    doctor.phoneNumber,
    doctor.medicalSpecialty,
    doctor.specialty,
    doctor.practiceCity,
    doctor.practiceName,
    doctor.hpcsaRegistrationNumber,
    doctor.licenseNumber,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(q);
}

export function getCertificateUrl(doctor: DoctorRecord): string | null {
  const url =
    (doctor.hpcsaCertificateUrl as string) ||
    (doctor['hpscaCertificateUrl'] as string) ||
    null;
  return url && url.trim() ? url : null;
}

export function getPracticeLicenseUrl(doctor: DoctorRecord): string | null {
  const url =
    (doctor.practiceLicenseUrl as string) ||
    (doctor['practiceLicenceUrl'] as string) ||
    null;
  return url && url.trim() ? url : null;
}

function isPracticeLetterheadUrl(url: string): boolean {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  if (/doctors\/[^/]+\/branding\//.test(decoded)) return true;
  if (!decoded.includes('doctor-logos/')) return false;
  if (/doctor-logos\/[^/?#]+\/profile\./i.test(decoded)) return false;
  return true;
}

/** Headshot only — practice logos belong on invoices, not avatars. */
export function getDoctorProfilePhotoUrl(doctor: DoctorRecord): string | null {
  const photo = doctor.profileImageUrl?.trim() || '';
  const logo = doctor.logoUrl?.trim() || '';
  if (!photo || isPracticeLetterheadUrl(photo) || (logo && photo === logo)) {
    return null;
  }
  return photo;
}

export function formatTimestamp(value: unknown): string {
  if (!value) return '-';
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate?.();
    return date ? date.toLocaleString() : '-';
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  return String(value);
}
