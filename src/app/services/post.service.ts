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
  /** Shared media URL after successful upload (image or video). */
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
    return {
      id: String(row['id'] ?? ''),
      title: String(row['title'] ?? metadata['title'] ?? ''),
      comments: [],
      userId: String(row['userId'] ?? this.resolveAdminUserId()),
      userName: 'anixi health',
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
      hyperlink: '',
      originalPostId: '',
      repostText: '',
      repostUserId: '',
      repostTimeStamp: row['createdAt'] ?? new Date(),
      timeStamp: row['createdAt'] ?? new Date(),
      visibility: 'Visible to public',
      reported: false,
      likes: [],
      taggedFriends: [],
      status: (row['status'] ?? metadata['status'] ?? 'Draft') as CommunityContentStatus,
      commentCount: 0,
    };
  }

  private buildDjangoPayload(
    postId: string,
    data: Partial<IGroupPost>,
  ): Record<string, unknown> {
    const status = String(data.status ?? 'Draft');
    return {
      title: data.title ?? '',
      body: data.text ?? '',
      text: data.text ?? '',
      status,
      published: status === 'Published',
      publishAt:
        status === 'Scheduled' && data.scheduledAt
          ? new Date(data.scheduledAt as string | Date).toISOString()
          : null,
      contentType: data.contentType,
      mediaUrl: data.mediaUrl,
      mediaUrls: data.mediaUrls,
      videoUrl: data.videoUrl,
      bodyHtml: data.bodyHtml,
      groupName: data.groupName,
      communities: data.communities,
      source: data.source ?? 'admin_cms',
      scheduledAt:
        data.scheduledAt instanceof Date
          ? data.scheduledAt.toISOString()
          : data.scheduledAt ?? null,
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
        scheduledAt:
          data.scheduledAt instanceof Date
            ? data.scheduledAt.toISOString()
            : data.scheduledAt ?? null,
        textLower: data.textLower,
        hashtags: data.hashtags,
      },
      id: postId,
    };
  }

  async saveGroupPost(postId: string, data: Partial<IGroupPost>) {
    const payload = this.buildDjangoPayload(postId, {
      ...data,
      userId: data.userId || this.resolveAdminUserId(),
    });
    try {
      await this.djangoApi.patchPost(postId, payload);
    } catch {
      await this.djangoApi.createPost(payload);
    }
  }

  /**
   * Publishes patient-compatible community content via the Django API.
   */
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
    if (input.contentType === 'video' && input.mediaDownloadURL && input.mediaKind !== 'video') {
      throw new Error('Video content requires a video file upload.');
    }
    if (input.contentType === 'image' && input.mediaDownloadURL && input.mediaKind !== 'image') {
      throw new Error('Image content requires an image file upload.');
    }

    const caption = buildPatientBody(title, body);
    const textLower = buildSearchText(title, body);
    const hashtags = extractHashtags(`${title}\n${body}`);
    const adminUserId = this.resolveAdminUserId();
    const baseMs = Date.now();
    const contentBatchId = input.contentBatchId || newContentBatchId();
    const postIds: string[] = [];
    const scheduledAt = input.status === 'Scheduled' ? input.scheduledAt! : null;

    for (let i = 0; i < communities.length; i++) {
      const groupName = communities[i]!;
      const postId = `${baseMs}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      const mediaFields = this.buildMediaFields(input);

      await this.saveGroupPost(postId, {
        id: postId,
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
        userName: 'anixi health',
        userId: adminUserId,
        scheduledAt: scheduledAt || null,
        publishedAt: input.status === 'Published' ? new Date() : null,
        ...mediaFields,
      });
      postIds.push(postId);
    }

    const verified = await this.verifyPublishedDocs(postIds, input.status, {
      contentType: input.contentType,
      mediaUrl: input.mediaDownloadURL,
    });
    return { postIds, verified, status: input.status, contentBatchId };
  }

  /**
   * Updates a content batch across all selected communities
   * (create missing copies, update existing, delete removed).
   */
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
      const postId =
        existing?.id ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      keepIds.add(postId);

      const patch: Partial<IGroupPost> = {
        id: postId,
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
        userName: 'anixi health',
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

      await this.saveGroupPost(postId, patch);
      postIds.push(postId);
    }

    for (const post of input.existingPosts) {
      if (post.id && !keepIds.has(post.id)) {
        await this.deleteGroupPost(post.id);
      }
    }

    const verified = await this.verifyPublishedDocs(postIds, input.status, {
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

  private async verifyPublishedDocs(
    postIds: string[],
    expectedStatus: CommunityContentStatus,
    expected?: { contentType: CommunityContentType; mediaUrl?: string },
  ): Promise<boolean> {
    for (const id of postIds) {
      const post = await this.getPostById(id);
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
    await this.djangoApi.patchPost(postId, this.buildDjangoPayload(postId, data));
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
    const rows = await this.djangoApi.listAdminPosts();
    const match = rows.find((row) => String(row['id']) === postId);
    return match ? this.mapDjangoPost(match) : null;
  }

  /** All admin CMS posts (not limited to the signed-in author). */
  fetchAdminPost(_adminId?: string): Observable<{ data: any[]; loading: boolean }> {
    return interval(30_000).pipe(
      startWith(0),
      switchMap(() => from(this.djangoApi.listAdminPosts())),
      map((rows) => ({
        data: rows.map((row) => this.mapDjangoPost(row)),
        loading: false,
      })),
    );
  }
}
