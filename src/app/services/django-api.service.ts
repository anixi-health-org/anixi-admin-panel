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
  private refreshToken: string | null = null;
  private refreshInflight: Promise<string | null> | null = null;
  private unauthorizedHandler: (() => void) | null = null;
  private tokensRefreshedHandler: ((access: string, refresh: string) => void) | null = null;

  get enabled(): boolean {
    return Boolean(environment.apiUrl);
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  setSession(access: string | null, refresh: string | null): void {
    this.accessToken = access;
    this.refreshToken = refresh;
  }

  /** Called when refresh fails so the shell can leave the idle page immediately. */
  setUnauthorizedHandler(handler: () => void): void {
    this.unauthorizedHandler = handler;
  }

  setTokensRefreshedHandler(handler: (access: string, refresh: string) => void): void {
    this.tokensRefreshedHandler = handler;
  }

  async refreshAccessToken(): Promise<string | null> {
    if (!this.refreshToken) return null;
    if (!this.refreshInflight) {
      this.refreshInflight = this.postRefresh().finally(() => {
        this.refreshInflight = null;
      });
    }
    return this.refreshInflight;
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
      // Always serve media through the configured API host (local vs prod).
      const path = trimmed.split(marker, 2)[1]?.split('?', 1)[0] ?? '';
      resolved = `${environment.apiUrl}${marker}${path}`;
    }

    // Community feed media is publicly readable — avoid stale JWT query params.
    if (resolved.includes(`${marker}community-posts/`)) {
      return resolved.split('?', 1)[0] ?? resolved;
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

  private isExpiringSoon(token: string, skewSeconds = 60): boolean {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return true;
      const payload = JSON.parse(
        atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
      ) as { exp?: number };
      if (!payload.exp) return false;
      return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
    } catch {
      return true;
    }
  }

  private async postRefresh(): Promise<string | null> {
    if (!this.refreshToken) return null;
    try {
      const res = await fetch(`${environment.apiUrl}/api/v1/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client': 'admin-panel',
        },
        body: JSON.stringify({ refresh: this.refreshToken }),
      });
      const json = (await res.json()) as Envelope<{ access?: string; refresh?: string }>;
      const access = json.data?.access;
      if (!res.ok || !json.success || !access) return null;
      const refresh = json.data.refresh || this.refreshToken;
      this.accessToken = access;
      this.refreshToken = refresh;
      this.tokensRefreshedHandler?.(access, refresh);
      return access;
    } catch {
      return null;
    }
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && !this.isExpiringSoon(this.accessToken)) return;
    await this.refreshAccessToken();
  }

  private failSession(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.unauthorizedHandler?.();
  }

  private async authorizedFetch(path: string, init: RequestInit, headers: Record<string, string>): Promise<Response> {
    await this.ensureAccessToken();
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    const res = await fetch(`${environment.apiUrl}${path}`, { ...init, headers });
    if (res.status !== 401 || path.includes('/auth/login') || path.includes('/auth/refresh')) {
      return res;
    }
    const refreshed = await this.refreshAccessToken();
    if (!refreshed) {
      this.failSession();
      return res;
    }
    headers['Authorization'] = `Bearer ${refreshed}`;
    return fetch(`${environment.apiUrl}${path}`, { ...init, headers });
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

    let res: Response;
    try {
      res = await this.authorizedFetch(normalizedPath, init, headers);
    } catch {
      throw new Error(
        `Cannot reach the API at ${environment.apiUrl}. Is Django running on port 8000?`,
      );
    }
    const json = (await res.json()) as Envelope<T>;
    if (res.status === 401 && !normalizedPath.includes('/auth/login')) {
      this.failSession();
      throw new Error('Your session expired. Sign in again.');
    }
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

    let res: Response;
    try {
      res = await this.authorizedFetch(normalizedPath, init, headers);
    } catch {
      throw new Error(
        `Cannot reach the API at ${environment.apiUrl}. Is Django running on port 8000?`,
      );
    }
    const json = (await res.json()) as Envelope<T>;
    if (res.status === 401) {
      this.failSession();
      throw new Error('Your session expired. Sign in again.');
    }
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
      marketplacePartners?: number;
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

  listAdminMedicalSchemes() {
    return this.request<
      Array<{
        id: string;
        slug: string;
        name: string;
        isActive: boolean;
        sortOrder: number;
      }>
    >('/api/v1/auth/admin/medical-schemes/');
  }

  patchAdminMedicalScheme(
    id: string,
    body: { isActive?: boolean; sortOrder?: number },
  ) {
    return this.request<{
      id: string;
      slug: string;
      name: string;
      isActive: boolean;
      sortOrder: number;
    }>('/api/v1/auth/admin/medical-schemes/', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...body }),
    });
  }

  listAdminMedicalSchemePlans(schemeSlug?: string) {
    const qs = schemeSlug
      ? `?schemeSlug=${encodeURIComponent(schemeSlug)}`
      : '';
    return this.request<
      Array<{
        id: string;
        slug: string;
        name: string;
        schemeSlug: string;
        schemeName: string;
        isActive: boolean;
        sortOrder: number;
      }>
    >(`/api/v1/auth/admin/medical-scheme-plans/${qs}`);
  }

  patchAdminMedicalSchemePlan(
    id: string,
    body: { isActive?: boolean; sortOrder?: number },
  ) {
    return this.request<{
      id: string;
      slug: string;
      name: string;
      schemeSlug: string;
      schemeName: string;
      isActive: boolean;
      sortOrder: number;
    }>('/api/v1/auth/admin/medical-scheme-plans/', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...body }),
    });
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

  async previewUnichart(file: File): Promise<{
    previewId: string;
    status: string;
    patient: { id: string; displayName: string } | null;
    fills: string[];
    chart: { patientName: string; dateOfBirth: string; idNumber: string; chartId: string };
  }> {
    const form = new FormData();
    form.append('file', file, file.name);
    const headers: Record<string, string> = { 'X-Client': 'admin-panel' };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    const res = await fetch(`${environment.apiUrl}/api/v1/patients/unichart/preview/`, {
      method: 'POST',
      headers,
      body: form,
    });
    const json = (await res.json()) as Envelope<{
      previewId: string;
      status: string;
      patient: { id: string; displayName: string } | null;
      fills: string[];
      chart: { patientName: string; dateOfBirth: string; idNumber: string; chartId: string };
    }>;
    if (!res.ok || !json.success || !json.data) {
      throw new Error(typeof json.error === 'string' ? json.error : 'Chart preview failed');
    }
    return json.data;
  }

  applyUnichart(previewId: string) {
    return this.request<{ status: string; patientId?: string; filled?: string[] }>(
      '/api/v1/patients/unichart/apply/',
      { method: 'POST', body: JSON.stringify({ previewId }) },
    );
  }

  async startUnichartPdfImport(file: File, practiceId: string): Promise<{ jobId: string }> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('practiceId', practiceId);
    form.append('async', 'true');
    const headers: Record<string, string> = { 'X-Client': 'admin-panel' };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    const res = await fetch(`${environment.apiUrl}/api/v1/patients/unichart/batch-apply/`, {
      method: 'POST',
      headers,
      body: form,
    });
    const json = (await res.json()) as Envelope<{ jobId: string }>;
    if (!res.ok || !json.success || !json.data?.jobId) {
      throw new Error(typeof json.error === 'string' ? json.error : 'UniCharts import failed');
    }
    return { jobId: json.data.jobId };
  }

  getImportJobStatus(jobId: string) {
    return this.request<{
      jobId: string;
      jobKind?: string;
      status: string;
      totalRows: number;
      processedRows: number;
      importedCount: number;
      skippedCount: number;
      errorCount: number;
    }>(`/api/v1/patients/roster/import-jobs/${encodeURIComponent(jobId)}/`);
  }

  async streamCompanion(message: string, agentId: string): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client': 'admin-panel',
    };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    const res = await fetch(`${environment.apiUrl}/api/v1/companion/stream/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, agentId }),
    });
    if (!res.ok || !res.body) {
      throw new Error('Ayah is unavailable right now.');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const event = JSON.parse(payload) as { type?: string; delta?: string; text?: string };
          text += event.delta || event.text || '';
        } catch {
          text += payload;
        }
      }
    }
    return text;
  }
}
