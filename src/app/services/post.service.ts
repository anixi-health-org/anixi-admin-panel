import { Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
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
    private db: Firestore,
    private authService: AuthService
  ) {}

  private resolveAdminUserId(): string {
    return this.authService.getAdminUserId() || environment.ADMIN_USER_ID;
  }

  async saveGroupPost(postId: string, data: Partial<IGroupPost>) {
    const docRef = doc(this.db, 'group_posts', postId);
    const adminUserId = this.resolveAdminUserId();

    return setDoc(
      docRef,
      {
        ...data,
        timeStamp: data.timeStamp || new Date(),
        repostTimeStamp: data.repostTimeStamp || new Date(),
        reported: data.reported ?? false,
        likes: data.likes || [],
        comments: data.comments || [],
        taggedFriends: data.taggedFriends || [],
        originalPostId: data.originalPostId || '',
        repostUserId: data.repostUserId || '',
        repostText: data.repostText || '',
        visibility: 'Visible to public',
        userId: data.userId || adminUserId,
        hyperlink: data.hyperlink || '',
        commentCount: data.commentCount ?? 0,
        source: data.source || 'admin_cms',
        updatedAt: new Date(),
      },
      { merge: true }
    );
  }

  /**
   * Publishes patient-compatible community content.
   * Writes videoUrl / mediaUrls the patient app expects, then verifies Firestore.
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
    const searchBlob = buildSearchText(title, body);
    const hashtags = extractHashtags(`${title}\n${body}`);
    const textLower = searchBlob;
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
      input.existingPosts.map((post) => [post.groupName, post] as const)
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
    const q = query(
      collection(this.db, 'group_posts'),
      where('contentBatchId', '==', contentBatchId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as IGroupPost), id: d.id }));
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
    expected?: { contentType: CommunityContentType; mediaUrl?: string }
  ): Promise<boolean> {
    for (const id of postIds) {
      const snap = await getDoc(doc(this.db, 'group_posts', id));
      if (!snap.exists()) return false;
      const data = snap.data() as Record<string, unknown>;
      if (data['status'] !== expectedStatus) return false;
      if (typeof data['text'] !== 'string' || !String(data['text']).trim()) return false;
      if (!data['groupName']) return false;
      if (expected?.contentType === 'video' && expected.mediaUrl) {
        if (!data['videoUrl'] || data['videoUrl'] !== expected.mediaUrl) return false;
      }
      if (expected?.contentType === 'image' && expected.mediaUrl) {
        const urls = data['mediaUrls'];
        const hasUrl =
          data['mediaUrl'] === expected.mediaUrl ||
          (Array.isArray(urls) && urls.includes(expected.mediaUrl));
        if (!hasUrl) return false;
      }
    }
    return true;
  }

  async editPost(postId: string, data: Partial<IGroupPost>) {
    const docRef = doc(this.db, 'group_posts', postId);
    await updateDoc(docRef, {
      ...data,
      lastEditAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async setContentStatus(
    postId: string,
    status: CommunityContentStatus
  ): Promise<{ verified: boolean; status: string | null }> {
    const docRef = doc(this.db, 'group_posts', postId);
    const patch: Record<string, unknown> = {
      status,
      lastEditAt: new Date(),
      updatedAt: new Date(),
    };
    if (status === 'Published') {
      patch['publishedAt'] = new Date();
      patch['scheduledAt'] = null;
    }
    if (status === 'Archived') {
      patch['archivedAt'] = new Date();
    }
    await updateDoc(docRef, patch);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return { verified: false, status: null };
    const data = snap.data() as Record<string, unknown>;
    return {
      verified: data['status'] === status,
      status: (data['status'] as string) || null,
    };
  }

  async deleteGroupPost(postId: string) {
    const docRef = doc(this.db, 'group_posts', postId);
    await deleteDoc(docRef);
  }

  async getPostById(postId: string): Promise<IGroupPost | null> {
    const snap = await getDoc(doc(this.db, 'group_posts', postId));
    if (!snap.exists()) return null;
    return { ...(snap.data() as IGroupPost), id: snap.id };
  }

  /** All admin CMS posts (not limited to the signed-in author). */
  fetchAdminPost(_adminId?: string): Observable<{ data: any[]; loading: boolean }> {
    return new Observable((observer) => {
      const refCol = collection(this.db, 'group_posts');
      const q = query(
        refCol,
        where('contentType', 'in', ['article', 'video', 'image'])
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const posts = snapshot.docs
            .map((d) => ({
              ...d.data(),
              id: d.id,
            }))
            .filter((post: any) => {
              if (post.source === 'admin_cms') return true;
              if (post.groupName === 'main') return false;
              return (
                post.firstName === 'admin' ||
                post.userName === 'anixi health' ||
                post.contentType === 'article' ||
                post.contentType === 'video' ||
                post.contentType === 'image'
              );
            });
          observer.next({ data: posts, loading: false });
        },
        async (error) => {
          console.warn('[PostService] contentType query failed, falling back', error);
          try {
            const fallback = await this.fetchLegacyAdminPosts();
            observer.next({ data: fallback, loading: false });
          } catch (fallbackError) {
            observer.error(fallbackError);
          }
        }
      );
      return () => unsubscribe();
    });
  }

  private async fetchLegacyAdminPosts(): Promise<any[]> {
    const snap = await getDocs(collection(this.db, 'group_posts'));
    return snap.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .filter((post: any) => {
        if (post.source === 'admin_cms') return true;
        if (post.contentType === 'article' || post.contentType === 'video' || post.contentType === 'image') {
          return true;
        }
        return (
          post.firstName === 'admin' &&
          (post.lastName === 'anixihealth' || post.userName === 'anixi health')
        );
      });
  }
}
