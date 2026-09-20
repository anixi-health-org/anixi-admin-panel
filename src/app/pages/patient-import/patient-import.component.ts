import { Component, OnDestroy, OnInit } from '@angular/core';
import { DjangoApiService } from '../../services/django-api.service';

type Practice = {
  id: string;
  name: string;
  clinicCode?: string;
};

type ImportJob = {
  jobId: string;
  practiceId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileName: string;
  totalRows: number;
  processedRows: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
  completedAt: string | null;
  createdBy: string;
};

@Component({
  selector: 'app-patient-import',
  standalone: false,
  templateUrl: './patient-import.component.html',
  styleUrl: './patient-import.component.css',
})
export class PatientImportComponent implements OnInit, OnDestroy {
  practices: Practice[] = [];
  selectedPracticeId = '';
  jobs: ImportJob[] = [];
  isUploading = false;
  isLoading = true;
  uploadError = '';
  uploadSuccess = '';
  selectedFile: File | null = null;
  selectedClinicCode = '';
  isDragOver = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private api: DjangoApiService) {}

  ngOnInit(): void {
    void this.loadPractices();
    void this.loadJobs();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async loadPractices(): Promise<void> {
    try {
      const raw = await this.api.listPractices();
      this.practices = raw.map((p: Record<string, unknown>) => ({
        id: String(p['id']),
        name: String(p['name'] || p['practiceName'] || 'Unnamed'),
        clinicCode: String(p['clinicCode'] || ''),
      }));
    } catch {
      this.practices = [];
    }
  }

  async loadJobs(): Promise<void> {
    try {
      const raw = await this.api.listImportJobs();
      this.jobs = raw as unknown as ImportJob[];
    } catch {
      this.jobs = [];
    } finally {
      this.isLoading = false;
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setSelectedFile(input.files?.[0] ?? null);
  }

  onPracticeChange(): void {
    this.selectedClinicCode =
      this.practices.find((practice) => practice.id === this.selectedPracticeId)?.clinicCode ?? '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.setSelectedFile(file);
  }

  private setSelectedFile(file: File | null): void {
    if (file && !file.name.toLowerCase().endsWith('.csv')) {
      this.uploadError = 'Please choose a CSV file.';
      this.selectedFile = null;
      return;
    }
    this.selectedFile = file;
    this.uploadError = '';
    this.uploadSuccess = '';
  }

  async upload(): Promise<void> {
    if (!this.selectedFile || !this.selectedPracticeId) return;

    this.isUploading = true;
    this.uploadError = '';
    this.uploadSuccess = '';

    try {
      const result = await this.api.uploadPatientCsv(this.selectedFile, this.selectedPracticeId);
      this.uploadSuccess = `Import job started: ${result['totalRows']} rows queued. Job ID: ${result['jobId']}`;
      this.selectedClinicCode = this.practices.find((p) => p.id === this.selectedPracticeId)?.clinicCode ?? '';
      this.selectedFile = null;
      void this.loadJobs();
      this.startPolling(String(result['jobId']));
    } catch (err) {
      this.uploadError = err instanceof Error ? err.message : 'Upload failed';
    } finally {
      this.isUploading = false;
    }
  }

  private startPolling(jobId: string): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      await this.loadJobs();
      const job = this.jobs.find((j) => j.jobId === jobId);
      if (job && (job.status === 'completed' || job.status === 'failed')) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }, 3000);
  }

  progressPercent(job: ImportJob): number {
    if (job.totalRows === 0) return 0;
    return Math.round((job.processedRows / job.totalRows) * 100);
  }

  downloadResults(jobId: string): void {
    this.api.downloadImportResults(jobId);
  }

  practiceName(practiceId: string): string {
    return this.practices.find((p) => p.id === practiceId)?.name ?? practiceId;
  }

  practiceClinicCode(practiceId: string): string {
    return this.practices.find((p) => p.id === practiceId)?.clinicCode ?? '—';
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'completed':
        return 'ops-badge--green';
      case 'processing':
        return 'ops-badge--blue';
      case 'failed':
        return 'ops-badge--red';
      default:
        return 'ops-badge--slate';
    }
  }
}
