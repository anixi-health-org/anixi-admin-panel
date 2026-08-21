export type PlatformUser = Record<string, unknown> & {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  phone?: string;
  accountType?: string | null;
  role?: string | null;
  accountKind?: string | null;
  joinIntent?: string | null;
  skipPracticeProvision?: boolean | null;
  requiresClinicalVerification?: boolean | null;
  primaryPracticeId?: string | null;
  managedClinicName?: string | null;
  accountStatus?: string | null;
  verificationStatus?: string | null;
  photoUrl?: string | null;
  photoURL?: string | null;
  createdAt?: { toDate?: () => Date } | Date | string | null;
  updatedAt?: { toDate?: () => Date } | Date | string | null;
  lastActiveAt?: { toDate?: () => Date } | Date | string | null;
};

export type UserRoleFilter =
  | 'all'
  | 'doctor'
  | 'patient'
  | 'caregiver'
  | 'admin'
  | 'clinic_admin'
  | 'unknown';

/** Clinic portal admins manage an establishment; they are not practicing clinicians. */
export function isClinicAdminUser(user: PlatformUser): boolean {
  const kind = String(user.accountKind ?? '').toLowerCase();
  if (kind === 'clinic_admin') return true;
  if (user.requiresClinicalVerification === false && String(user.joinIntent ?? '').toLowerCase() === 'clinic') {
    return true;
  }
  if (user.skipPracticeProvision === true && String(user.joinIntent ?? '').toLowerCase() === 'clinic') {
    return true;
  }
  if (typeof user.managedClinicName === 'string' && user.managedClinicName.trim()) {
    return true;
  }
  if (String(user.joinIntent ?? '').toLowerCase() === 'clinic') return true;
  const raw = String(user.accountType ?? user.role ?? '')
    .trim()
    .toLowerCase();
  return raw === 'staff' || raw === 'practice_manager' || raw === 'clinic_admin';
}

export function getUserDisplayName(user: PlatformUser): string {
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  if (displayName) return displayName;

  const first = typeof user.firstName === 'string' ? user.firstName.trim() : '';
  const last = typeof user.lastName === 'string' ? user.lastName.trim() : '';
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;

  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email) return email.split('@')[0] || email;

  return 'Unnamed user';
}

export function getUserEmail(user: PlatformUser): string {
  return typeof user.email === 'string' && user.email.trim() ? user.email.trim() : '—';
}

export function getUserPhone(user: PlatformUser): string {
  const phone =
    (typeof user.phoneNumber === 'string' && user.phoneNumber.trim()) ||
    (typeof user.phone === 'string' && user.phone.trim()) ||
    '';
  return phone || '—';
}

export function getUserRole(user: PlatformUser): UserRoleFilter {
  if (isClinicAdminUser(user)) return 'clinic_admin';

  const raw = String(user.accountType ?? user.role ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'doctor' || raw === 'patient' || raw === 'caregiver' || raw === 'admin') {
    return raw;
  }
  if (raw === 'super_admin') return 'admin';
  // Mobile sign-ups often omit accountType; the app treats those accounts as patients.
  return 'patient';
}

export function formatUserRoleLabel(role: UserRoleFilter | string): string {
  switch (role) {
    case 'doctor':
      return 'Doctor';
    case 'patient':
      return 'Patient';
    case 'caregiver':
      return 'Caregiver';
    case 'admin':
      return 'Admin';
    case 'clinic_admin':
      return 'Clinic admin';
    case 'all':
      return 'All';
    default:
      return 'Unassigned';
  }
}

export function formatAccountStatusLabel(status?: string | null): string {
  const raw = String(status ?? 'active').toLowerCase();
  if (raw === 'on_hold') return 'On hold';
  if (raw === 'suspended') return 'Suspended';
  if (raw === 'pending') return 'Pending review';
  if (raw === 'rejected') return 'Rejected';
  return 'Active';
}

export function enrichUserWithDoctorProfile(
  user: PlatformUser,
  doctor?: Record<string, unknown> | null
): PlatformUser {
  if (!doctor) return user;
  return {
    ...user,
    accountKind: (user.accountKind || doctor['accountKind'] || null) as string | null,
    joinIntent: (user.joinIntent || doctor['joinIntent'] || null) as string | null,
    requiresClinicalVerification:
      user.requiresClinicalVerification ??
      (typeof doctor['requiresClinicalVerification'] === 'boolean'
        ? (doctor['requiresClinicalVerification'] as boolean)
        : null),
    verificationStatus:
      (user.verificationStatus || doctor['verificationStatus'] || null) as string | null,
    accountStatus:
      (user.accountStatus ||
        doctor['accountStatus'] ||
        doctor['verificationStatus'] ||
        null) as string | null,
    primaryPracticeId:
      (user.primaryPracticeId || doctor['primaryPracticeId'] || null) as string | null,
  };
}

export function enrichUserWithPracticeContext(
  user: PlatformUser,
  options?: {
    doctor?: Record<string, unknown> | null;
    ownedClinic?: { id: string; name: string } | null;
    memberClinic?: { id: string; name: string; isClinician?: boolean } | null;
  }
): PlatformUser {
  let enriched = enrichUserWithDoctorProfile(user, options?.doctor);

  if (options?.ownedClinic) {
    enriched = {
      ...enriched,
      accountKind: 'clinic_admin',
      joinIntent: 'clinic',
      requiresClinicalVerification: false,
      primaryPracticeId: options.ownedClinic.id,
      managedClinicName: options.ownedClinic.name,
      verificationStatus:
        enriched.verificationStatus === 'pending' ? 'not_required' : enriched.verificationStatus,
    };
  } else if (
    options?.memberClinic &&
    options.memberClinic.isClinician === false
  ) {
    enriched = {
      ...enriched,
      accountKind: 'clinic_admin',
      requiresClinicalVerification: false,
      primaryPracticeId: options.memberClinic.id,
      managedClinicName: options.memberClinic.name,
    };
  }

  return enriched;
}

export function formatUserTimestamp(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate?.();
    return date ? date.toLocaleDateString() : '—';
  }
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
  return '—';
}

export function userMatchesSearch(user: PlatformUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    getUserDisplayName(user),
    user.email,
    user.phoneNumber,
    user.phone,
    user.accountType,
    user.role,
    user.accountKind,
    formatUserRoleLabel(getUserRole(user)),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
