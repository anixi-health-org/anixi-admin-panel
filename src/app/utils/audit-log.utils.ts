export type AuditCategory = 'all' | 'phi' | 'admin' | 'auth';

export type HumanizedAuditEvent = {
  id: string;
  createdAt?: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  patientId?: string;
  practiceId?: string;
  metadata: Record<string, unknown>;
  summary: string;
  detail: string;
  category: AuditCategory;
  categoryLabel: string;
  tone: 'blue' | 'green' | 'amber' | 'slate' | 'red';
};

const ACTION_LABELS: Record<string, string> = {
  'phi.clinical.read': 'Viewed clinical data',
  'phi.patient.read': 'Viewed patient profile',
  'auth.register': 'Registered a new account',
  'auth.delete_account': 'Deleted an account',
  'auth.otp_verify': 'Verified login code',
  'admin.user.contact_updated': 'Updated user contact details',
  'admin.team.invited': 'Invited an ops teammate',
  'admin.team.updated': 'Updated team member access',
  'admin.activation.profile_updated': 'Updated pending patient details',
  'admin.crm_template.created': 'Created activation email template',
  'admin.crm_template.updated': 'Updated activation email template',
  'admin.crm_template.deleted': 'Deleted activation email template',
  'admin.activation.reminders_sent': 'Sent activation reminder emails',
};

const RESOURCE_LABELS: Record<string, string> = {
  medication: 'medications list',
  patient: 'patient record',
  clinical: 'clinical record',
  user: 'user account',
  team_member: 'team member',
  email_template: 'email template',
  pending_activation: 'pending activation',
};

function titleCase(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shortId(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 8)}…`;
}

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith('phi.')) return `PHI access: ${titleCase(action.replace(/^phi\./, ''))}`;
  if (action.startsWith('admin.')) return `Admin: ${titleCase(action.replace(/^admin\./, ''))}`;
  if (action.startsWith('auth.')) return `Auth: ${titleCase(action.replace(/^auth\./, ''))}`;
  return titleCase(action);
}

function resourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? titleCase(resourceType);
}

function categoryFor(action: string): AuditCategory {
  if (action.startsWith('phi.')) return 'phi';
  if (action.startsWith('admin.')) return 'admin';
  if (action.startsWith('auth.')) return 'auth';
  return 'admin';
}

function categoryLabel(category: AuditCategory): string {
  switch (category) {
    case 'phi':
      return 'PHI access';
    case 'admin':
      return 'Admin action';
    case 'auth':
      return 'Authentication';
    default:
      return 'Event';
  }
}

function toneFor(category: AuditCategory): HumanizedAuditEvent['tone'] {
  switch (category) {
    case 'phi':
      return 'blue';
    case 'admin':
      return 'green';
    case 'auth':
      return 'amber';
    default:
      return 'slate';
  }
}

function buildDetail(
  action: string,
  resourceType: string,
  resourceId: string,
  patientId?: string,
  metadata: Record<string, unknown> = {},
): string {
  const resource = resourceLabel(resourceType);
  const parts: string[] = [];

  if (action.startsWith('phi.')) {
    parts.push(`Accessed ${resource}`);
    if (patientId) parts.push(`patient ${shortId(patientId)}`);
    else if (resourceId) parts.push(`ref ${shortId(resourceId)}`);
    parts.push('— recorded for POPIA compliance');
    return parts.join(' · ');
  }

  if (resourceType && resourceId) {
    parts.push(`${titleCase(resourceType)} ${shortId(resourceId)}`);
  }

  const metaHint =
    typeof metadata['count'] === 'number'
      ? `${metadata['count']} items`
      : typeof metadata['email'] === 'string'
        ? metadata['email']
        : typeof metadata['field'] === 'string'
          ? `field: ${metadata['field']}`
          : '';

  if (metaHint) parts.push(metaHint);
  return parts.length ? parts.join(' · ') : 'Platform event logged';
}

export function humanizeAuditEvent(row: Record<string, unknown>): HumanizedAuditEvent {
  const action = String(row['action'] ?? '');
  const resourceType = String(row['resourceType'] ?? row['resource_type'] ?? '');
  const resourceId = String(row['resourceId'] ?? row['resource_id'] ?? '');
  const metadata =
    row['metadata'] && typeof row['metadata'] === 'object'
      ? (row['metadata'] as Record<string, unknown>)
      : {};
  const category = categoryFor(action);

  return {
    id: String(row['id'] ?? ''),
    action,
    resourceType,
    resourceId,
    patientId: row['patientId'] ? String(row['patientId']) : undefined,
    practiceId: row['practiceId'] ? String(row['practiceId']) : undefined,
    actorName: row['actorName'] ? String(row['actorName']) : undefined,
    createdAt: row['createdAt'] ? String(row['createdAt']) : undefined,
    metadata,
    summary: actionLabel(action),
    detail: buildDetail(
      action,
      resourceType,
      resourceId,
      row['patientId'] ? String(row['patientId']) : undefined,
      metadata,
    ),
    category,
    categoryLabel: categoryLabel(category),
    tone: toneFor(category),
  };
}

export function filterAuditEvents(
  rows: HumanizedAuditEvent[],
  category: AuditCategory,
  query: string,
): HumanizedAuditEvent[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesCategory = category === 'all' || row.category === category;
    if (!matchesCategory) return false;
    if (!q) return true;
    const haystack = [
      row.summary,
      row.detail,
      row.actorName,
      row.action,
      row.resourceType,
      row.resourceId,
      row.patientId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
