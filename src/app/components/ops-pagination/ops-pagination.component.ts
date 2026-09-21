import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  clampPageIndex,
  getPageRangeEnd,
  getPageRangeStart,
  getTotalPages,
} from '../../utils/pagination.utils';

@Component({
  selector: 'app-ops-pagination',
  standalone: false,
  templateUrl: './ops-pagination.component.html',
  styleUrl: './ops-pagination.component.css',
})
export class OpsPaginationComponent {
  @Input() total = 0;
  @Input() pageIndex = 1;
  @Input() pageSize = 25;
  @Input() pageSizeOptions: number[] = [10, 25, 50, 100];
  @Input() itemLabel = 'items';

  @Output() pageIndexChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get totalPages(): number {
    return getTotalPages(this.total, this.pageSize);
  }

  get rangeStart(): number {
    return getPageRangeStart(this.pageIndex, this.pageSize, this.total);
  }

  get rangeEnd(): number {
    return getPageRangeEnd(this.pageIndex, this.pageSize, this.total);
  }

  get canGoPrev(): boolean {
    return this.pageIndex > 1;
  }

  get canGoNext(): boolean {
    return this.pageIndex < this.totalPages;
  }

  goPrev(): void {
    if (!this.canGoPrev) return;
    this.emitPage(this.pageIndex - 1);
  }

  goNext(): void {
    if (!this.canGoNext) return;
    this.emitPage(this.pageIndex + 1);
  }

  goTo(page: number): void {
    this.emitPage(clampPageIndex(page, this.total, this.pageSize));
  }

  onPageSizeSelect(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(value) || value <= 0) return;
    this.pageSizeChange.emit(value);
    this.pageIndexChange.emit(1);
  }

  private emitPage(page: number): void {
    this.pageIndexChange.emit(page);
  }
}
