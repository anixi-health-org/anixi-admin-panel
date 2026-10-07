import { Component, OnInit } from '@angular/core';
import { DjangoApiService } from '../../services/django-api.service';

type SchemeRow = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  schemeSlug: string;
  schemeName: string;
  isActive: boolean;
  sortOrder: number;
};

@Component({
  selector: 'app-medical-schemes',
  standalone: false,
  templateUrl: './medical-schemes.component.html',
  styleUrl: './medical-schemes.component.css',
})
export class MedicalSchemesComponent implements OnInit {
  schemes: SchemeRow[] = [];
  plans: PlanRow[] = [];
  loading = true;
  error = '';

  constructor(private djangoApi: DjangoApiService) {}

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    if (!this.djangoApi.enabled) {
      this.error = 'Django API is not configured.';
      this.loading = false;
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      this.schemes = await this.djangoApi.listAdminMedicalSchemes();
      this.plans = await this.djangoApi.listAdminMedicalSchemePlans();
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Failed to load catalog.';
    } finally {
      this.loading = false;
    }
  }

  async toggleScheme(row: SchemeRow): Promise<void> {
    const updated = await this.djangoApi.patchAdminMedicalScheme(row.id, {
      isActive: !row.isActive,
    });
    this.schemes = this.schemes.map((item) =>
      item.id === row.id ? { ...item, isActive: updated.isActive } : item,
    );
  }

  async togglePlan(row: PlanRow): Promise<void> {
    const updated = await this.djangoApi.patchAdminMedicalSchemePlan(row.id, {
      isActive: !row.isActive,
    });
    this.plans = this.plans.map((item) =>
      item.id === row.id ? { ...item, isActive: updated.isActive } : item,
    );
  }
}
