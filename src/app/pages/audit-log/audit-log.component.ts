import { Component, OnInit } from '@angular/core';
import { DjangoApiService } from '../../services/django-api.service';

type AuditRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorName?: string;
  createdAt?: string;
};

@Component({
  selector: 'app-audit-log',
  standalone: false,
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.css',
})
export class AuditLogComponent implements OnInit {
  isLoading = true;
  error: string | null = null;
  rows: AuditRow[] = [];

  constructor(private djangoApi: DjangoApiService) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const data = await this.djangoApi.listAuditEvents(200);
      this.rows = data.map((row) => ({
        id: String(row['id'] ?? ''),
        action: String(row['action'] ?? ''),
        resourceType: String(row['resourceType'] ?? ''),
        resourceId: String(row['resourceId'] ?? ''),
        actorName: row['actorName'] ? String(row['actorName']) : undefined,
        createdAt: row['createdAt'] ? String(row['createdAt']) : undefined,
      }));
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Could not load audit log';
      this.rows = [];
    } finally {
      this.isLoading = false;
    }
  }
}
