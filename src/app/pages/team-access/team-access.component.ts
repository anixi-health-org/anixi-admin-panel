import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import {
  ERROR_NOTIFICATION_BOX_POSITION,
  SUCCESS_NOTIFICATION_BOX_POSITION,
} from '../../../../const';
import { AdminOpsRole, AdminTeamMember } from '../../models/admin-user';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';

const ROLE_OPTIONS: { label: string; value: AdminOpsRole; description: string }[] = [
  {
    label: 'Super admin',
    value: 'super_admin',
    description: 'Full access including team management.',
  },
  {
    label: 'Support',
    value: 'support',
    description: 'Edit user contacts and send activation reminders.',
  },
  {
    label: 'Clinical ops',
    value: 'clinical_ops',
    description: 'Doctor verification and clinical workflows.',
  },
  {
    label: 'Read only',
    value: 'read_only',
    description: 'View dashboards and audit logs only.',
  },
];

@Component({
  selector: 'app-team-access',
  standalone: false,
  templateUrl: './team-access.component.html',
  styleUrl: './team-access.component.css',
})
export class TeamAccessComponent implements OnInit {
  roleOptions = ROLE_OPTIONS;
  members: AdminTeamMember[] = [];
  isLoading = true;
  isSaving = false;
  canManageTeam = false;

  inviteForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    displayName: new FormControl('', { nonNullable: true }),
    opsRole: new FormControl<AdminOpsRole>('support', { nonNullable: true }),
  });

  constructor(
    private firestoreService: FirestoreService,
    private authService: AuthService,
    private notification: NzNotificationService,
  ) {}

  ngOnInit(): void {
    this.canManageTeam = this.authService.hasPermission('manageTeam');
    void this.loadMembers();
  }

  async loadMembers(): Promise<void> {
    this.isLoading = true;
    try {
      const rows = await this.firestoreService.listAdminTeam().toPromise();
      this.members = (rows ?? []).map((row) => ({
        id: String(row['id']),
        email: String(row['email'] ?? ''),
        displayName: String(row['displayName'] ?? ''),
        opsRole: String(row['opsRole'] ?? 'support') as AdminOpsRole,
        permissions: (row['permissions'] ?? {}) as AdminTeamMember['permissions'],
        active: row['active'] !== false,
        isStaff: Boolean(row['isStaff']),
        createdAt: row['createdAt'] ? String(row['createdAt']) : undefined,
      }));
    } catch (error) {
      this.notification.error(
        'Could not load team',
        error instanceof Error ? error.message : 'Try again later.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    } finally {
      this.isLoading = false;
    }
  }

  roleLabel(role: AdminOpsRole): string {
    return this.roleOptions.find((option) => option.value === role)?.label ?? role;
  }

  async inviteMember(): Promise<void> {
    if (!this.canManageTeam || this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    const value = this.inviteForm.getRawValue();
    try {
      await this.firestoreService
        .inviteAdminTeamMember({
          email: value.email.trim(),
          displayName: value.displayName.trim() || undefined,
          opsRole: value.opsRole,
        })
        .toPromise();
      this.notification.success(
        'Invite sent',
        'They will receive a password setup email.',
        SUCCESS_NOTIFICATION_BOX_POSITION,
      );
      this.inviteForm.reset({ email: '', displayName: '', opsRole: 'support' });
      await this.loadMembers();
    } catch (error) {
      this.notification.error(
        'Invite failed',
        error instanceof Error ? error.message : 'Try again later.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    } finally {
      this.isSaving = false;
    }
  }

  async updateRole(member: AdminTeamMember, opsRole: AdminOpsRole): Promise<void> {
    if (!this.canManageTeam) return;
    try {
      await this.firestoreService.patchAdminTeamMember(member.id, { opsRole }).toPromise();
      member.opsRole = opsRole;
      this.notification.success('Role updated', member.email, SUCCESS_NOTIFICATION_BOX_POSITION);
    } catch (error) {
      this.notification.error(
        'Update failed',
        error instanceof Error ? error.message : 'Try again later.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    }
  }

  async toggleActive(member: AdminTeamMember): Promise<void> {
    if (!this.canManageTeam) return;
    const next = !member.active;
    try {
      await this.firestoreService.patchAdminTeamMember(member.id, { active: next }).toPromise();
      member.active = next;
    } catch (error) {
      this.notification.error(
        'Update failed',
        error instanceof Error ? error.message : 'Try again later.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    }
  }
}
