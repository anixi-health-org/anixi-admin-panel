import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

type Envelope<T> = {
  success: boolean;
  data: T;
  error?: unknown;
  metadata?: Record<string, unknown> | null;
};

@Injectable({ providedIn: 'root' })
export class DjangoApiService {
  private accessToken: string | null = null;

  get enabled(): boolean {
    return Boolean(environment.apiUrl);
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /** Append JWT so `<img>` tags can load protected Django media URLs. */
  resolveMediaUrl(url: string | null | undefined): string | null {
    const trimmed = url?.trim();
    if (!trimmed) return null;

    const marker = '/api/v1/documents/media/';
    let resolved = trimmed;

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      if (trimmed.includes(marker)) {
        resolved = `${environment.apiUrl}${trimmed.split('?', 1)[0]}`;
      } else {
        const encodedKey = trimmed
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        resolved = `${environment.apiUrl}${marker}${encodedKey}/`;
      }
    } else if (trimmed.includes(marker)) {
      resolved = trimmed.split('?', 1)[0];
    }

    if (!resolved.includes(marker) || !this.accessToken) {
      return resolved;
    }

    const separator = resolved.includes('?') ? '&' : '?';
    return `${resolved}${separator}access=${encodeURIComponent(this.accessToken)}`;
  }

  enrichDoctorMedia<T extends Record<string, unknown>>(doctor: T): T {
    const profileImageUrl = this.resolveMediaUrl(
      String(doctor['profileImageUrl'] ?? doctor['profile_image_url'] ?? ''),
    );
    const logoUrl = this.resolveMediaUrl(
      String(doctor['logoUrl'] ?? doctor['logo_url'] ?? ''),
    );
    return {
      ...doctor,
      ...(profileImageUrl ? { profileImageUrl } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    // Django APPEND_SLASH: missing slash → 301, and browsers drop Authorization on CORS redirects.
    const normalizedPath = path.includes('?')
      ? path.replace(/\?(.*)$/, '/?$1').replace(/\/\/\?/, '/?')
      : path.endsWith('/')
        ? path
        : `${path}/`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client': 'admin-panel',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let res: Response;
    try {
      res = await fetch(`${environment.apiUrl}${normalizedPath}`, {
        ...init,
        headers,
      });
    } catch {
      throw new Error(
        `Cannot reach the API at ${environment.apiUrl}. Is Django running on port 8000?`,
      );
    }
    const json = (await res.json()) as Envelope<T>;
    if (!res.ok || !json.success) {
      const message =
        typeof json.error === 'string'
          ? json.error
          : JSON.stringify(json.error ?? `Request failed (${res.status})`);
      throw new Error(message);
    }
    return json.data;
  }

  private async requestEnvelope<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ data: T; metadata: Record<string, unknown> | null }> {
    const normalizedPath = path.includes('?')
      ? path.replace(/\?(.*)$/, '/?$1').replace(/\/\/\?/, '/?')
      : path.endsWith('/')
        ? path
        : `${path}/`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client': 'admin-panel',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let res: Response;
    try {
      res = await fetch(`${environment.apiUrl}${normalizedPath}`, {
        ...init,
        headers,
      });
    } catch {
      throw new Error(
        `Cannot reach the API at ${environment.apiUrl}. Is Django running on port 8000?`,
      );
    }
    const json = (await res.json()) as Envelope<T>;
    if (!res.ok || !json.success) {
      const message =
        typeof json.error === 'string'
          ? json.error
          : JSON.stringify(json.error ?? `Request failed (${res.status})`);
      throw new Error(message);
    }
    return { data: json.data, metadata: json.metadata ?? null };
  }

  login(email: string, password: string) {
    return this.request<{ tokens: { access: string; refresh: string }; user: Record<string, unknown> }>(
      '/api/v1/auth/login/',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
  }

  getMe() {
    return this.request<Record<string, unknown>>('/api/v1/auth/me/');
  }

  listDoctors(status?: string, options?: { limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/doctors/${qs}`,
    );
  }

  listDoctorsPage(
    status?: string,
    options?: { limit?: number; offset?: number },
  ) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.requestEnvelope<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/doctors/${qs}`,
    );
  }

  getDoctor(doctorId: string) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/doctors/${encodeURIComponent(doctorId)}/`,
    );
  }

  updateDoctorStatus(doctorId: string, verificationStatus: string, rejectionReason?: string) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/doctors/${encodeURIComponent(doctorId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          verificationStatus,
          ...(rejectionReason ? { rejectionReason } : {}),
        }),
      },
    );
  }

  patchDoctor(doctorId: string, patch: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/doctors/${encodeURIComponent(doctorId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    );
  }

  listUsers(options?: {
    role?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (options?.role) params.set('role', options.role);
    if (options?.q) params.set('q', options.q);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/users/${qs}`,
    );
  }

  listUsersPage(options?: {
    role?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (options?.role) params.set('role', options.role);
    if (options?.q) params.set('q', options.q);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.offset != null) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.requestEnvelope<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/users/${qs}`,
    );
  }

  getAdminStats() {
    return this.request<{
      totalUsers: number;
      patients: number;
      doctors: number;
      clinicAdmins: number;
      caregivers: number;
      admins: number;
      staff?: number;
      pendingActivations: number;
      pendingDoctors: number;
      verifiedDoctors: number;
      pendingMarketplacePartners?: number;
    }>('/api/v1/auth/admin/stats/');
  }

  patchUser(userId: string, patch: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/users/${encodeURIComponent(userId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    );
  }

  listPractices() {
    return this.request<Array<Record<string, unknown>>>('/api/v1/auth/admin/practices/');
  }

  listPracticeMembers(practiceId: string) {
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/practices/${encodeURIComponent(practiceId)}/members/`,
    );
  }

  listWellnessProviders() {
    return this.request<Array<Record<string, unknown>>>(
      '/api/v1/community/wellness-providers/?includeUnpublished=true',
    );
  }

  createWellnessProvider(data: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('/api/v1/community/wellness-providers/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  patchWellnessProvider(providerId: string, data: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/api/v1/community/wellness-providers/${encodeURIComponent(providerId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  }

  deleteWellnessProvider(providerId: string) {
    return this.request<{ deleted: boolean }>(
      `/api/v1/community/wellness-providers/${encodeURIComponent(providerId)}/`,
      { method: 'DELETE' },
    );
  }

  listPharmacies() {
    return this.request<Array<Record<string, unknown>>>('/api/v1/auth/admin/pharmacies/');
  }

  listMarketplacePartnerApplications(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/marketplace/admin/partner-applications/${qs}`,
    );
  }

  approveMarketplacePartnerApplication(applicationId: string) {
    return this.request<Record<string, unknown>>(
      `/api/v1/marketplace/admin/partner-applications/${encodeURIComponent(applicationId)}/approve/`,
      { method: 'POST', body: '{}' },
    );
  }

  rejectMarketplacePartnerApplication(applicationId: string, reason?: string) {
    return this.request<Record<string, unknown>>(
      `/api/v1/marketplace/admin/partner-applications/${encodeURIComponent(applicationId)}/reject/`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: reason || '' }),
      },
    );
  }

  listMarketplaceOrders(options?: { status?: string; source?: string; q?: string }) {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.source) params.set('source', options.source);
    if (options?.q?.trim()) params.set('q', options.q.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.requestEnvelope<
      Array<{
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
      }>
    >(`/api/v1/marketplace/admin/orders/${qs}`);
  }

  createPharmacy(data: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('/api/v1/auth/admin/pharmacies/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  patchPharmacy(pharmacyId: string, data: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/pharmacies/${encodeURIComponent(pharmacyId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  }

  deletePharmacy(pharmacyId: string) {
    return this.request<{ deleted: boolean }>(
      `/api/v1/auth/admin/pharmacies/${encodeURIComponent(pharmacyId)}/`,
      { method: 'DELETE' },
    );
  }

  listImportJobs() {
    return this.request<Array<Record<string, unknown>>>('/api/v1/patients/roster/import-jobs/');
  }

  async uploadPatientCsv(file: File, practiceId: string): Promise<Record<string, unknown>> {
    const form = new FormData();
    form.append('file', file);
    form.append('practiceId', practiceId);

    const headers: Record<string, string> = { 'X-Client': 'admin-panel' };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${environment.apiUrl}/api/v1/patients/roster/import-csv/`, {
      method: 'POST',
      headers,
      body: form,
    });
    const json = (await res.json()) as Envelope<Record<string, unknown>>;
    if (!res.ok || !json.success || !json.data) {
      throw new Error(
        typeof json.error === 'string' ? json.error : 'CSV upload failed',
      );
    }
    return json.data;
  }

  downloadImportResults(jobId: string): void {
    const url = `${environment.apiUrl}/api/v1/patients/roster/import-jobs/${encodeURIComponent(jobId)}/results.csv`;
    const link = document.createElement('a');
    link.href = this.accessToken ? `${url}?access=${encodeURIComponent(this.accessToken)}` : url;
    link.download = `import-${jobId}-results.csv`;
    link.click();
  }

  listAdminPosts() {
    return this.request<Array<Record<string, unknown>>>(
      '/api/v1/community/posts/?includeDrafts=true&source=admin_cms',
    );
  }

  listPostsByBatch(contentBatchId: string) {
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/community/posts/?includeDrafts=true&contentBatchId=${encodeURIComponent(contentBatchId)}`,
    );
  }

  createPost(data: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('/api/v1/community/posts/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getPost(postId: string) {
    return this.request<Record<string, unknown>>(
      `/api/v1/community/posts/${encodeURIComponent(postId)}/`,
    );
  }

  patchPost(postId: string, data: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/api/v1/community/posts/${encodeURIComponent(postId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  }

  deletePost(postId: string) {
    return this.request<{ deleted: boolean }>(
      `/api/v1/community/posts/${encodeURIComponent(postId)}/`,
      { method: 'DELETE' },
    );
  }

  listAdminTeam() {
    return this.request<Array<Record<string, unknown>>>('/api/v1/auth/admin/team/');
  }

  inviteAdminTeamMember(payload: {
    email: string;
    displayName?: string;
    opsRole: string;
  }) {
    return this.request<Record<string, unknown>>('/api/v1/auth/admin/team/invite/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  patchAdminTeamMember(userId: string, patch: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/team/${encodeURIComponent(userId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    );
  }

  listPendingActivations(params?: { practiceId?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.practiceId) qs.set('practiceId', params.practiceId);
    if (params?.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/pending-activations/${suffix}`,
    );
  }

  patchPendingActivation(
    linkId: string,
    patch: {
      displayName?: string;
      contactEmail?: string;
      phoneNumber?: string;
      notes?: string;
      dateOfBirth?: string;
      mrn?: string;
    },
  ) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/pending-activations/${encodeURIComponent(linkId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    );
  }

  remindPendingActivations(payload: {
    patientIds?: string[];
    all?: boolean;
    practiceId?: string;
    templateId?: string;
  }) {
    return this.request<{ sent: number; skipped: number; failed: number; templateId?: string }>(
      '/api/v1/auth/admin/pending-activations/remind/',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  listCrmEmailTemplates(category = 'pending_activation') {
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/email-templates/?category=${encodeURIComponent(category)}`,
    );
  }

  createCrmEmailTemplate(payload: {
    name: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    isDefault?: boolean;
    category?: string;
  }) {
    return this.request<Record<string, unknown>>('/api/v1/auth/admin/email-templates/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  patchCrmEmailTemplate(templateId: string, patch: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/api/v1/auth/admin/email-templates/${encodeURIComponent(templateId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    );
  }

  deleteCrmEmailTemplate(templateId: string) {
    return this.request<{ deleted: boolean }>(
      `/api/v1/auth/admin/email-templates/${encodeURIComponent(templateId)}/`,
      { method: 'DELETE' },
    );
  }

  listAuditEvents(limit = 100) {
    return this.request<Array<Record<string, unknown>>>(
      `/api/v1/auth/admin/audit-events/?limit=${limit}`,
    );
  }

  listEmployers() {
    return this.request<Array<Record<string, unknown>>>(
      '/api/v1/auth/admin/employers/',
    );
  }

  async uploadDocument(file: File, purpose: string): Promise<{ url: string; storageKey: string }> {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', purpose);
    form.append('title', file.name);

    const headers: Record<string, string> = { 'X-Client': 'admin-panel' };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${environment.apiUrl}/api/v1/documents/upload/`, {
      method: 'POST',
      headers,
      body: form,
    });
    const json = (await res.json()) as Envelope<{
      url: string;
      storageKey: string;
    }>;
    if (!res.ok || !json.success || !json.data) {
      throw new Error(
        typeof json.error === 'string' ? json.error : 'Document upload failed',
      );
    }
    return json.data;
  }
}
