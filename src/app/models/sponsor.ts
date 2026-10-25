/** Shapes from Django apps/sponsors/services/serializers.py (admin routes). */

export type SponsorKind = 'insurer' | 'employer';
export type SponsorApplicationStatus = 'pending' | 'approved' | 'rejected';
export type SponsorOrganizationStatus = 'active' | 'suspended' | 'offboarded';
export type SponsorProgrammeStatus = 'draft' | 'pending_activation' | 'active' | 'closed';

export interface SponsorApplication {
  id: string;
  kind: SponsorKind;
  organizationName: string;
  legalName: string | null;
  registrationNumber: string | null;
  medicalSchemeId: string | null;
  medicalSchemeName: string | null;
  industry: string | null;
  coveredLives: number | null;
  country: string;
  province: string | null;
  city: string | null;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  website: string | null;
  interests: string[];
  notes: string | null;
  status: SponsorApplicationStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  organizationId: string | null;
  applicantId: string;
  applicantEmail: string | null;
  createdAt: string | null;
}

export interface SponsorApprovalInput {
  dpaSignedAt: string;
  dpaVersion?: string;
  contractStart?: string;
  contractEnd?: string;
}

export interface SponsorCounts {
  members: number;
  activeEnrolments: number;
  eligible: number;
  programmes: number;
}

export interface SponsorOrganization {
  id: string;
  kind: SponsorKind;
  name: string;
  legalName: string | null;
  registrationNumber: string | null;
  medicalSchemeId: string | null;
  medicalSchemeName: string | null;
  industry: string | null;
  coveredLives: number | null;
  country: string;
  province: string | null;
  city: string | null;
  billingEmail: string | null;
  website: string | null;
  status: SponsorOrganizationStatus;
  minCohortSize: number;
  dpaSignedAt: string | null;
  dpaVersion: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  roles: string[];
  createdAt: string | null;
  counts: SponsorCounts;
}

export interface SponsorMember {
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  inviteExpiresAt: string | null;
  createdAt: string | null;
}

export interface SponsorProgramme {
  id: string;
  organizationId: string;
  name: string;
  kind: string;
  description: string | null;
  conditions: string[];
  benefits: Record<string, unknown>;
  enrolmentMode: string;
  offersCareManagement: boolean;
  consentVersion: string;
  status: SponsorProgrammeStatus;
  startsOn: string | null;
  endsOn: string | null;
  activatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  joinCode?: string | null;
  joinLink?: string | null;
}

export interface SponsorProgrammeRow extends SponsorProgramme {
  organizationName: string;
  organizationKind: SponsorKind;
}

export interface SponsorOrganizationDetail extends SponsorOrganization {
  members: SponsorMember[];
  programmes: SponsorProgramme[];
}

export interface SponsorOrganizationUpdate {
  status?: SponsorOrganizationStatus;
  minCohortSize?: number;
  dpaSignedAt?: string | null;
  dpaVersion?: string;
  contractStart?: string | null;
  contractEnd?: string | null;
  billingEmail?: string;
}
