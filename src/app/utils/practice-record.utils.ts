export type PracticeOrgType = 'solo' | 'clinic';

export type PracticeLocation = {
  id?: string;
  name?: string;
  address?: string;
  type?: string;
};

export type PracticeRecord = Record<string, unknown> & {
  id: string;
  name?: string;
  tradingName?: string;
  timezone?: string;
  ownerId?: string;
  orgType?: PracticeOrgType | string;
  bhfPracticeNumber?: string;
  locations?: PracticeLocation[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PracticeMemberRecord = Record<string, unknown> & {
  id: string;
  uid?: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
  isClinician?: boolean;
};

export function getPracticeName(practice: PracticeRecord): string {
  const name = typeof practice.name === 'string' ? practice.name.trim() : '';
  if (name) return name;
  const trading =
    typeof practice.tradingName === 'string' ? practice.tradingName.trim() : '';
  return trading || 'Unnamed establishment';
}

export function getPracticeOrgType(practice: PracticeRecord): PracticeOrgType {
  return practice.orgType === 'clinic' ? 'clinic' : 'solo';
}

export function formatPracticeOrgLabel(practice: PracticeRecord): string {
  return getPracticeOrgType(practice) === 'clinic'
    ? 'Clinic'
    : 'Private practice';
}

export function formatPracticeLocations(practice: PracticeRecord): string {
  const locations = Array.isArray(practice.locations) ? practice.locations : [];
  if (!locations.length) return 'No locations listed';
  return locations
    .map((loc) => {
      const name = loc.name?.trim() || 'Location';
      const address = loc.address?.trim();
      return address ? `${name} — ${address}` : name;
    })
    .join('; ');
}

export function formatMemberRole(role?: string): string {
  switch (String(role ?? '').toLowerCase()) {
    case 'owner':
      return 'Owner';
    case 'practice_manager':
      return 'Practice manager';
    case 'doctor':
      return 'Doctor';
    case 'receptionist':
      return 'Receptionist';
    case 'billing_clerk':
      return 'Billing';
    case 'delegate':
      return 'Delegate';
    default:
      return role ? role.replace(/_/g, ' ') : 'Member';
  }
}

export function practiceMatchesSearch(practice: PracticeRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    getPracticeName(practice),
    practice.tradingName,
    practice.bhfPracticeNumber,
    practice.ownerId,
    formatPracticeOrgLabel(practice),
    formatPracticeLocations(practice),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
