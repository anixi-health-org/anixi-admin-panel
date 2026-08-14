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
  photoUrl?: string | null;
  photoURL?: string | null;
  createdAt?: { toDate?: () => Date } | Date | string | null;
  updatedAt?: { toDate?: () => Date } | Date | string | null;
  lastActiveAt?: { toDate?: () => Date } | Date | string | null;
};

export type UserRoleFilter = 'all' | 'doctor' | 'patient' | 'caregiver' | 'admin' | 'unknown';

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
  const raw = String(user.accountType ?? user.role ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'doctor' || raw === 'patient' || raw === 'caregiver' || raw === 'admin') {
    return raw;
  }
  if (raw === 'staff' || raw === 'super_admin') return 'admin';
  return 'unknown';
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
    case 'all':
      return 'All';
    default:
      return 'Unassigned';
  }
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
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
