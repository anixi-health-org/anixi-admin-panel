import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NzModalService } from 'ng-zorro-antd/modal';
import { DjangoApiService } from '../../services/django-api.service';
import { AuthService } from '../../services/auth.service';
import { formatCityEmailSubline } from '../../utils/ops-subline.utils';
import { paginateItems } from '../../utils/pagination.utils';
import {
  SponsorApplication,
  SponsorApprovalInput,
  SponsorOrganization,
  SponsorOrganizationDetail,
  SponsorOrganizationStatus,
  SponsorOrganizationUpdate,
  SponsorProgramme,
  SponsorProgrammeRow,
} from '../../models/sponsor';

type SponsorTab = 'applications' | 'organisations' | 'programmes';
type ProgrammeAction = 'activate' | 'return' | 'close';

type OrgForm = {
  status: SponsorOrganizationStatus;
  minCohortSize: number | null;
  dpaSignedAt: string;
  dpaVersion: string;
  contractStart: string;
  contractEnd: string;
  billingEmail: string;
};

const EMPTY = 'Not provided';

const COUNTRY_LABELS: Record<string, string> = {
  ZA: 'South Africa',
};

const KIND_LABELS: Record<string, string> = {
  insurer: 'Insurance partner',
  employer: 'Corporate partner',
};

const PROGRAMME_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_activation: 'Waiting for Anixi',
  active: 'Active',
  closed: 'Closed',
};

const PROGRAMME_KIND_LABELS: Record<string, string> = {
  chronic_care: 'Chronic care',
  wellness: 'Wellness',
  mental_wellbeing: 'Mental wellbeing',
  screening: 'Screening',
};

const ENROLMENT_MODE_LABELS: Record<string, string> = {
  code: 'Join code',
  eligibility: 'Eligibility list',
  both: 'Join code and eligibility list',
};

const CONDITION_LABELS: Record<string, string> = {
  diabetes: 'Diabetes',
  hypertension: 'High blood pressure',
  hiv: 'HIV',
  asthma_copd: 'Asthma or COPD',
  heart_disease: 'Heart disease',
  kidney_disease: 'Kidney disease',
  mental_health: 'Mental health',
  weight_management: 'Weight management',
  general_wellness: 'General wellness',
};

const BENEFIT_LABELS: Record<string, string> = {
  ayahPremium: 'Ayah Premium',
  teleconsultsPerYear: 'Teleconsults per year',
  pharmacyDelivery: 'Pharmacy delivery',
  screeningsPerYear: 'Screenings per year',
  mentalHealthSessionsPerYear: 'Mental health sessions per year',
  notes: 'Notes',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  analyst: 'Analyst',
  care_manager: 'Care manager',
};

function humanize(value: string): string {
  const spaced = value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : '';
}

@Component({
  selector: 'app-corporates-insurances',
  standalone: false,
  templateUrl: './corporates-insurances.component.html',
  styleUrls: [
    './corporates-insurances.component.css',
    '../marketplace-partners/marketplace-partners.component.css',
  ],
})
export class CorporatesInsurancesComponent implements OnInit, OnDestroy {
  readonly empty = EMPTY;
  readonly formatCityEmailSubline = formatCityEmailSubline;
  readonly applicationStatuses = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: '', label: 'All' },
  ];
  readonly kindFilters = [
    { value: '', label: 'All partners' },
    { value: 'insurer', label: 'Insurance partners' },
    { value: 'employer', label: 'Corporate partners' },
  ];
  readonly orgStatuses: Array<{ value: SponsorOrganizationStatus; label: string }> = [
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'offboarded', label: 'Offboarded' },
  ];
  readonly programmeStatuses = [
    { value: 'pending_activation', label: 'Waiting for Anixi' },
    { value: 'active', label: 'Active' },
    { value: 'draft', label: 'Draft' },
    { value: 'closed', label: 'Closed' },
    { value: '', label: 'All' },
  ];

  tab: SponsorTab = 'applications';
  canManage = false;
  message = '';
  error = '';
  pageSize = 10;

  // Applications
  appStatus = 'pending';
  appKind = '';
  applications: SponsorApplication[] = [];
  pendingApplicationsTotal = 0;
  applicationsLoading = true;
  applicationPageIndex = 1;
  selectedApplication: SponsorApplication | null = null;
  applicationModalVisible = false;
  decisionMode: 'view' | 'approve' | 'reject' = 'view';
  approveForm: SponsorApprovalInput = { dpaSignedAt: '', dpaVersion: '', contractStart: '', contractEnd: '' };
  rejectReason = '';
  drawerError = '';
  isSaving = false;

  // Organisations
  orgKind = '';
  orgStatus = '';
  orgQuery = '';
  organizations: SponsorOrganization[] = [];
  organizationsLoading = true;
  orgPageIndex = 1;
  selectedOrg: SponsorOrganizationDetail | null = null;
  orgModalVisible = false;
  orgDetailLoading = false;
  orgForm: OrgForm = this.blankOrgForm();
  orgError = '';

  // Programmes
  programmeStatus = 'pending_activation';
  programmes: SponsorProgrammeRow[] = [];
  programmesLoading = true;
  programmePageIndex = 1;
  programmeBusyId: string | null = null;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private sub = new Subscription();

  constructor(
    private djangoApi: DjangoApiService,
    private authService: AuthService,
    private modal: NzModalService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.authService.adminUser$.subscribe(() => {
        this.canManage = this.authService.hasPermission('managePartners');
      }),
    );
    this.sub.add(
      this.route.queryParamMap.subscribe((params) => {
        const tab = params.get('tab');
        if (tab === 'applications' || tab === 'organisations' || tab === 'programmes') {
          this.tab = tab;
        }
      }),
    );
    void this.loadApplications();
    void this.loadOrganizations();
    void this.loadProgrammes();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  setTab(tab: SponsorTab): void {
    this.tab = tab;
    this.message = '';
    this.error = '';
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, replaceUrl: true });
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.applicationPageIndex = 1;
    this.orgPageIndex = 1;
    this.programmePageIndex = 1;
  }

  // ---------- Labels ----------

  kindLabel(kind: string | null | undefined): string {
    return (kind && KIND_LABELS[kind]) || (kind ? humanize(kind) : EMPTY);
  }

  programmeStatusLabel(status: string): string {
    return PROGRAMME_STATUS_LABELS[status] || humanize(status);
  }

  programmeKindLabel(kind: string): string {
    return PROGRAMME_KIND_LABELS[kind] || humanize(kind);
  }

  enrolmentModeLabel(mode: string): string {
    return ENROLMENT_MODE_LABELS[mode] || humanize(mode);
  }

  conditionLabel(condition: string): string {
    return CONDITION_LABELS[condition] || humanize(condition);
  }

  roleLabel(role: string): string {
    return ROLE_LABELS[role] || humanize(role);
  }

  statusLabel(status: string | null | undefined): string {
    return status ? humanize(status) : EMPTY;
  }

  text(value: unknown): string {
    if (value === null || value === undefined) return EMPTY;
    const out = String(value).trim();
    return out || EMPTY;
  }

  location(org: SponsorOrganization): string {
    const country =
      org.country && COUNTRY_LABELS[org.country]
        ? COUNTRY_LABELS[org.country]
        : org.country;
    return this.text([org.city, org.province, country].filter((part) => Boolean(part)).join(', '));
  }

  /** Integer counts — no locale currency symbols, safe for string API values. */
  count(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '0';
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
      return '0';
    }
    return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(n);
  }

  number(value: number | null | undefined): string {
    return typeof value === 'number' ? this.count(value) : EMPTY;
  }

  orgCounts(org: SponsorOrganization): SponsorOrganization['counts'] {
    const c = org.counts;
    return {
      members: c?.members ?? 0,
      programmes: c?.programmes ?? 0,
      eligible: c?.eligible ?? 0,
      activeEnrolments: c?.activeEnrolments ?? 0,
    };
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return EMPTY;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-ZA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Johannesburg',
    });
  }

  formatDay(value: string | null | undefined): string {
    if (!value) return EMPTY;
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-ZA', { dateStyle: 'medium', timeZone: 'Africa/Johannesburg' });
  }

  benefitList(benefits: Record<string, unknown> | null | undefined): Array<{ label: string; value: string }> {
    if (!benefits || typeof benefits !== 'object') return [];
    const rows: Array<{ label: string; value: string }> = [];
    for (const [key, raw] of Object.entries(benefits)) {
      if (raw === null || raw === undefined || raw === '') continue;
      let value: string;
      if (typeof raw === 'boolean') value = raw ? 'Included' : 'Not included';
      else if (typeof raw === 'number') value = raw.toLocaleString('en-ZA');
      else if (typeof raw === 'string') value = raw.trim();
      else value = JSON.stringify(raw);
      if (!value) continue;
      rows.push({ label: BENEFIT_LABELS[key] || humanize(key), value });
    }
    return rows;
  }

  private errorText(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  // ---------- Applications ----------

  get pagedApplications(): SponsorApplication[] {
    return paginateItems(this.applications, this.applicationPageIndex, this.pageSize);
  }

  get pendingApplicationCount(): number {
    return this.pendingApplicationsTotal;
  }

  async loadApplications(): Promise<void> {
    this.applicationsLoading = true;
    try {
      const [apps, pendingApps] = await Promise.all([
        this.djangoApi.listSponsorApplications({
          status: this.appStatus,
          kind: this.appKind,
        }),
        this.djangoApi.listSponsorApplications({
          status: 'pending',
          kind: this.appKind,
        }),
      ]);
      this.applications = apps;
      this.pendingApplicationsTotal = pendingApps.length;
      this.applicationPageIndex = 1;
    } catch (err) {
      this.applications = [];
      this.error = this.errorText(err, 'Could not load applications.');
    } finally {
      this.applicationsLoading = false;
    }
  }

  setAppStatus(status: string): void {
    this.appStatus = status;
    void this.loadApplications();
  }

  setAppKind(kind: string): void {
    this.appKind = kind;
    void this.loadApplications();
  }

  openApplication(app: SponsorApplication): void {
    this.selectedApplication = app;
    this.decisionMode = 'view';
    this.drawerError = '';
    this.rejectReason = '';
    this.approveForm = { dpaSignedAt: '', dpaVersion: '', contractStart: '', contractEnd: '' };
    this.applicationModalVisible = true;
  }

  closeApplication(): void {
    this.applicationModalVisible = false;
    this.selectedApplication = null;
    this.decisionMode = 'view';
    this.drawerError = '';
  }

  onApplicationModalVisibleChange(visible: boolean): void {
    if (!visible) this.closeApplication();
  }

  startDecision(mode: 'approve' | 'reject'): void {
    this.decisionMode = mode;
    this.drawerError = '';
    if (mode === 'approve') {
      const today = new Date().toISOString().slice(0, 10);
      this.approveForm = {
        dpaSignedAt: this.approveForm.dpaSignedAt || today,
        dpaVersion: this.approveForm.dpaVersion?.trim() || 'v1',
        contractStart: this.approveForm.contractStart,
        contractEnd: this.approveForm.contractEnd,
      };
    }
  }

  backToView(): void {
    this.decisionMode = 'view';
    this.drawerError = '';
  }

  async approveSelected(): Promise<void> {
    const app = this.selectedApplication;
    if (!app) return;
    const form = this.approveForm;
    if (!form.dpaSignedAt) {
      this.drawerError = 'Enter the date the data processing agreement was signed.';
      return;
    }
    if (form.contractStart && form.contractEnd && form.contractEnd < form.contractStart) {
      this.drawerError = 'The contract end date must be on or after the start date.';
      return;
    }
    const payload: SponsorApprovalInput = { dpaSignedAt: form.dpaSignedAt };
    if (form.dpaVersion?.trim()) payload.dpaVersion = form.dpaVersion.trim();
    if (form.contractStart) payload.contractStart = form.contractStart;
    if (form.contractEnd) payload.contractEnd = form.contractEnd;
    this.isSaving = true;
    this.drawerError = '';
    try {
      await this.djangoApi.approveSponsorApplication(app.id, payload);
      this.message = `${app.organizationName} is approved. Their organisation is set up and the applicant is the owner.`;
      this.error = '';
      this.closeApplication();
      void this.loadApplications();
      void this.loadOrganizations();
    } catch (err) {
      this.drawerError = this.errorText(err, 'Approval failed.');
    } finally {
      this.isSaving = false;
    }
  }

  async rejectSelected(): Promise<void> {
    const app = this.selectedApplication;
    if (!app) return;
    const reason = this.rejectReason.trim();
    if (!reason) {
      this.drawerError = 'Give the applicant a reason so they know what to fix.';
      return;
    }
    this.isSaving = true;
    this.drawerError = '';
    try {
      await this.djangoApi.rejectSponsorApplication(app.id, reason);
      this.message = `${app.organizationName} was not approved. The applicant has been told why.`;
      this.error = '';
      this.closeApplication();
      void this.loadApplications();
    } catch (err) {
      this.drawerError = this.errorText(err, 'Rejection failed.');
    } finally {
      this.isSaving = false;
    }
  }

  // ---------- Organisations ----------

  get pagedOrganizations(): SponsorOrganization[] {
    return paginateItems(this.organizations, this.orgPageIndex, this.pageSize);
  }

  async loadOrganizations(): Promise<void> {
    this.organizationsLoading = true;
    try {
      this.organizations = await this.djangoApi.listSponsorOrganizations({
        kind: this.orgKind,
        status: this.orgStatus,
        q: this.orgQuery,
      });
      this.orgPageIndex = 1;
    } catch (err) {
      this.organizations = [];
      this.error = this.errorText(err, 'Could not load organisations.');
    } finally {
      this.organizationsLoading = false;
    }
  }

  setOrgKind(kind: string): void {
    this.orgKind = kind;
    void this.loadOrganizations();
  }

  setOrgStatus(status: string): void {
    this.orgStatus = status;
    void this.loadOrganizations();
  }

  onOrgQueryChange(value: string): void {
    this.orgQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.loadOrganizations(), 300);
  }

  private blankOrgForm(): OrgForm {
    return {
      status: 'active',
      minCohortSize: 10,
      dpaSignedAt: '',
      dpaVersion: '',
      contractStart: '',
      contractEnd: '',
      billingEmail: '',
    };
  }

  private formFromOrg(org: SponsorOrganization): OrgForm {
    return {
      status: org.status,
      minCohortSize: org.minCohortSize,
      dpaSignedAt: org.dpaSignedAt?.slice(0, 10) ?? '',
      dpaVersion: org.dpaVersion ?? '',
      contractStart: org.contractStart?.slice(0, 10) ?? '',
      contractEnd: org.contractEnd?.slice(0, 10) ?? '',
      billingEmail: org.billingEmail ?? '',
    };
  }

  async openOrganization(org: SponsorOrganization): Promise<void> {
    this.orgModalVisible = true;
    this.orgDetailLoading = true;
    this.orgError = '';
    this.selectedOrg = null;
    try {
      const detail = await this.djangoApi.getSponsorOrganization(org.id);
      this.selectedOrg = detail;
      this.orgForm = this.formFromOrg(detail);
    } catch (err) {
      this.orgError = this.errorText(err, 'Could not load this organisation.');
    } finally {
      this.orgDetailLoading = false;
    }
  }

  closeOrganization(): void {
    this.orgModalVisible = false;
    this.selectedOrg = null;
    this.orgError = '';
  }

  onOrgModalVisibleChange(visible: boolean): void {
    if (!visible) this.closeOrganization();
  }

  private orgChanges(): SponsorOrganizationUpdate {
    const org = this.selectedOrg;
    if (!org) return {};
    const current = this.formFromOrg(org);
    const form = this.orgForm;
    const changes: SponsorOrganizationUpdate = {};
    if (form.status !== current.status) changes.status = form.status;
    if (Number(form.minCohortSize) !== current.minCohortSize) changes.minCohortSize = Number(form.minCohortSize);
    if (form.dpaSignedAt !== current.dpaSignedAt) changes.dpaSignedAt = form.dpaSignedAt || null;
    if (form.dpaVersion.trim() !== current.dpaVersion) changes.dpaVersion = form.dpaVersion.trim();
    if (form.contractStart !== current.contractStart) changes.contractStart = form.contractStart || null;
    if (form.contractEnd !== current.contractEnd) changes.contractEnd = form.contractEnd || null;
    if (form.billingEmail.trim() !== current.billingEmail) changes.billingEmail = form.billingEmail.trim();
    return changes;
  }

  get orgHasChanges(): boolean {
    return Object.keys(this.orgChanges()).length > 0;
  }

  resetOrgForm(): void {
    if (this.selectedOrg) this.orgForm = this.formFromOrg(this.selectedOrg);
    this.orgError = '';
  }

  quickOrgStatus(next: SponsorOrganizationStatus): void {
    const org = this.selectedOrg;
    if (!org || !this.canManage || next === org.status) return;
    const explain: Record<SponsorOrganizationStatus, string> = {
      active: `${org.name} will be active again. Warriors will see this partner’s programmes and benefits on the patient app.`,
      suspended: `${org.name} will be suspended on the patient app. Warriors will not see their programmes or benefits until you set the organisation back to active.`,
      offboarded: `${org.name} will be offboarded. Their team loses access to the partner portal. Use this when the partnership has ended.`,
    };
    this.modal.confirm({
      nzTitle: `Change status to ${this.statusLabel(next).toLowerCase()}?`,
      nzContent: explain[next],
      nzOkText: 'Change status',
      nzOkDanger: next !== 'active',
      nzCancelText: 'Cancel',
      nzOnOk: () => this.submitOrgChanges(org.id, { status: next }),
    });
  }

  saveOrganization(): void {
    const org = this.selectedOrg;
    if (!org) return;
    const changes = this.orgChanges();
    if (!Object.keys(changes).length) return;
    const size = Number(this.orgForm.minCohortSize);
    if (!Number.isInteger(size) || size < 5 || size > 100) {
      this.orgError = 'Minimum group size must be a whole number from 5 to 100.';
      return;
    }
    const form = this.orgForm;
    if (form.contractStart && form.contractEnd && form.contractEnd < form.contractStart) {
      this.orgError = 'The contract end date must be on or after the start date.';
      return;
    }
    if (changes.status) {
      const next = changes.status;
      const explain: Record<SponsorOrganizationStatus, string> = {
        active: `${org.name} will be active again. Their team can use the partner portal and new programmes can be activated.`,
        suspended: `${org.name} will be suspended. New programmes cannot be activated until you set them back to active. Their team can still sign in to the partner portal.`,
        offboarded: `${org.name} will be offboarded. Their team loses access to the partner portal. Use this when the partnership has ended.`,
      };
      this.modal.confirm({
        nzTitle: `Change status to ${this.statusLabel(next).toLowerCase()}?`,
        nzContent: explain[next],
        nzOkText: 'Change status',
        nzOkDanger: next !== 'active',
        nzCancelText: 'Cancel',
        nzOnOk: () => this.submitOrgChanges(org.id, changes),
      });
      return;
    }
    void this.submitOrgChanges(org.id, changes);
  }

  private async submitOrgChanges(orgId: string, changes: SponsorOrganizationUpdate): Promise<void> {
    this.isSaving = true;
    this.orgError = '';
    try {
      const updated = await this.djangoApi.updateSponsorOrganization(orgId, changes);
      this.selectedOrg = updated;
      this.orgForm = this.formFromOrg(updated);
      this.organizations = this.organizations.map((row) =>
        row.id === updated.id ? { ...row, ...updated } : row,
      );
      this.message = `${updated.name} was updated.`;
      this.error = '';
    } catch (err) {
      this.orgError = this.errorText(err, 'Could not save changes.');
    } finally {
      this.isSaving = false;
    }
  }

  // ---------- Programmes ----------

  get pagedProgrammes(): SponsorProgrammeRow[] {
    return paginateItems(this.programmes, this.programmePageIndex, this.pageSize);
  }

  async loadProgrammes(): Promise<void> {
    this.programmesLoading = true;
    try {
      this.programmes = await this.djangoApi.listSponsorProgrammes({ status: this.programmeStatus });
      this.programmePageIndex = 1;
    } catch (err) {
      this.programmes = [];
      this.error = this.errorText(err, 'Could not load programmes.');
    } finally {
      this.programmesLoading = false;
    }
  }

  setProgrammeStatus(status: string): void {
    this.programmeStatus = status;
    void this.loadProgrammes();
  }

  programmeActions(programme: SponsorProgramme): ProgrammeAction[] {
    const actions: ProgrammeAction[] = [];
    if (programme.status === 'pending_activation') actions.push('activate', 'return');
    if (programme.status !== 'closed') actions.push('close');
    return actions;
  }

  actionLabel(action: ProgrammeAction): string {
    return { activate: 'Activate', return: 'Return to draft', close: 'Close programme' }[action];
  }

  confirmProgrammeAction(programme: SponsorProgrammeRow, action: ProgrammeAction): void {
    const content: Record<ProgrammeAction, string> = {
      activate: `${programme.name} goes live for ${programme.organizationName}. Warriors can join it straight away, and anyone already on the eligibility list is matched.`,
      return: `${programme.name} goes back to ${programme.organizationName} as a draft so they can make changes and submit it again.`,
      close: `Closing ${programme.name} ends the programme for every Warrior enrolled in it. All their enrolments end today and their sponsored benefits stop. This cannot be undone.`,
    };
    this.modal.confirm({
      nzTitle: `${this.actionLabel(action)}?`,
      nzContent: content[action],
      nzOkText: this.actionLabel(action),
      nzOkDanger: action === 'close',
      nzCancelText: 'Cancel',
      nzOnOk: () => this.runProgrammeAction(programme, action),
    });
  }

  private async runProgrammeAction(programme: SponsorProgrammeRow, action: ProgrammeAction): Promise<void> {
    this.programmeBusyId = programme.id;
    this.error = '';
    try {
      await this.djangoApi.runSponsorProgrammeAction(programme.id, action);
      const done: Record<ProgrammeAction, string> = {
        activate: `${programme.name} is now active.`,
        return: `${programme.name} was returned to ${programme.organizationName} as a draft.`,
        close: `${programme.name} is closed.`,
      };
      this.message = done[action];
      void this.loadProgrammes();
      void this.loadOrganizations();
    } catch (err) {
      this.message = '';
      this.error = this.errorText(err, 'That action failed.');
    } finally {
      this.programmeBusyId = null;
    }
  }
}
