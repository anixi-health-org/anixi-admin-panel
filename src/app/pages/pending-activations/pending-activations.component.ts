import { Component, OnInit } from '@angular/core';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import {
  ERROR_NOTIFICATION_BOX_POSITION,
  SUCCESS_NOTIFICATION_BOX_POSITION,
} from '../../../../const';
import { CrmEmailTemplate, PendingActivationRow } from '../../models/admin-user';
import { AuthService } from '../../services/auth.service';
import { DjangoApiService } from '../../services/django-api.service';
import { paginateItems } from '../../utils/pagination.utils';
import {
  htmlToPlainText,
  plainTextToEditorHtml,
} from '../../components/rich-text-editor/rich-text-editor.component';

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

type PlaceholderToken = {
  key: string;
  label: string;
};

export type ActivationReminderChannel = 'whatsapp' | 'email' | 'whatsapp_and_email';

export type WhatsappReachabilityStatus =
  | 'verified'
  | 'reachable'
  | 'not_on_whatsapp'
  | 'unknown'
  | 'invalid';

const BULK_WHATSAPP_MAX = 250;

@Component({
  selector: 'app-pending-activations',
  standalone: false,
  templateUrl: './pending-activations.component.html',
  styleUrl: './pending-activations.component.css',
})
export class PendingActivationsComponent implements OnInit {
  rows: PendingActivationRow[] = [];
  pageIndex = 1;
  pageSize = 25;
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
  editError: string | null = null;
  templateError: string | null = null;
  editingRow: PendingActivationRow | null = null;
  editDraft: EditDraft = this.emptyEditDraft();
  templateDraft: TemplateDraft = this.emptyTemplateDraft();
  templateMessage = '';
  templateFocusField: 'subject' | 'message' = 'message';
  placeholderTokens: PlaceholderToken[] = [
    { key: 'patient_name', label: 'Patient name' },
    { key: 'doctor_name', label: 'Doctor name' },
    { key: 'clinic_name', label: 'Clinic name' },
    { key: 'clinic_code', label: 'Clinic code' },
  ];
  reminderChannel: ActivationReminderChannel = 'whatsapp';
  readonly bulkWhatsappMax = BULK_WHATSAPP_MAX;

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

  get pagedRows(): PendingActivationRow[] {
    return paginateItems(this.rows, this.pageIndex, this.pageSize);
  }

  onPageIndexChange(page: number): void {
    this.pageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
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
      name: 'Clinic activation invite',
      subject: '{{clinic_name}} invited you to Anixi Health',
      htmlBody: '',
      textBody: '',
      isDefault: false,
    };
  }

  private defaultTemplateMessage(): string {
    return [
      'Hello {{patient_name}},',
      '',
      '{{doctor_name}} added you to the {{clinic_name}} roster on Anixi Health.',
      '',
      'Your clinic code is: {{clinic_code}}',
      '',
      'Open the Anixi Health app, tap Activate clinic account, and enter your code.',
    ].join('\n');
  }

  private toEditableMessage(source: string): string {
    const raw = source.includes('<') ? htmlToPlainText(source) : source;
    return raw
      .replace(/\{\{\s*cta_button\s*\}\}/gi, '')
      .replace(/\{\{\s*fallback_link\s*\}\}/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private buildTemplatePayload(message: string, subject: string, name: string, isDefault: boolean) {
    const trimmedMessage = message.trim();
    const htmlBody = `${plainTextToEditorHtml(trimmedMessage)}\n{{cta_button}}\n{{fallback_link}}`;
    return {
      name,
      subject,
      htmlBody,
      textBody: trimmedMessage,
      isDefault,
      category: 'pending_activation' as const,
    };
  }

  setTemplateFocus(field: 'subject' | 'message'): void {
    this.templateFocusField = field;
  }

  insertPlaceholder(key: string): void {
    const token = `{{${key}}}`;
    if (this.templateFocusField === 'subject') {
      this.templateDraft = {
        ...this.templateDraft,
        subject: `${this.templateDraft.subject}${this.templateDraft.subject ? ' ' : ''}${token}`.trim(),
      };
      return;
    }
    this.templateMessage = this.templateMessage
      ? `${this.templateMessage}${this.templateMessage.endsWith('\n') ? '' : ' '}${token}`
      : token;
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
      this.pageIndex = 1;
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
      phoneE164: row['phoneE164'] ? String(row['phoneE164']) : null,
      whatsappStatus: row['whatsappStatus'] as WhatsappReachabilityStatus | undefined,
      practiceId: row['practiceId'] ? String(row['practiceId']) : undefined,
      practiceName: row['practiceName'] ? String(row['practiceName']) : undefined,
      clinicCode: row['clinicCode'] ? String(row['clinicCode']) : undefined,
      activationCode: row['activationCode'] ? String(row['activationCode']) : undefined,
      dateOfBirth: row['dateOfBirth'] ? String(row['dateOfBirth']) : undefined,
      mrn: row['mrn'] ? String(row['mrn']) : undefined,
      notes: row['notes'] ? String(row['notes']) : undefined,
      canRemind: Boolean(row['canRemind']),
      canRemindEmail: Boolean(row['canRemindEmail'] ?? row['contactEmail']),
      canRemindWhatsapp: this.resolveCanRemindWhatsapp(row),
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

  get remindsViaEmail(): boolean {
    return this.reminderChannel === 'email' || this.reminderChannel === 'whatsapp_and_email';
  }

  get remindsViaWhatsapp(): boolean {
    return this.reminderChannel === 'whatsapp' || this.reminderChannel === 'whatsapp_and_email';
  }

  private resolveCanRemindWhatsapp(row: Record<string, unknown>): boolean {
    if (row['canRemindWhatsapp'] !== undefined && row['canRemindWhatsapp'] !== null) {
      return Boolean(row['canRemindWhatsapp']);
    }
    const status = row['whatsappStatus'] as WhatsappReachabilityStatus | undefined;
    if (status === 'invalid' || status === 'not_on_whatsapp') return false;
    const digits = String(row['phoneNumber'] ?? row['phoneE164'] ?? '').replace(/\D/g, '');
    return digits.length >= 9;
  }

  rowRemindable(row: PendingActivationRow): boolean {
    if (this.remindsViaWhatsapp && row.canRemindWhatsapp) return true;
    if (this.remindsViaEmail && row.canRemindEmail) return true;
    return false;
  }

  get remindableCount(): number {
    return this.rows.filter((row) => this.rowRemindable(row)).length;
  }

  get overWhatsappBatchLimit(): boolean {
    if (!this.remindsViaWhatsapp) return false;
    const count = this.selectedIds.size > 0 ? this.selectedIds.size : this.remindableCount;
    return count > BULK_WHATSAPP_MAX;
  }

  get missingContactHint(): string {
    if (this.remindsViaWhatsapp && !this.remindsViaEmail) {
      return 'add a valid mobile, or fix numbers marked Not on WhatsApp / Invalid';
    }
    if (this.remindsViaEmail && !this.remindsViaWhatsapp) {
      return 'edit rows missing email to enable reminders';
    }
    return 'fix phone/email for the selected channel (Not on WhatsApp rows are skipped for WA)';
  }

  onReminderChannelChange(value: ActivationReminderChannel): void {
    this.reminderChannel = value;
    this.selectedIds.clear();
  }

  toggleRow(patientId: string, checked: boolean): void {
    if (checked) this.selectedIds.add(patientId);
    else this.selectedIds.delete(patientId);
  }

  toggleAll(checked: boolean): void {
    this.selectedIds.clear();
    if (checked) {
      for (const row of this.rows) {
        if (this.rowRemindable(row)) this.selectedIds.add(row.patientId);
      }
    }
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  primarySendLabel(): string {
    if (this.isSending) return 'Sending…';
    const count = this.selectedIds.size > 0 ? this.selectedIds.size : this.remindableCount;
    const scope =
      this.selectedIds.size > 0 ? `selected (${count})` : `all (${count})`;
    if (this.reminderChannel === 'email') {
      return `Send email to ${scope}`;
    }
    if (this.reminderChannel === 'whatsapp_and_email') {
      return `Send WhatsApp + email to ${scope}`;
    }
    return `Send WhatsApp to ${scope}`;
  }

  clearEditError(): void {
    this.editError = null;
  }

  clearTemplateError(): void {
    this.templateError = null;
  }

  private humanizeError(message: string): string {
    const normalized = message.trim();
    if (normalized.includes('Email already in use')) {
      return 'This email is already linked to another Anixi account. Use a different address.';
    }
    if (normalized.includes('Patient has already activated')) {
      return 'This patient has already activated their account and is no longer pending.';
    }
    if (normalized.includes('Pending activation not found')) {
      return 'This pending patient record could not be found. Refresh the page and try again.';
    }
    return normalized || 'Something went wrong. Please try again.';
  }

  openEdit(row: PendingActivationRow): void {
    if (!this.canEdit) return;
    this.editError = null;
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
    this.editError = null;
  }

  async saveEdit(): Promise<boolean> {
    if (!this.editingRow || !this.canEdit) return false;

    const contactEmail = this.editDraft.contactEmail.trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      this.editError = 'Enter a valid contact email or leave the field empty.';
      return false;
    }

    this.editError = null;

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
      this.editError = this.humanizeError(
        error instanceof Error ? error.message : 'Try again later.',
      );
      return false;
    } finally {
      this.isSavingEdit = false;
    }
  }

  openNewTemplate(): void {
    this.templateError = null;
    this.templateDraft = this.emptyTemplateDraft();
    this.templateMessage = this.defaultTemplateMessage();
    this.templateFocusField = 'message';
    this.showTemplateModal = true;
  }

  openEditTemplate(template: CrmEmailTemplate): void {
    this.templateError = null;
    this.templateDraft = {
      id: template.id,
      name: template.name,
      subject: template.subject,
      htmlBody: template.htmlBody,
      textBody: template.textBody ?? '',
      isDefault: Boolean(template.isDefault),
    };
    this.templateMessage = this.toEditableMessage(template.textBody || template.htmlBody);
    this.templateFocusField = 'message';
    this.showTemplateModal = true;
  }

  closeTemplateModal(): void {
    this.showTemplateModal = false;
    this.templateDraft = this.emptyTemplateDraft();
    this.templateMessage = '';
    this.templateError = null;
  }

  async saveTemplate(): Promise<boolean> {
    if (!this.canRemind) return false;

    const name = this.templateDraft.name.trim() || 'Clinic activation invite';
    const subject = this.templateDraft.subject.trim();
    const message = this.templateMessage.trim();
    if (!subject || !message) {
      this.templateError = 'Add an email subject and message before saving.';
      return false;
    }

    this.templateError = null;
    this.isSavingTemplate = true;
    try {
      const payload = this.buildTemplatePayload(
        message,
        subject,
        name,
        this.templateDraft.isDefault,
      );
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
      this.templateError = this.humanizeError(
        error instanceof Error ? error.message : 'Try again later.',
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
      if (this.overWhatsappBatchLimit) {
        this.notification.error(
          'Too many recipients',
          `WhatsApp reminders: max ${BULK_WHATSAPP_MAX} per batch. Narrow your selection.`,
          ERROR_NOTIFICATION_BOX_POSITION,
        );
        return;
      }
      const result = await this.djangoApi.remindPendingActivations({
        patientIds,
        all,
        templateId: this.selectedTemplateId || undefined,
        channel: this.reminderChannel,
      });
      const wa = result?.sentWhatsapp ?? 0;
      const em = result?.sentEmail ?? 0;
      const detail =
        wa || em
          ? `WhatsApp ${wa}, email ${em}. Skipped ${result?.skipped ?? 0}, failed ${result?.failed ?? 0}.`
          : `Sent ${result?.sent ?? 0}, skipped ${result?.skipped ?? 0}, failed ${result?.failed ?? 0}.`;
      this.notification.success('Reminders sent', detail, SUCCESS_NOTIFICATION_BOX_POSITION);
      await this.loadRows();
    } catch (error) {
      this.notification.error(
        'Reminder send failed',
        error instanceof Error ? error.message : 'Check Meta WhatsApp and SMTP settings, then try again.',
        ERROR_NOTIFICATION_BOX_POSITION,
      );
    } finally {
      this.isSending = false;
    }
  }
}
