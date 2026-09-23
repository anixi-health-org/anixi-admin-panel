import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';
import { paginateItems } from '../../utils/pagination.utils';

type PartnerTab = 'applications' | 'wellness' | 'pharmacies';

@Component({
  selector: 'app-marketplace-partners',
  standalone: false,
  templateUrl: './marketplace-partners.component.html',
  styleUrl: './marketplace-partners.component.css',
})
export class MarketplacePartnersComponent implements OnInit, OnDestroy {
  tab: PartnerTab = 'applications';
  isSaving = false;
  isLoading = true;
  message = '';
  error = '';
  pageSize = 10;
  wellnessPageIndex = 1;
  pharmacyPageIndex = 1;
  applicationPageIndex = 1;

  wellnessRows: Array<Record<string, unknown> & { id: string }> = [];
  pharmacyRows: Array<Record<string, unknown> & { id: string }> = [];
  applicationRows: Array<Record<string, unknown> & { id: string }> = [];
  selectedApplicationId: string | null = null;
  editingId: string | null = null;
  editModalKind: 'wellness' | 'pharmacy' | null = null;
  detailModalVisible = false;

  wellnessCategories = [
    'nutrition',
    'fitness',
    'mental_health',
    'meal_plan',
    'home_care',
    'other',
  ];

  wellnessForm!: FormGroup;
  pharmacyForm!: FormGroup;

  private sub = new Subscription();

  constructor(
    private fb: FormBuilder,
    private firestore: FirestoreService,
    private route: ActivatedRoute
  ) {
    this.wellnessForm = this.fb.group({
      name: ['', Validators.required],
      category: ['nutrition', Validators.required],
      tagline: [''],
      description: [''],
      email: [''],
      phone: [''],
      city: [''],
      province: [''],
      services: [''],
      published: [false],
      verified: [false],
    });

    this.pharmacyForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      address: [''],
      city: [''],
      province: [''],
      deliveryAvailable: [false],
      published: [false],
      verified: [false],
    });
  }

  get pagedWellnessRows(): Array<Record<string, unknown> & { id: string }> {
    return paginateItems(this.wellnessRows, this.wellnessPageIndex, this.pageSize);
  }

  get pagedPharmacyRows(): Array<Record<string, unknown> & { id: string }> {
    return paginateItems(this.pharmacyRows, this.pharmacyPageIndex, this.pageSize);
  }

  get pagedApplicationRows(): Array<Record<string, unknown> & { id: string }> {
    return paginateItems(this.applicationRows, this.applicationPageIndex, this.pageSize);
  }

  get pendingApplicationCount(): number {
    return this.applicationRows.filter((row) => row['status'] === 'pending').length;
  }

  get selectedApplication(): (Record<string, unknown> & { id: string }) | null {
    if (!this.selectedApplicationId) return null;
    return this.applicationRows.find((row) => row.id === this.selectedApplicationId) ?? null;
  }

  selectApplication(row: Record<string, unknown> & { id: string }): void {
    this.selectedApplicationId = row.id;
    this.detailModalVisible = true;
  }

  clearSelectedApplication(): void {
    this.detailModalVisible = false;
    this.selectedApplicationId = null;
  }

  onDetailModalVisibleChange(visible: boolean): void {
    this.detailModalVisible = visible;
    if (!visible) {
      this.selectedApplicationId = null;
    }
  }

  textField(row: Record<string, unknown> | null, key: string, fallback = '—'): string {
    if (!row) return fallback;
    const value = row[key];
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  offeringList(
    row: Record<string, unknown> | null,
  ): Array<{ name: string; description: string; price: string }> {
    if (!row) return [];
    const offerings = row['offerings'];
    if (!Array.isArray(offerings)) return [];
    return offerings
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim();
          return name ? { name, description: '', price: '' } : null;
        }
        if (!item || typeof item !== 'object') return null;
        const obj = item as { name?: string; description?: string; price?: string | null };
        const name = String(obj.name ?? '').trim();
        if (!name) return null;
        return {
          name,
          description: String(obj.description ?? '').trim(),
          price: String(obj.price ?? '').trim(),
        };
      })
      .filter((item): item is { name: string; description: string; price: string } => Boolean(item));
  }

  formatDate(value: unknown): string {
    if (!value) return '—';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-ZA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Johannesburg',
    });
  }

  onWellnessPageIndexChange(page: number): void {
    this.wellnessPageIndex = page;
  }

  onPharmacyPageIndexChange(page: number): void {
    this.pharmacyPageIndex = page;
  }

  onApplicationPageIndexChange(page: number): void {
    this.applicationPageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.wellnessPageIndex = 1;
    this.pharmacyPageIndex = 1;
    this.applicationPageIndex = 1;
  }

  ngOnInit(): void {
    this.sub.add(
      this.route.queryParamMap.subscribe((params) => {
        const tab = params.get('tab');
        if (tab === 'applications' || tab === 'wellness' || tab === 'pharmacies') {
          this.tab = tab;
        }
      })
    );
    this.reloadApplications();
    this.sub.add(
      this.firestore.getWellnessProviders().subscribe((rows) => {
        this.wellnessRows = rows.sort((a, b) =>
          String(a['name'] ?? '').localeCompare(String(b['name'] ?? ''))
        );
        this.isLoading = false;
      })
    );
    this.sub.add(
      this.firestore.getPharmacies().subscribe((rows) => {
        this.pharmacyRows = rows.sort((a, b) =>
          String(a['name'] ?? '').localeCompare(String(b['name'] ?? ''))
        );
        this.isLoading = false;
      })
    );
  }

  reloadApplications(): void {
    this.sub.add(
      this.firestore.getMarketplacePartnerApplications().subscribe({
        next: (rows) => {
          this.applicationRows = rows;
          this.isLoading = false;
          if (
            this.selectedApplicationId &&
            !rows.some((row) => row.id === this.selectedApplicationId)
          ) {
            this.selectedApplicationId = null;
          }
        },
        error: () => {
          this.isLoading = false;
        },
      })
    );
  }

  async approveApplication(id: string): Promise<void> {
    this.isSaving = true;
    this.error = '';
    try {
      await this.firestore.approveMarketplacePartnerApplication(id);
      this.message = 'Application approved — listing is now live on the patient Market.';
      this.clearSelectedApplication();
      this.reloadApplications();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Approve failed';
    } finally {
      this.isSaving = false;
    }
  }

  async rejectApplication(id: string): Promise<void> {
    const reason = window.prompt('Reason for rejection (optional):') ?? '';
    this.isSaving = true;
    this.error = '';
    try {
      await this.firestore.rejectMarketplacePartnerApplication(id, reason.trim());
      this.message = 'Application rejected.';
      this.clearSelectedApplication();
      this.reloadApplications();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Reject failed';
    } finally {
      this.isSaving = false;
    }
  }

  offeringNames(row: Record<string, unknown>): string {
    const offerings = row['offerings'];
    if (!Array.isArray(offerings)) return '—';
    const names = offerings
      .map((item) =>
        typeof item === 'string'
          ? item
          : item && typeof item === 'object'
            ? String((item as { name?: string }).name ?? '')
            : '',
      )
      .map((s) => s.trim())
      .filter(Boolean);
    return names.length ? names.join(', ') : '—';
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setTab(tab: PartnerTab): void {
    this.tab = tab;
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = null;
    this.editModalKind = null;
    this.wellnessForm.reset({
      category: 'nutrition',
      published: false,
      verified: false,
    });
    this.pharmacyForm.reset({
      deliveryAvailable: false,
      published: false,
      verified: false,
    });
  }

  editWellness(row: Record<string, unknown> & { id: string }): void {
    this.editingId = row.id;
    this.editModalKind = 'wellness';
    this.wellnessForm.patchValue({
      name: String(row['name'] ?? ''),
      category: String(row['category'] ?? 'other'),
      tagline: String(row['tagline'] ?? ''),
      description: String(row['description'] ?? ''),
      email: String(row['email'] ?? ''),
      phone: String(row['phone'] ?? ''),
      city: String(row['city'] ?? ''),
      province: String(row['province'] ?? ''),
      services: Array.isArray(row['services']) ? (row['services'] as string[]).join(', ') : '',
      published: row['published'] === true,
      verified: row['verified'] === true,
    });
  }

  editPharmacy(row: Record<string, unknown> & { id: string }): void {
    this.editingId = row.id;
    this.editModalKind = 'pharmacy';
    this.pharmacyForm.patchValue({
      name: String(row['name'] ?? ''),
      email: String(row['email'] ?? ''),
      phone: String(row['phone'] ?? ''),
      address: String(row['address'] ?? ''),
      city: String(row['city'] ?? ''),
      province: String(row['province'] ?? ''),
      deliveryAvailable: row['deliveryAvailable'] === true,
      published: row['published'] === true,
      verified: row['verified'] === true,
    });
  }

  async saveWellness(): Promise<void> {
    if (!this.editingId) {
      this.error = 'New partners must sign up via Market Partner applications.';
      return;
    }
    if (this.wellnessForm.invalid) return;
    this.isSaving = true;
    this.error = '';
    try {
      const raw = this.wellnessForm.getRawValue();
      const services = String(raw.services ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await this.firestore.upsertWellnessProvider(this.editingId, {
        name: raw.name?.trim(),
        category: raw.category,
        tagline: raw.tagline?.trim() || null,
        description: raw.description?.trim() || null,
        email: raw.email?.trim() || null,
        phone: raw.phone?.trim() || null,
        city: raw.city?.trim() || null,
        province: raw.province?.trim() || null,
        services,
        published: raw.published === true,
        verified: raw.verified === true,
      });
      this.message = 'Wellness partner updated.';
      this.clearForm();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Save failed';
    } finally {
      this.isSaving = false;
    }
  }

  async savePharmacy(): Promise<void> {
    if (!this.editingId) {
      this.error = 'New partners must sign up via Market Partner applications.';
      return;
    }
    if (this.pharmacyForm.invalid) return;
    this.isSaving = true;
    this.error = '';
    try {
      const raw = this.pharmacyForm.getRawValue();
      await this.firestore.upsertPharmacy(this.editingId, {
        name: raw.name?.trim(),
        email: raw.email?.trim().toLowerCase(),
        phone: raw.phone?.trim() || null,
        address: raw.address?.trim() || null,
        city: raw.city?.trim() || null,
        province: raw.province?.trim() || null,
        deliveryAvailable: raw.deliveryAvailable === true,
        published: raw.published === true,
        verified: raw.verified === true,
      });
      this.message = 'Pharmacy updated.';
      this.clearForm();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Save failed';
    } finally {
      this.isSaving = false;
    }
  }

  async unpublishWellness(id: string): Promise<void> {
    await this.firestore.deleteWellnessProvider(id);
    this.message = 'Wellness partner unpublished.';
  }

  async unpublishPharmacy(id: string): Promise<void> {
    await this.firestore.deletePharmacy(id);
    this.message = 'Pharmacy unpublished.';
  }
}
