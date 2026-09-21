import { Component, Input } from '@angular/core';

export type OpsPageSkeletonVariant = 'table' | 'metrics' | 'list' | 'split' | 'cards' | 'timeline';

@Component({
  selector: 'app-ops-page-skeleton',
  standalone: false,
  templateUrl: './ops-page-skeleton.component.html',
  styleUrl: './ops-page-skeleton.component.css',
})
export class OpsPageSkeletonComponent {
  @Input() variant: OpsPageSkeletonVariant = 'table';
  @Input() rows = 8;
  @Input() metrics = 5;

  rowItems(): number[] {
    return Array.from({ length: Math.max(1, this.rows) }, (_, index) => index);
  }

  metricItems(): number[] {
    return Array.from({ length: Math.max(1, this.metrics) }, (_, index) => index);
  }
}
