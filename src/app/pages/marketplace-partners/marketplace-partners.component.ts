import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FirestoreService } from '../../services/firestore.service';
import { paginateItems } from '../../utils/pagination.utils';

type PartnerTab = 'wellness' | 'pharmacies';

@Component({
  selector: 'app-marketplace-partners',
  standalone: false,
  templateUrl: './marketplace-partners.component.html',
  styleUrl: './marketplace-partners.component.css',
})
export class MarketplacePartnersComponent implements OnInit, OnDestroy {
  tab: PartnerTab = 'wellness';
  isSaving = false;
  isLoading = true;
  message = '';
  error = '';
  pageSize = 10;
  wellnessPageIndex = 1;
  pharmacyPageIndex = 1;

  wellnessRows: Array<Record<string, unknown> & { id: string }> = [];
  pharmacyRows: Array<Record<string, unknown> & { id: string }> = [];
  editingId: string | null = null;

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
    private firestore: FirestoreService
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

  onWellnessPageIndexChange(page: number): void {
    this.wellnessPageIndex = page;
  }

  onPharmacyPageIndexChange(page: number): void {
    this.pharmacyPageIndex = page;
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.wellnessPageIndex = 1;
    this.pharmacyPageIndex = 1;
  }

  ngOnInit(): void {
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

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setTab(tab: PartnerTab): void {
    this.tab = tab;
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = null;
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
    this.message = '';
    this.error = '';
  }

  editWellness(row: Record<string, unknown> & { id: string }): void {
    this.editingId = row.id;
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
      this.message = this.editingId ? 'Wellness partner updated.' : 'Wellness partner created.';
      this.clearForm();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Save failed';
    } finally {
      this.isSaving = false;
    }
  }

  async savePharmacy(): Promise<void> {
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
      this.message = this.editingId ? 'Pharmacy updated.' : 'Pharmacy created.';
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
