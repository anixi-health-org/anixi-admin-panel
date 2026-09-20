export type AdminOpsRole = 'super_admin' | 'support' | 'clinical_ops' | 'read_only';

export type AdminPermissions = {
  manageTeam?: boolean;
  manageUsers?: boolean;
  editUserContact?: boolean;
  verifyDoctors?: boolean;
  sendActivationReminders?: boolean;
  viewAudit?: boolean;
};

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'super_admin';
  opsRole?: AdminOpsRole;
  permissions?: AdminPermissions;
}

export interface AdminTeamMember {
  id: string;
  email: string;
  displayName: string;
  opsRole: AdminOpsRole;
  permissions: AdminPermissions;
  active: boolean;
  isStaff: boolean;
  createdAt?: string;
}

export interface PendingActivationRow {
  id: string;
  patientId: string;
  displayName: string;
  contactEmail: string;
  phoneNumber?: string;
  practiceId?: string;
  practiceName?: string;
  clinicCode?: string;
  activationCode?: string;
  dateOfBirth?: string;
  mrn?: string;
  notes?: string;
  canRemind?: boolean;
  createdAt?: string;
  lastRemindedAt?: string;
}

export interface CrmEmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  isDefault?: boolean;
  placeholderHelp?: string;
  createdAt?: string;
  updatedAt?: string;
}
