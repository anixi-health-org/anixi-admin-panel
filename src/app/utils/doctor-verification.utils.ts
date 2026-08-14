import {
  DoctorRecord,
  getCertificateUrl,
  getPracticeLicenseUrl,
} from './doctor-record.utils';

export type DocumentReviewStatus =
  | 'pending'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'requires_replacement';

export type DoctorDocumentKey =
  | 'hpcsa_certificate'
  | 'practice_license'
  | 'medical_aid_contract';

export type DoctorDocumentReview = {
  documentKey: DoctorDocumentKey;
  documentName: string;
  documentType: string;
  url: string;
  required: boolean;
  status: DocumentReviewStatus;
  reviewerId?: string;
  reviewedAt?: unknown;
  notes?: string;
};

export type VerificationHistoryEvent = {
  id: string;
  action: string;
  adminId: string;
  at: Date | { toDate?: () => Date } | string;
  reason?: string;
  entityType?: string;
  entityId?: string;
};

export type ChecklistItem = {
  key: 'identity' | 'hpcsa' | 'documents' | 'practice';
  label: string;
  done: boolean;
  detail: string;
};

/**
 * Mandatory practice-profile fields derived from persisted doctor document values.
 * Completeness is true only when every field has a non-empty string (or non-empty array).
 * This must never rely on a frontend-only boolean.
 */
export const PRACTICE_PROFILE_REQUIRED_FIELDS: {
  key: string;
  label: string;
  read: (d: DoctorRecord) => unknown;
}[] = [
  {
    key: 'practiceName',
    label: 'Practice name',
    read: (d) => d.practiceName,
  },
  {
    key: 'specialty',
    label: 'Specialty',
    read: (d) => d.medicalSpecialty || d.specialty,
  },
  {
    key: 'practiceCity',
    label: 'City',
    read: (d) => d.practiceCity || d['city'],
  },
  {
    key: 'practiceProvince',
    label: 'Province',
    read: (d) => d.practiceProvince || d['province'],
  },
  {
    key: 'practiceAddress',
    label: 'Practice address',
    read: (d) => d.practiceAddress || d.officeAddress,
  },
  {
    key: 'practiceType',
    label: 'Practice type',
    read: (d) => d.practiceType,
  },
];

const DOC_DEFS: {
  key: DoctorDocumentKey;
  name: string;
  type: string;
  required: boolean;
  getUrl: (d: DoctorRecord) => string | null;
}[] = [
  {
    key: 'hpcsa_certificate',
    name: 'HPCSA certificate',
    type: 'HPCSA Certificate',
    required: true,
    getUrl: getCertificateUrl,
  },
  {
    key: 'practice_license',
    name: 'Practice licence',
    type: 'Practice Licence',
    required: true,
    getUrl: getPracticeLicenseUrl,
  },
  {
    key: 'medical_aid_contract',
    name: 'Medical aid contract',
    type: 'Medical Aid Contract',
    required: false,
    getUrl: (d) => {
      const url = (d.medicalAidContractUrl as string) || '';
      return url.trim() ? url : null;
    },
  },
];

export function documentStatusLabel(status: DocumentReviewStatus): string {
  switch (status) {
    case 'under_review':
      return 'Under Review';
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected';
    case 'requires_replacement':
      return 'Requires Replacement';
    default:
      return 'Pending';
  }
}

function hasPersistedValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) {
    return value.some((item) => hasPersistedValue(item));
  }
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  return String(value).trim().length > 0;
}

export function getPracticeProfileGaps(doctor: DoctorRecord): string[] {
  return PRACTICE_PROFILE_REQUIRED_FIELDS.filter((field) => !hasPersistedValue(field.read(doctor))).map(
    (field) => field.label
  );
}

export function isPracticeProfileComplete(doctor: DoctorRecord): boolean {
  return getPracticeProfileGaps(doctor).length === 0;
}

function readStoredReview(
  doctor: DoctorRecord,
  key: DoctorDocumentKey
): Partial<DoctorDocumentReview> | null {
  const map = doctor.documentReviews as
    | Record<string, Partial<DoctorDocumentReview>>
    | undefined;
  if (!map || typeof map !== 'object') return null;
  const entry = map[key];
  return entry && typeof entry === 'object' ? entry : null;
}

/** Build document rows from uploaded URLs + persisted review map. */
export function listDoctorDocuments(doctor: DoctorRecord): DoctorDocumentReview[] {
  const rows: DoctorDocumentReview[] = [];
  for (const def of DOC_DEFS) {
    const url = def.getUrl(doctor);
    if (!url) continue;
    const stored = readStoredReview(doctor, def.key);
    const status = (stored?.status as DocumentReviewStatus) || 'pending';
    rows.push({
      documentKey: def.key,
      documentName: def.name,
      documentType: def.type,
      url,
      required: def.required,
      status,
      reviewerId: stored?.reviewerId,
      reviewedAt: stored?.reviewedAt,
      notes: stored?.notes,
    });
  }
  return rows;
}

/**
 * Required documents = every DOC_DEF marked required.
 * Missing upload counts as incomplete (not only uploaded-but-unverified).
 * Rejected / requires_replacement never count as verified.
 */
export function requiredDocumentsSummary(doctor: DoctorRecord): {
  verified: number;
  total: number;
  done: boolean;
  missing: string[];
  blocked: string[];
} {
  const requiredDefs = DOC_DEFS.filter((d) => d.required);
  const missing: string[] = [];
  const blocked: string[] = [];
  let verified = 0;

  for (const def of requiredDefs) {
    const url = def.getUrl(doctor);
    if (!url) {
      missing.push(def.name);
      continue;
    }
    const stored = readStoredReview(doctor, def.key);
    const status = (stored?.status as DocumentReviewStatus) || 'pending';
    if (status === 'verified') {
      verified += 1;
    } else if (status === 'rejected' || status === 'requires_replacement') {
      blocked.push(`${def.name} (${documentStatusLabel(status)})`);
    }
  }

  const total = requiredDefs.length;
  return {
    verified,
    total,
    done: verified === total && missing.length === 0 && blocked.length === 0,
    missing,
    blocked,
  };
}

export function buildVerificationChecklist(doctor: DoctorRecord): ChecklistItem[] {
  const hasIdentityData = !!(doctor.fullName || doctor.displayName) && !!doctor.email;
  const identityDone = hasIdentityData && doctor.identityVerified === true;

  const registration =
    (doctor.hpcsaRegistrationNumber as string) || (doctor.licenseNumber as string) || '';
  const hpcsaDone = !!registration.trim() && doctor.hpcsaManuallyVerified === true;

  const docs = requiredDocumentsSummary(doctor);
  const practiceGaps = getPracticeProfileGaps(doctor);
  const practiceDone = practiceGaps.length === 0;

  let docsDetail: string;
  if (docs.missing.length) {
    docsDetail = `Missing: ${docs.missing.join(', ')}`;
  } else if (docs.blocked.length) {
    docsDetail = docs.blocked.join('; ');
  } else {
    docsDetail = `${docs.verified} / ${docs.total} verified`;
  }

  return [
    {
      key: 'identity',
      label: 'Identity',
      done: identityDone,
      detail: identityDone ? 'Verified' : hasIdentityData ? 'Awaiting confirmation' : 'Incomplete',
    },
    {
      key: 'hpcsa',
      label: 'HPCSA / registration',
      done: hpcsaDone,
      detail: hpcsaDone
        ? 'Manually verified'
        : registration.trim()
          ? 'Awaiting manual verification'
          : 'No registration number',
    },
    {
      key: 'documents',
      label: 'Required documents',
      done: docs.done,
      detail: docsDetail,
    },
    {
      key: 'practice',
      label: 'Practice profile',
      done: practiceDone,
      detail: practiceDone ? 'Complete' : `Missing: ${practiceGaps.join(', ')}`,
    },
  ];
}

export function canApproveDoctor(doctor: DoctorRecord): boolean {
  return buildVerificationChecklist(doctor).every((item) => item.done);
}

export function approvalBlockReasons(doctor: DoctorRecord): string[] {
  return buildVerificationChecklist(doctor)
    .filter((item) => !item.done)
    .map((item) => `${item.label}: ${item.detail}`);
}

export function sortVerificationHistory(
  events: VerificationHistoryEvent[] | unknown
): VerificationHistoryEvent[] {
  if (!Array.isArray(events)) return [];
  return [...(events as VerificationHistoryEvent[])].sort((a, b) => {
    const ta = historyEventTime(a.at);
    const tb = historyEventTime(b.at);
    return tb - ta;
  });
}

function historyEventTime(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatHistoryWhen(value: unknown): string {
  if (!value) return '-';
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toLocaleString();
  }
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}
