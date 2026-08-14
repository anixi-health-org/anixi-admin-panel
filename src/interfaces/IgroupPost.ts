export type CommunityContentType = 'article' | 'video' | 'image';
export type CommunityContentStatus = 'Draft' | 'Published' | 'Scheduled' | 'Archived';

export interface IGroupPost {
  id: string;
  title?: string;
  comments: string[];
  userId: string;
  userName: string;
  firstName: string;
  lastName: string;
  groupName: string;
  text: string;
  /** Rich HTML from admin editor (optional; patient app uses plain `text`). */
  bodyHtml?: string;
  postType: string;
  /** Legacy admin field — prefer mediaUrls / videoUrl for patient app. */
  mediaType: string;
  mediaUrl: string;
  /** Patient app image carousel source. */
  mediaUrls?: string[];
  /** Patient app video player / Reels source. */
  videoUrl?: string;
  textLower?: string;
  hashtags?: string[];
  contentType?: CommunityContentType;
  /** Marks CMS-authored posts for the admin library. */
  source?: 'admin_cms' | string;
  /** Shared id across multi-community copies of the same content. */
  contentBatchId?: string;
  /** All communities this batch targets (mirrors selection). */
  communities?: string[];
  /** When status is Scheduled, publish at/after this time. */
  scheduledAt?: any;
  publishedAt?: any;
  archivedAt?: any;
  lastEditAt?: any;
  updatedAt?: any;
  hyperlink: string;
  originalPostId: string;
  repostText: string;
  repostUserId: string;
  repostTimeStamp: any;
  timeStamp: any;
  visibility: string;
  reported: boolean;
  likes: string[];
  taggedFriends: string[];
  status?: CommunityContentStatus | string;
  commentCount?: number;
}

/** Extract hashtags from free text for patient search feeds. */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return Array.from(new Set(matches.map((tag) => tag.slice(1).toLowerCase())));
}

/** Caption / body shown under title in the patient Community. */
export function buildPatientBody(title: string, body: string): string {
  const b = body.trim();
  if (b) return b;
  // Image/video posts may only have a title — keep text searchable.
  return title.trim();
}

export function buildSearchText(title: string, body: string): string {
  return `${title.trim()} ${body.trim()}`.trim().toLowerCase();
}

export function newContentBatchId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
