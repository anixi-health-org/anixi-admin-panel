import { Component, OnDestroy, OnInit } from '@angular/core';
import { DjangoApiService } from '../../services/django-api.service';
import { paginateItems } from '../../utils/pagination.utils';

export type AdminOrder = {
  id: string;
  pharmacyId?: string | null;
  pharmacyName?: string | null;
  pharmacyEmail?: string | null;
  status?: string | null;
  source?: string | null;
  prescriptionText?: string | null;
  lineItems?: Array<{
    name: string;
    description?: string;
    price?: string | null;
    quantity?: number;
  }>;
  notes?: string | null;
  deliveryRequested?: boolean;
  doctorName?: string | null;
  doctorEmail?: string | null;
  patientName?: string | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type SourceFilter = 'all' | 'marketplace' | 'prescription';
type StatusFilter = 'all' | 'open' | 'past';

const POLL_MS = 20_000;

@Component({
  selector: 'app-orders',
  standalone: false,
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent implements OnInit, OnDestroy {
  isLoading = true;
  error: string | null = null;
  rows: AdminOrder[] = [];
  sourceFilter: SourceFilter = 'all';
  statusFilter: StatusFilter = 'all';
  searchQuery = '';
  pageIndex = 1;
  pageSize = 20;
  selectedId: string | null = null;
  flash: string | null = null;

  private knownIds = new Set<string>();
  private seeded = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private djangoApi: DjangoApiService) {}

  ngOnInit(): void {
    void this.load({ quiet: false });
    this.pollTimer = setInterval(() => {
      void this.load({ quiet: true });
    }, POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.flashTimer) clearTimeout(this.flashTimer);
  }

  get filteredRows(): AdminOrder[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.rows.filter((row) => {
      const source = (row.source || 'prescription').toLowerCase();
      const status = (row.status || 'sent').toLowerCase();
      const isPast = status === 'dispensed' || status === 'cancelled';

      if (this.sourceFilter === 'marketplace' && source !== 'marketplace') return false;
      if (this.sourceFilter === 'prescription' && source === 'marketplace') return false;
      if (this.statusFilter === 'open' && isPast) return false;
      if (this.statusFilter === 'past' && !isPast) return false;

      if (!q) return true;
      const hay = [
        row.patientName,
        row.patientEmail,
        row.patientPhone,
        row.pharmacyName,
        row.pharmacyEmail,
        row.doctorName,
        row.doctorEmail,
        row.prescriptionText,
        row.notes,
        row.status,
        row.source,
        ...(row.lineItems || []).map((i) => i.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  get pagedRows(): AdminOrder[] {
    return paginateItems(this.filteredRows, this.pageIndex, this.pageSize);
  }

  get selected(): AdminOrder | null {
    if (!this.selectedId) return null;
    return this.rows.find((row) => row.id === this.selectedId) ?? null;
  }

  get openCount(): number {
    return this.rows.filter((row) => {
      const status = (row.status || '').toLowerCase();
      return status !== 'dispensed' && status !== 'cancelled';
    }).length;
  }

  get marketplaceCount(): number {
    return this.rows.filter((row) => (row.source || '') === 'marketplace').length;
  }

  get prescriptionCount(): number {
    return this.rows.filter((row) => (row.source || '') !== 'marketplace').length;
  }

  get pastCount(): number {
    return this.rows.filter((row) => {
      const status = (row.status || '').toLowerCase();
      return status === 'dispensed' || status === 'cancelled';
    }).length;
  }

  onSourceChange(value: SourceFilter): void {
    this.sourceFilter = value;
    this.pageIndex = 1;
  }

  onStatusChange(value: StatusFilter): void {
    this.statusFilter = value;
    this.pageIndex = 1;
  }

  onSearchChange(value: string): void {
    this.searchQuery = value;
    this.pageIndex = 1;
  }

  onPageIndexChange(page: number): void {
    this.pageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
  }

  selectOrder(id: string): void {
    this.selectedId = id;
  }

  clearSelection(): void {
    this.selectedId = null;
  }

  sourceLabel(source?: string | null): string {
    return (source || '').toLowerCase() === 'marketplace'
      ? 'Patient Market'
      : 'Clinician script';
  }

  statusLabel(status?: string | null): string {
    const value = (status || 'sent').toLowerCase();
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  statusTone(status?: string | null): string {
    switch ((status || 'sent').toLowerCase()) {
      case 'received':
      case 'preparing':
      case 'ready':
        return 'blue';
      case 'dispensed':
        return 'green';
      case 'cancelled':
        return 'slate';
      default:
        return 'pending';
    }
  }

  lineSummary(row: AdminOrder): string {
    if (row.lineItems?.length) {
      return row.lineItems
        .map((item) => `${item.quantity ?? 1}× ${item.name}`)
        .join(', ');
    }
    return (row.prescriptionText || '').trim() || '—';
  }

  async load(opts?: { quiet?: boolean }): Promise<void> {
    if (!opts?.quiet) {
      this.isLoading = true;
      this.error = null;
    }
    try {
      const { data } = await this.djangoApi.listMarketplaceOrders();
      const rows = Array.isArray(data) ? data : [];
      const ids = new Set(rows.map((row) => row.id));

      if (this.seeded) {
        const newcomers = rows.filter((row) => !this.knownIds.has(row.id));
        if (newcomers.length > 0) {
          const newest = newcomers[0];
          this.showFlash(
            newcomers.length === 1
              ? `New order: ${newest.patientName || 'Patient'} → ${newest.pharmacyName || 'partner'}`
              : `${newcomers.length} new orders placed`,
          );
        }
      } else {
        this.seeded = true;
      }

      this.knownIds = ids;
      this.rows = rows;
      if (this.selectedId && !ids.has(this.selectedId)) {
        this.selectedId = null;
      }
    } catch (err) {
      if (!opts?.quiet) {
        this.error = err instanceof Error ? err.message : 'Could not load orders';
        this.rows = [];
      }
    } finally {
      if (!opts?.quiet) this.isLoading = false;
    }
  }

  private showFlash(message: string): void {
    this.flash = message;
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flash = null;
      this.flashTimer = null;
    }, 8_000);
  }
}
