import { Component, OnInit } from '@angular/core';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import {
  ERROR_NOTIFICATION_BOX_POSITION,
  SUCCESS_NOTIFICATION_BOX_POSITION,
} from '../../../../const';
import { CrmEmailTemplate, PendingActivationRow } from '../../models/admin-user';
import { AuthService } from '../../services/auth.service';
import { DjangoApiService } from '../../services/django-api.service';

type EditDraft = {
  displayName: string;
  contactEmail: string;
  phoneNumber: string;
  dateOfBirth: string;
  mrn: string;
  notes: string;
};

type TemplateDraft = {
  id?: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  isDefault: boolean;
};

@Component({
  selector: 'app-pending-activations',
  standalone: false,
  templateUrl: './pending-activations.component.html',
  styleUrl: './pending-activations.component.css',
})
export class PendingActivationsComponent implements OnInit {
  rows: PendingActivationRow[] = [];
  templates: CrmEmailTemplate[] = [];
  selectedTemplateId = '';
  selectedIds = new Set<string>();
  isLoading = true;
  isSending = false;
  isSavingEdit = false;
  isSavingTemplate = false;
  canRemind = false;
  canEdit = false;
  showEditModal = false;
  showTemplateModal = false;
  editingRow: PendingActivationRow | null = null;
  editDraft: EditDraft = this.emptyEditDraft();
  templateDraft: TemplateDraft = this.emptyTemplateDraft();
  placeholderHelp =
    '{{patient_name}}, {{clinic_name}}, {{clinic_code}}, {{signup_url}}, {{doctor_name}}, {{contact_email}}';

  constructor(
    private djangoApi: DjangoApiService,
    private authService: AuthService,
    private notification: NzNotificationService,
  ) {}

  ngOnInit(): void {
    this.canRemind = this.authService.hasPermission('sendActivationReminders');
    this.canEdit = this.authService.hasPermission('editUserContact');
    void this.loadAll();
  }

  private emptyEditDraft(): EditDraft {
    return {
      displayName: '',
      contactEmail: '',
      phoneNumber: '',
      dateOfBirth: '',
      mrn: '',
      notes: '',
    };
  }

  private emptyTemplateDraft(): TemplateDraft {
    return {
      name: '',
      subject: '{{clinic_name}} invited you to Anixi Health',
      htmlBody:
        '<p>Hello {{patient_name}}, your clinic {{clinic_name}} invited you to activate on Anixi Health.</p><p>Clinic code: <strong>{{clinic_code}}</strong></p>{{cta_button}}{{fallback_link}}',
      textBody:
        'Hello {{patient_name}}, activate with clinic code {{clinic_code}} at {{signup_url}}',
      isDefault: false,
    };
  }

  async loadAll(): Promise<void> {
    this.isLoading = true;
    try {
      await Promise.all([this.loadRows(), this.loadTemplates()]);
    } finally {
      this.isLoading = false;
    }
  }

  async loadRows(): Promise<void> {
    try {
      const data = await this.djangoApi.listPendingActivations({ limit: 1000 });
      this.rows = (data ?? []).map((row) => this.mapRow(row));
      this.selectedIds.clear();
    } catch (error) {
      this.notification.error(
        'Could not load pending activations',
        error instanceof Error ? error.message : 'Try again later.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    }
  }

  async loadTemplates(): Promise<void> {
    if (!this.canRemind) return;
    try {
      const data = await this.djangoApi.listCrmEmailTemplates();
      this.templates = (data ?? []).map((row) => this.mapTemplate(row));
      if (!this.selectedTemplateId) {
        const defaultTemplate = this.templates.find((template) => template.isDefault);
        this.selectedTemplateId = defaultTemplate?.id ?? this.templates[0]?.id ?? '';
      }
      const help = this.templates[0]?.placeholderHelp;
      if (help) this.placeholderHelp = help;
    } catch {
      this.templates = [];
    }
  }

  private mapRow(row: Record<string, unknown>): PendingActivationRow {
    return {
      id: String(row['id']),
      patientId: String(row['patientId']),
      displayName: String(row['displayName'] ?? ''),
      contactEmail: String(row['contactEmail'] ?? ''),
      phoneNumber: row['phoneNumber'] ? String(row['phoneNumber']) : undefined,
      practiceId: row['practiceId'] ? String(row['practiceId']) : undefined,
      practiceName: row['practiceName'] ? String(row['practiceName']) : undefined,
      clinicCode: row['clinicCode'] ? String(row['clinicCode']) : undefined,
      activationCode: row['activationCode'] ? String(row['activationCode']) : undefined,
      dateOfBirth: row['dateOfBirth'] ? String(row['dateOfBirth']) : undefined,
      mrn: row['mrn'] ? String(row['mrn']) : undefined,
      notes: row['notes'] ? String(row['notes']) : undefined,
      canRemind: Boolean(row['canRemind']),
      createdAt: row['createdAt'] ? String(row['createdAt']) : undefined,
      lastRemindedAt: row['lastRemindedAt'] ? String(row['lastRemindedAt']) : undefined,
    };
  }

  private mapTemplate(row: Record<string, unknown>): CrmEmailTemplate {
    return {
      id: String(row['id']),
      name: String(row['name'] ?? ''),
      category: String(row['category'] ?? 'pending_activation'),
      subject: String(row['subject'] ?? ''),
      htmlBody: String(row['htmlBody'] ?? ''),
      textBody: row['textBody'] ? String(row['textBody']) : '',
      isDefault: Boolean(row['isDefault']),
      placeholderHelp: row['placeholderHelp'] ? String(row['placeholderHelp']) : undefined,
    };
  }

  get remindableCount(): number {
    return this.rows.filter((row) => row.contactEmail?.trim()).length;
  }

  toggleRow(patientId: string, checked: boolean): void {
    if (checked) this.selectedIds.add(patientId);
    else this.selectedIds.delete(patientId);
  }

  toggleAll(checked: boolean): void {
    this.selectedIds.clear();
    if (checked) {
      for (const row of this.rows) {
        if (row.contactEmail?.trim()) this.selectedIds.add(row.patientId);
      }
    }
  }

  openEdit(row: PendingActivationRow): void {
    if (!this.canEdit) return;
    this.editingRow = row;
    this.editDraft = {
      displayName: row.displayName ?? '',
      contactEmail: row.contactEmail ?? '',
      phoneNumber: row.phoneNumber ?? '',
      dateOfBirth: row.dateOfBirth ?? '',
      mrn: row.mrn ?? '',
      notes: row.notes ?? '',
    };
    this.showEditModal = true;
  }

  closeEdit(): void {
    this.showEditModal = false;
    this.editingRow = null;
  }

  async saveEdit(): Promise<boolean> {
    if (!this.editingRow || !this.canEdit) return false;

    const contactEmail = this.editDraft.contactEmail.trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      this.notification.error(
        'Invalid email',
        'Enter a valid contact email or leave the field empty.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
      return false;
    }

    this.isSavingEdit = true;
    try {
      await this.djangoApi.patchPendingActivation(this.editingRow.id, {
        displayName: this.editDraft.displayName.trim(),
        contactEmail,
        phoneNumber: this.editDraft.phoneNumber.trim(),
        dateOfBirth: this.editDraft.dateOfBirth.trim(),
        mrn: this.editDraft.mrn.trim(),
        notes: this.editDraft.notes.trim(),
      });
      this.notification.success(
        'Profile updated',
        'Pending patient contact details were saved.',
        SUCCESS_NOTIFICATION_BOX_POSITION,
      );
      await this.loadRows();
      this.closeEdit();
      return true;
    } catch (error) {
      this.notification.error(
        'Could not save profile',
        error instanceof Error ? error.message : 'Try again later.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
      return false;
    } finally {
      this.isSavingEdit = false;
    }
  }

  openNewTemplate(): void {
    this.templateDraft = this.emptyTemplateDraft();
    this.showTemplateModal = true;
  }

  openEditTemplate(template: CrmEmailTemplate): void {
    this.templateDraft = {
      id: template.id,
      name: template.name,
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody ?? '',
      isDefault: Boolean(template.isDefault),
    };
    this.showTemplateModal = true;
  }

  closeTemplateModal(): void {
    this.showTemplateModal = false;
    this.templateDraft = this.emptyTemplateDraft();
  }

  async saveTemplate(): Promise<boolean> {
    if (!this.canRemind) return false;

    const name = this.templateDraft.name.trim();
    const subject = this.templateDraft.subject.trim();
    const htmlBody = this.templateDraft.htmlBody.trim();
    if (!name || !subject || !htmlBody) {
      this.notification.error(
        'Missing fields',
        'Template name, subject, and HTML body are required.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
      return false;
    }

    this.isSavingTemplate = true;
    try {
      const payload = {
        name,
        subject,
        htmlBody,
        textBody: this.templateDraft.textBody.trim(),
        isDefault: this.templateDraft.isDefault,
        category: 'pending_activation',
      };
      if (this.templateDraft.id) {
        await this.djangoApi.patchCrmEmailTemplate(this.templateDraft.id, payload);
      } else {
        await this.djangoApi.createCrmEmailTemplate(payload);
      }
      this.notification.success(
        'Template saved',
        'Your email template is ready to use for reminders.',
        SUCCESS_NOTIFICATION_BOX_POSITION,
      );
      await this.loadTemplates();
      this.closeTemplateModal();
      return true;
    } catch (error) {
      this.notification.error(
        'Could not save template',
        error instanceof Error ? error.message : 'Try again later.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
      return false;
    } finally {
      this.isSavingTemplate = false;
    }
  }

  selectedTemplate(): CrmEmailTemplate | undefined {
    return this.templates.find((template) => template.id === this.selectedTemplateId);
  }

  async remindSelected(): Promise<void> {
    if (!this.canRemind || this.selectedIds.size === 0) return;
    await this.sendReminders(Array.from(this.selectedIds));
  }

  async remindAll(): Promise<void> {
    if (!this.canRemind) return;
    await this.sendReminders(undefined, true);
  }

  private async sendReminders(patientIds?: string[], all = false): Promise<void> {
    this.isSending = true;
    try {
      const result = await this.djangoApi.remindPendingActivations({
        patientIds,
        all,
        templateId: this.selectedTemplateId || undefined,
      });
      this.notification.success(
        'Reminders sent',
        `Sent ${result?.sent ?? 0}, skipped ${result?.skipped ?? 0}, failed ${result?.failed ?? 0}.`,
        SUCCESS_NOTIFICATION_BOX_POSITION,
      );
      await this.loadRows();
    } catch (error) {
      this.notification.error(
        'Reminder send failed',
        error instanceof Error ? error.message : 'Check SMTP settings and try again.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    } finally {
      this.isSending = false;
    }
  }
}
