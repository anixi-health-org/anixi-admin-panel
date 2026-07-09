export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

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
  practiceFacility?: string;
  practiceProvince?: string;
  practiceCity?: string;
  practiceAddress?: string;
  officeAddress?: string;
  phoneNumber?: string;
  email?: string;
  preferredContactMethods?: string[];
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
};

export function normalizeVerificationStatus(status?: string): VerificationStatus {
  if (status === 'approved' || status === 'rejected' || status === 'suspended') {
    return status;
  }
  return 'pending';
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
    return '—';
  }
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => capitalizeWords(String(item))).join(', ')
      : '—';
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
  const url = (doctor.practiceLicenseUrl as string) || null;
  return url && url.trim() ? url : null;
}

export function formatTimestamp(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate?.();
    return date ? date.toLocaleString() : '—';
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  return String(value);
}
