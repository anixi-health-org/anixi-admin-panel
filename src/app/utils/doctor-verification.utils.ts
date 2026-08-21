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
  url: string | null;
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
 * Hard requirements for practice profile completeness.
 * Soft/optional location fields (city, province, address) are shown in admin
 * but do not block approval — mobile onboarding often omits them.
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
    key: 'practiceType',
    label: 'Consultation type',
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
    required: false,
    getUrl: getCertificateUrl,
  },
  {
    key: 'practice_license',
    name: 'Practice licence',
    type: 'Practice Licence',
    required: false,
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
  return PRACTICE_PROFILE_REQUIRED_FIELDS.filter(
    (field) => !hasPersistedValue(field.read(doctor))
  ).map((field) => field.label);
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

/** Build document rows from uploaded/linked URLs + persisted review map. */
export function listDoctorDocuments(doctor: DoctorRecord): DoctorDocumentReview[] {
  const rows: DoctorDocumentReview[] = [];
  for (const def of DOC_DEFS) {
    const url = def.getUrl(doctor);
    const stored = readStoredReview(doctor, def.key);
    const status = (stored?.status as DocumentReviewStatus) || 'pending';
    // Always surface known document slots so admins see optional gaps.
    rows.push({
      documentKey: def.key,
      documentName: def.name,
      documentType: def.type,
      url,
      required: def.required,
      status: url ? status : 'pending',
      reviewerId: stored?.reviewerId,
      reviewedAt: stored?.reviewedAt,
      notes: stored?.notes,
    });
  }
  return rows;
}

/**
 * Document gate: only rejected / requires_replacement links block approval.
 * Certificate and licence URLs are optional on mobile (text links, not uploads).
 */
export function requiredDocumentsSummary(doctor: DoctorRecord): {
  verified: number;
  total: number;
  done: boolean;
  missing: string[];
  blocked: string[];
  provided: number;
} {
  const missing: string[] = [];
  const blocked: string[] = [];
  let verified = 0;
  let provided = 0;

  for (const def of DOC_DEFS) {
    const url = def.getUrl(doctor);
    if (!url) {
      if (def.required) missing.push(def.name);
      continue;
    }
    provided += 1;
    const stored = readStoredReview(doctor, def.key);
    const status = (stored?.status as DocumentReviewStatus) || 'pending';
    if (status === 'verified') {
      verified += 1;
    } else if (status === 'rejected' || status === 'requires_replacement') {
      blocked.push(`${def.name} (${documentStatusLabel(status)})`);
    }
  }

  const requiredDefs = DOC_DEFS.filter((d) => d.required);
  return {
    verified,
    total: requiredDefs.length,
    done: missing.length === 0 && blocked.length === 0,
    missing,
    blocked,
    provided,
  };
}

export function hasIdentityProfile(doctor: DoctorRecord): boolean {
  return !!(doctor.fullName || doctor.displayName) && !!String(doctor.email || '').trim();
}

export function getRegistrationNumber(doctor: DoctorRecord): string {
  return (
    (doctor.hpcsaRegistrationNumber as string) ||
    (doctor.licenseNumber as string) ||
    ''
  ).trim();
}

/**
 * Checklist reflects whether the doctor provided enough data for an admin
 * decision. Manual confirm flags are recorded on Approve, not required first.
 */
export function buildVerificationChecklist(doctor: DoctorRecord): ChecklistItem[] {
  const hasIdentityData = hasIdentityProfile(doctor);
  const registration = getRegistrationNumber(doctor);
  const docs = requiredDocumentsSummary(doctor);
  const practiceGaps = getPracticeProfileGaps(doctor);
  const practiceDone = practiceGaps.length === 0;

  let docsDetail: string;
  if (docs.blocked.length) {
    docsDetail = docs.blocked.join('; ');
  } else if (docs.provided === 0) {
    docsDetail = 'No certificate links provided (optional)';
  } else {
    docsDetail = `${docs.provided} link(s) provided · ${docs.verified} marked verified`;
  }

  return [
    {
      key: 'identity',
      label: 'Identity',
      done: hasIdentityData,
      detail: hasIdentityData
        ? doctor.identityVerified === true
          ? 'Provided · admin confirmed'
          : 'Provided in app'
        : 'Incomplete — name and email required',
    },
    {
      key: 'hpcsa',
      label: 'HPCSA / registration',
      done: !!registration,
      detail: registration
        ? doctor.hpcsaManuallyVerified === true
          ? `${registration} · admin confirmed`
          : `${registration} · provided in app`
        : 'No registration number',
    },
    {
      key: 'documents',
      label: 'Documents / links',
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

/** Admin may approve when profile essentials are present and no doc is rejected. */
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
