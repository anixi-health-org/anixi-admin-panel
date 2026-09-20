import { Injectable } from '@angular/core';
import { from, interval, map, Observable, startWith, switchMap } from 'rxjs';
import {
  buildPatientBody,
  buildSearchText,
  extractHashtags,
  CommunityContentStatus,
  CommunityContentType,
  IGroupPost,
  newContentBatchId,
} from '../../interfaces/IgroupPost';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { DjangoApiService } from './django-api.service';

export type PublishCommunityInput = {
  title: string;
  body: string;
  bodyHtml?: string;
  communities: string[];
  contentType: CommunityContentType;
  status: CommunityContentStatus;
  mediaDownloadURL?: string;
  mediaKind?: 'image' | 'video';
  scheduledAt?: Date | null;
  contentBatchId?: string;
};

export type PublishCommunityResult = {
  postIds: string[];
  verified: boolean;
  status: CommunityContentStatus;
  contentBatchId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseTimestamp(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

@Injectable({
  providedIn: 'root',
})
export class PostService {
  constructor(
    private authService: AuthService,
    private djangoApi: DjangoApiService,
  ) {}

  private resolveAdminUserId(): string {
    return this.authService.getAdminUserId() || environment.ADMIN_USER_ID;
  }

  private mapDjangoPost(row: Record<string, unknown>): IGroupPost {
    const metadata = (row['metadata'] as Record<string, unknown>) || {};
    const createdAt = row['createdAt'] ?? row['updatedAt'] ?? new Date().toISOString();
    const updatedAt = row['updatedAt'] ?? createdAt;
    return {
      id: String(row['id'] ?? ''),
      title: String(row['title'] ?? metadata['title'] ?? ''),
      comments: [],
      userId: String(row['userId'] ?? this.resolveAdminUserId()),
      userName: 'Anixi Health',
      firstName: 'admin',
      lastName: 'anixihealth',
      groupName: String(row['groupName'] ?? metadata['groupName'] ?? ''),
      text: String(row['text'] ?? row['body'] ?? ''),
      bodyHtml: String(row['bodyHtml'] ?? metadata['bodyHtml'] ?? ''),
      postType: 'Post',
      mediaType: String(metadata['contentType'] === 'video' ? 'Video' : 'Picture'),
      mediaUrl: String(row['mediaUrl'] ?? metadata['mediaUrl'] ?? ''),
      mediaUrls: (row['mediaUrls'] as string[]) ?? (metadata['mediaUrls'] as string[]) ?? [],
      videoUrl: String(row['videoUrl'] ?? metadata['videoUrl'] ?? ''),
      textLower: String(metadata['textLower'] ?? ''),
      hashtags: (metadata['hashtags'] as string[]) ?? [],
      contentType: (row['contentType'] ?? metadata['contentType']) as CommunityContentType,
      source: String(row['source'] ?? metadata['source'] ?? 'admin_cms'),
      contentBatchId: String(metadata['contentBatchId'] ?? ''),
      communities: (metadata['communities'] as string[]) ?? [],
      scheduledAt: metadata['scheduledAt'] ?? row['publishAt'] ?? null,
      publishedAt: metadata['publishedAt'] ?? null,
      archivedAt: metadata['archivedAt'] ?? null,
      updatedAt,
      hyperlink: '',
      originalPostId: '',
      repostText: '',
      repostUserId: '',
      repostTimeStamp: createdAt,
      timeStamp: createdAt,
      visibility: 'Visible to public',
      reported: Boolean(row['reported'] ?? metadata['reported']),
      likes: [],
      taggedFriends: [],
      status: (row['status'] ?? metadata['status'] ?? 'Draft') as CommunityContentStatus,
      commentCount: 0,
    };
  }

  private buildDjangoPayload(data: Partial<IGroupPost>): Record<string, unknown> {
    const status = String(data.status ?? 'Draft');
    const scheduled =
      status === 'Scheduled' && data.scheduledAt
        ? parseTimestamp(data.scheduledAt).toISOString()
        : null;
    return {
      title: data.title ?? '',
      body: data.text ?? '',
      text: data.text ?? '',
      status,
      published: status === 'Published',
      publishAt: scheduled,
      contentType: data.contentType,
      mediaUrl: data.mediaUrl,
      mediaUrls: data.mediaUrls,
      videoUrl: data.videoUrl,
      bodyHtml: data.bodyHtml,
      groupName: data.groupName,
      communities: data.communities,
      source: data.source ?? 'admin_cms',
      scheduledAt: scheduled,
      publishedAt:
        status === 'Published'
          ? (data.publishedAt instanceof Date
              ? data.publishedAt.toISOString()
              : data.publishedAt ?? new Date().toISOString())
          : null,
      archivedAt:
        status === 'Archived'
          ? (data.archivedAt instanceof Date
              ? data.archivedAt.toISOString()
              : data.archivedAt ?? new Date().toISOString())
          : null,
      metadata: {
        contentBatchId: data.contentBatchId,
        contentType: data.contentType,
        mediaUrl: data.mediaUrl,
        mediaUrls: data.mediaUrls,
        videoUrl: data.videoUrl,
        bodyHtml: data.bodyHtml,
        groupName: data.groupName,
        communities: data.communities,
        source: data.source ?? 'admin_cms',
        status,
        scheduledAt: scheduled,
        publishedAt:
          status === 'Published'
            ? (data.publishedAt instanceof Date
                ? data.publishedAt.toISOString()
                : data.publishedAt ?? new Date().toISOString())
            : null,
        archivedAt:
          status === 'Archived'
            ? (data.archivedAt instanceof Date
                ? data.archivedAt.toISOString()
                : data.archivedAt ?? new Date().toISOString())
            : null,
        textLower: data.textLower,
        hashtags: data.hashtags,
      },
    };
  }

  private isServerPostId(postId: string | null | undefined): boolean {
    return Boolean(postId && UUID_RE.test(postId));
  }

  /** Create or update a post; returns the server-assigned UUID. */
  async saveGroupPost(postId: string | null, data: Partial<IGroupPost>): Promise<string> {
    const payload = this.buildDjangoPayload({
      ...data,
      userId: data.userId || this.resolveAdminUserId(),
    });

    if (this.isServerPostId(postId)) {
      try {
        const updated = await this.djangoApi.patchPost(postId!, payload);
        return String(updated['id'] ?? postId);
      } catch {
        /* fall through to create if stale id */
      }
    }

    const created = await this.djangoApi.createPost(payload);
    const serverId = String(created['id'] ?? '');
    if (!serverId) {
      throw new Error('Server did not return a post id.');
    }
    return serverId;
  }

  async publishCommunityContent(input: PublishCommunityInput): Promise<PublishCommunityResult> {
    const communities = Array.from(new Set(input.communities.map((c) => c.trim()).filter(Boolean)));
    if (!communities.length) {
      throw new Error('Select at least one community.');
    }
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title) throw new Error('Title is required.');
    if (input.contentType === 'article' && !body) {
      throw new Error('Article content is required.');
    }
    if (input.status === 'Scheduled' && !input.scheduledAt) {
      throw new Error('Choose a schedule date and time.');
    }
    if (
      input.status === 'Scheduled' &&
      input.scheduledAt &&
      input.scheduledAt.getTime() <= Date.now()
    ) {
      throw new Error('Schedule time must be in the future.');
    }
    if (
      (input.status === 'Published' || input.status === 'Scheduled') &&
      (input.contentType === 'video' || input.contentType === 'image') &&
      !input.mediaDownloadURL
    ) {
      throw new Error('Upload media before publishing or scheduling.');
    }

    const caption = buildPatientBody(title, body);
    const textLower = buildSearchText(title, body);
    const hashtags = extractHashtags(`${title}\n${body}`);
    const adminUserId = this.resolveAdminUserId();
    const contentBatchId = input.contentBatchId || newContentBatchId();
    const postIds: string[] = [];
    const scheduledAt = input.status === 'Scheduled' ? input.scheduledAt! : null;

    for (const groupName of communities) {
      const mediaFields = this.buildMediaFields(input);
      const serverId = await this.saveGroupPost(null, {
        title,
        text: caption,
        bodyHtml: input.bodyHtml || '',
        textLower,
        hashtags,
        groupName,
        communities,
        contentBatchId,
        contentType: input.contentType,
        status: input.status,
        source: 'admin_cms',
        postType: 'Post',
        firstName: 'admin',
        lastName: 'anixihealth',
        userName: 'Anixi Health',
        userId: adminUserId,
        scheduledAt: scheduledAt || null,
        publishedAt: input.status === 'Published' ? new Date() : null,
        ...mediaFields,
      });
      postIds.push(serverId);
    }

    const verified = await this.verifyContentBatch(contentBatchId, input.status, communities, {
      contentType: input.contentType,
      mediaUrl: input.mediaDownloadURL,
    });
    return { postIds, verified, status: input.status, contentBatchId };
  }

  async syncCommunityContentBatch(input: {
    contentBatchId: string;
    existingPosts: IGroupPost[];
    title: string;
    body: string;
    bodyHtml?: string;
    communities: string[];
    contentType: CommunityContentType;
    status: CommunityContentStatus;
    mediaDownloadURL?: string;
    mediaKind?: 'image' | 'video';
    scheduledAt?: Date | null;
  }): Promise<PublishCommunityResult> {
    const communities = Array.from(new Set(input.communities.map((c) => c.trim()).filter(Boolean)));
    if (!communities.length) throw new Error('Select at least one community.');
    if (input.status === 'Scheduled' && !input.scheduledAt) {
      throw new Error('Choose a schedule date and time.');
    }

    const title = input.title.trim();
    const body = input.body.trim();
    const caption = buildPatientBody(title, body);
    const textLower = buildSearchText(title, body);
    const hashtags = extractHashtags(`${title}\n${body}`);
    const mediaFields = this.buildMediaFields({
      title,
      body,
      communities,
      contentType: input.contentType,
      status: input.status,
      mediaDownloadURL: input.mediaDownloadURL,
      mediaKind: input.mediaKind,
    });

    const byCommunity = new Map(
      input.existingPosts.map((post) => [post.groupName, post] as const),
    );
    const postIds: string[] = [];
    const keepIds = new Set<string>();
    const scheduledAt = input.status === 'Scheduled' ? input.scheduledAt! : null;

    for (const groupName of communities) {
      const existing = byCommunity.get(groupName);
      const existingId = this.isServerPostId(existing?.id) ? existing!.id : null;

      const patch: Partial<IGroupPost> = {
        title,
        text: caption,
        bodyHtml: input.bodyHtml || '',
        textLower,
        hashtags,
        groupName,
        communities,
        contentBatchId: input.contentBatchId,
        contentType: input.contentType,
        status: input.status,
        source: 'admin_cms',
        postType: 'Post',
        firstName: 'admin',
        lastName: 'anixihealth',
        userName: 'Anixi Health',
        scheduledAt: scheduledAt || null,
        lastEditAt: new Date(),
        ...mediaFields,
      };
      if (input.status === 'Published') {
        patch.publishedAt = existing?.publishedAt || new Date();
      }
      if (input.status === 'Archived') {
        patch.archivedAt = new Date();
      }

      const serverId = await this.saveGroupPost(existingId, patch);
      keepIds.add(serverId);
      postIds.push(serverId);
    }

    for (const post of input.existingPosts) {
      if (post.id && this.isServerPostId(post.id) && !keepIds.has(post.id)) {
        await this.deleteGroupPost(post.id);
      }
    }

    const verified = await this.verifyContentBatch(input.contentBatchId, input.status, communities, {
      contentType: input.contentType,
      mediaUrl: input.mediaDownloadURL,
    });
    return {
      postIds,
      verified,
      status: input.status,
      contentBatchId: input.contentBatchId,
    };
  }

  async getPostsByBatchId(contentBatchId: string): Promise<IGroupPost[]> {
    const rows = await this.djangoApi.listPostsByBatch(contentBatchId);
    return rows.map((row) => this.mapDjangoPost(row));
  }

  private buildMediaFields(input: PublishCommunityInput): Partial<IGroupPost> {
    const url = input.mediaDownloadURL?.trim() || '';
    if (!url) {
      return {
        mediaType: '',
        mediaUrl: '',
        mediaUrls: [],
        videoUrl: '',
      };
    }
    if (input.mediaKind === 'video' || input.contentType === 'video') {
      return {
        mediaType: 'Video',
        mediaUrl: '',
        mediaUrls: [],
        videoUrl: url,
      };
    }
    return {
      mediaType: 'Picture',
      mediaUrl: url,
      mediaUrls: [url],
      videoUrl: '',
    };
  }

  private async verifyContentBatch(
    contentBatchId: string,
    expectedStatus: CommunityContentStatus,
    communities: string[],
    expected?: { contentType: CommunityContentType; mediaUrl?: string },
  ): Promise<boolean> {
    const rows = await this.djangoApi.listPostsByBatch(contentBatchId);
    if (rows.length < communities.length) return false;

    const byCommunity = new Map(
      rows.map((row) => [String(row['groupName'] ?? ''), this.mapDjangoPost(row)] as const),
    );

    for (const community of communities) {
      const post = byCommunity.get(community);
      if (!post) return false;
      if (post.status !== expectedStatus) return false;
      if (!post.text?.trim()) return false;
      if (!post.groupName) return false;
      if (expected?.contentType === 'video' && expected.mediaUrl) {
        if (post.videoUrl !== expected.mediaUrl) return false;
      }
      if (expected?.contentType === 'image' && expected.mediaUrl) {
        const hasUrl =
          post.mediaUrl === expected.mediaUrl ||
          (Array.isArray(post.mediaUrls) && post.mediaUrls.includes(expected.mediaUrl));
        if (!hasUrl) return false;
      }
    }
    return true;
  }

  async editPost(postId: string, data: Partial<IGroupPost>) {
    await this.djangoApi.patchPost(postId, this.buildDjangoPayload(data));
  }

  async setContentStatus(
    postId: string,
    status: CommunityContentStatus,
  ): Promise<{ verified: boolean; status: string | null }> {
    const patch: Record<string, unknown> = {
      status,
      published: status === 'Published',
    };
    if (status === 'Published') {
      patch['publishedAt'] = new Date().toISOString();
      patch['scheduledAt'] = null;
    }
    if (status === 'Archived') {
      patch['archivedAt'] = new Date().toISOString();
    }
    await this.djangoApi.patchPost(postId, patch);
    const post = await this.getPostById(postId);
    return { verified: post?.status === status, status: post?.status ?? null };
  }

  async deleteGroupPost(postId: string) {
    await this.djangoApi.deletePost(postId);
  }

  async getPostById(postId: string): Promise<IGroupPost | null> {
    if (this.isServerPostId(postId)) {
      try {
        const row = await this.djangoApi.getPost(postId);
        return this.mapDjangoPost(row);
      } catch {
        return null;
      }
    }
    const rows = await this.djangoApi.listAdminPosts();
    const match = rows.find((row) => String(row['id']) === postId);
    return match ? this.mapDjangoPost(match) : null;
  }

  fetchAdminPost(_adminId?: string): Observable<{ data: IGroupPost[]; loading: boolean }> {
    return interval(30_000).pipe(
      startWith(0),
      switchMap(() => from(this.djangoApi.listAdminPosts())),
      map((rows) => ({
        data: rows
          .map((row) => this.mapDjangoPost(row))
          .sort((a, b) => parseTimestamp(b.timeStamp).getTime() - parseTimestamp(a.timeStamp).getTime()),
        loading: false,
      })),
    );
  }
}
