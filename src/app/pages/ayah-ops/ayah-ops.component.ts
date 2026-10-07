import { Component } from '@angular/core';
import { DjangoApiService } from '../../services/django-api.service';

type Preview = {
  previewId: string;
  status: string;
  patient: { id: string; displayName: string } | null;
  fills: string[];
};

const FILL_LABELS: Record<string, string> = {
  gender: 'Gender',
  dateOfBirth: 'Date of birth',
  idNumber: 'ID number',
  phone: 'Cell phone',
  address: 'Address',
  insuranceName: 'Medical aid',
  plan: 'Plan',
  groupNumber: 'Group number',
  pastMedicalHistory: 'Past medical history',
  previousSurgeries: 'Past surgical history',
  familyHistory: 'Family history',
  socialHistory: 'Social history',
  problems: 'Problems',
  medications: 'Medications',
  encounters: 'Encounters',
  chartId: 'UniCharts file number',
};

@Component({
  selector: 'app-ayah-ops',
  standalone: false,
  templateUrl: './ayah-ops.component.html',
  styleUrl: './ayah-ops.component.css',
})
export class AyahOpsComponent {
  file: File | null = null;
  preview: Preview | null = null;
  status = '';
  busy = false;
  bulkBusy = false;
  practiceId = '';
  note = '';
  reply = '';

  constructor(private api: DjangoApiService) {}

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
  }

  label(key: string): string {
    return FILL_LABELS[key] ?? key;
  }

  async previewChart() {
    if (!this.file) return;
    this.busy = true;
    this.status = '';
    try {
      this.preview = await this.api.previewUnichart(this.file);
      if (this.preview.status === 'matched') {
        this.status = `${this.preview.patient?.displayName ?? 'Patient'} matched. Confirm to fill empty fields.`;
      } else if (this.preview.status === 'already_applied') {
        this.status = 'This chart was already applied.';
      } else {
        this.status = 'Ayah cannot tell which patient this chart belongs to. Nothing was written.';
      }
    } catch (err) {
      this.status = err instanceof Error ? err.message : 'Chart preview failed';
    } finally {
      this.busy = false;
    }
  }

  async runBulkImport() {
    if (!this.file || !this.practiceId.trim()) return;
    this.bulkBusy = true;
    this.status = 'Uploading PDF and starting background OCR…';
    try {
      const { jobId } = await this.api.startUnichartPdfImport(this.file, this.practiceId.trim());
      for (;;) {
        const job = await this.api.getImportJobStatus(jobId);
        if (job.totalRows > 0) {
          this.status = `Processing ${job.processedRows}/${job.totalRows} charts · ${job.importedCount} updated or created`;
        }
        if (job.status === 'completed') {
          this.status = `Done: ${job.importedCount} updated or created, ${job.skippedCount} skipped, ${job.errorCount} errors.`;
          break;
        }
        if (job.status === 'failed') {
          this.status = 'Import job failed.';
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (err) {
      this.status = err instanceof Error ? err.message : 'Bulk import failed';
    } finally {
      this.bulkBusy = false;
    }
  }

  async confirm() {
    if (!this.preview) return;
    this.busy = true;
    try {
      const result = await this.api.applyUnichart(this.preview.previewId);
      const filled = (result.filled ?? []).map((key) => this.label(key)).join(', ');
      this.status =
        result.status === 'already_applied'
          ? 'This chart was already applied.'
          : `Filled ${filled || 'nothing new'} for this patient.`;
      this.preview = null;
      this.file = null;
    } catch (err) {
      this.status = err instanceof Error ? err.message : 'Could not apply this chart';
    } finally {
      this.busy = false;
    }
  }

  async ask() {
    const message = this.note.trim();
    if (!message) return;
    this.busy = true;
    this.reply = '';
    const previewNote = this.preview
      ? ` Preview ${this.preview.previewId} status ${this.preview.status} for ${this.preview.patient?.displayName ?? 'no patient'}. Missing: ${this.preview.fills.join(', ') || 'none'}.`
      : '';
    try {
      this.reply = await this.api.streamCompanion(`${message}.${previewNote}`, 'ops-admin');
    } catch (err) {
      this.reply = err instanceof Error ? err.message : 'Ayah is unavailable right now.';
    } finally {
      this.busy = false;
    }
  }
}
