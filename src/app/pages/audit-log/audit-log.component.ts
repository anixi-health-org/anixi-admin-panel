import { Component, OnInit } from '@angular/core';
import { DjangoApiService } from '../../services/django-api.service';
import { paginateItems } from '../../utils/pagination.utils';
import {
  AuditCategory,
  HumanizedAuditEvent,
  filterAuditEvents,
  humanizeAuditEvent,
} from '../../utils/audit-log.utils';

type CategoryFilter = { label: string; value: AuditCategory };

const CATEGORY_FILTERS: CategoryFilter[] = [
  { label: 'All events', value: 'all' },
  { label: 'PHI access', value: 'phi' },
  { label: 'Admin actions', value: 'admin' },
  { label: 'Authentication', value: 'auth' },
];

@Component({
  selector: 'app-audit-log',
  standalone: false,
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.css',
})
export class AuditLogComponent implements OnInit {
  isLoading = true;
  error: string | null = null;
  rows: HumanizedAuditEvent[] = [];
  categoryFilters = CATEGORY_FILTERS;
  activeCategory: AuditCategory = 'all';
  searchQuery = '';
  pageIndex = 1;
  pageSize = 25;

  constructor(private djangoApi: DjangoApiService) {}

  ngOnInit(): void {
    void this.load();
  }

  get filteredRows(): HumanizedAuditEvent[] {
    return filterAuditEvents(this.rows, this.activeCategory, this.searchQuery);
  }

  get pagedRows(): HumanizedAuditEvent[] {
    return paginateItems(this.filteredRows, this.pageIndex, this.pageSize);
  }

  get phiCount(): number {
    return this.rows.filter((row) => row.category === 'phi').length;
  }

  get adminCount(): number {
    return this.rows.filter((row) => row.category === 'admin').length;
  }

  onCategoryChange(category: AuditCategory): void {
    this.activeCategory = category;
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

  async load(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const data = await this.djangoApi.listAuditEvents(200);
      this.rows = data.map((row) => humanizeAuditEvent(row));
      this.pageIndex = 1;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Could not load audit log';
      this.rows = [];
    } finally {
      this.isLoading = false;
    }
  }
}
