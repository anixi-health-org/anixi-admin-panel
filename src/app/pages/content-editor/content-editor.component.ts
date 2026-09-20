import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml, SafeUrl } from '@angular/platform-browser';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import {
  COMMUNITIES,
  displayNotificationMessage,
  ERROR_NOTIFICATION_BOX_POSITION,
  SUCCESS_NOTIFICATION_BOX_POSITION,
} from '../../../../const';
import {
  htmlToPlainText,
  plainTextToEditorHtml,
} from '../../components/rich-text-editor/rich-text-editor.component';
import {
  CommunityContentStatus,
  CommunityContentType,
  IGroupPost,
  newContentBatchId,
} from '../../../interfaces/IgroupPost';
import {
  MediaUploadProgress,
  MediaUploadResult,
  MediaUploadService,
} from '../../services/media-upload.service';
import { PostService } from '../../services/post.service';

@Component({
  selector: 'app-content-editor',
  standalone: false,
  templateUrl: './content-editor.component.html',
  styleUrl: './content-editor.component.css',
})
export class ContentEditorComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  communities = COMMUNITIES;
  communitySearch = new FormControl('');
  contentTypes: { id: CommunityContentType; label: string; hint: string }[] = [
    { id: 'article', label: 'Article', hint: 'Title + body for patient Community' },
    { id: 'video', label: 'Video', hint: 'Upload a video patients can play' },
    { id: 'image', label: 'Image', hint: 'Image post with optional caption' },
  ];

  editPostId: string | null = null;
  existingPost: IGroupPost | null = null;
  batchPosts: IGroupPost[] = [];
  contentBatchId: string | null = null;
  isEditMode = false;
  isLoadingExisting = false;
  isSaving = false;
  showPublishConfirm = false;
  showScheduleConfirm = false;
  previewMode: 'desktop' | 'mobile' = 'mobile';
  lastError: string | null = null;
  submitted = false;

  selectedFile: File | null = null;
  localPreview: SafeUrl | null = null;
  private rawObjectUrl: string | null = null;
  uploaded: MediaUploadResult | null = null;
  uploadProgress: MediaUploadProgress = { progress: 0, state: 'idle' };

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private postService: PostService,
    private mediaUpload: MediaUploadService,
    private sanitizer: DomSanitizer,
    private notif: NzNotificationService
  ) {}

  ngOnInit(): void {
    const defaultSchedule = new Date(Date.now() + 60 * 60_000);
    defaultSchedule.setSeconds(0, 0);

    this.form = this.fb.group({
      contentType: ['article' as CommunityContentType, Validators.required],
      title: ['', [Validators.required, Validators.maxLength(160)]],
      body: [''],
      bodyHtml: [''],
      communities: [[] as string[], Validators.required],
      scheduledAtLocal: [this.toLocalInputValue(defaultSchedule)],
    });

    this.form.get('contentType')?.valueChanges.subscribe((type: CommunityContentType) => {
      this.applyTypeValidators(type);
      if (this.uploaded && this.uploaded.kind !== this.mediaKindForType(type)) {
        this.clearMedia();
      }
    });
    this.form.get('bodyHtml')?.valueChanges.subscribe((html: string) => {
      this.onBodyHtmlChange(html || '');
    });
    this.applyTypeValidators('article');

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEditMode = true;
      this.editPostId = id;
      void this.loadExisting(id);
    }
  }

  ngOnDestroy(): void {
    this.revokeLocalPreview();
  }

  get contentType(): CommunityContentType {
    return this.form.get('contentType')?.value as CommunityContentType;
  }

  get selectedCommunities(): string[] {
    return (this.form.get('communities')?.value as string[]) || [];
  }

  get filteredCommunities() {
    const q = (this.communitySearch.value || '').trim().toLowerCase();
    if (!q) return this.communities;
    return this.communities.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }

  get checklist(): { label: string; ok: boolean }[] {
    const titleOk = !!(this.form.get('title')?.value || '').trim();
    const communitiesOk = this.selectedCommunities.length > 0;
    const bodyPlain = this.resolvePlainBody();
    const type = this.contentType;
    const mediaOk =
      type === 'article'
        ? true
        : !!(this.uploaded?.downloadURL || this.existingMediaUrl());
    const scheduleOk = this.scheduleDate()?.getTime()! > Date.now();

    return [
      { label: 'Title', ok: titleOk },
      { label: 'Content type', ok: !!type },
      { label: 'Community selected', ok: communitiesOk },
      {
        label: type === 'article' ? 'Article content' : 'Description (optional)',
        ok: type === 'article' ? !!bodyPlain : true,
      },
      {
        label:
          type === 'video'
            ? 'Video uploaded'
            : type === 'image'
              ? 'Image uploaded'
              : 'Media (optional)',
        ok: mediaOk,
      },
      {
        label: 'Media ready',
        ok:
          type === 'article' ||
          this.uploadProgress.state === 'success' ||
          (!!this.existingMediaUrl() && this.uploadProgress.state !== 'uploading'),
      },
      {
        label: 'Schedule time (for Schedule)',
        ok: scheduleOk,
      },
    ];
  }

  get canPublish(): boolean {
    return (
      this.checklist
        .filter((c) => c.label !== 'Schedule time (for Schedule)')
        .every((c) => c.ok) &&
      this.uploadProgress.state !== 'uploading' &&
      !this.isSaving
    );
  }

  get canSchedule(): boolean {
    return this.canPublish && !!this.scheduleDate() && this.scheduleDate()!.getTime() > Date.now();
  }

  get schedulePreviewLabel(): string {
    const date = this.scheduleDate();
    return date ? date.toLocaleString() : '—';
  }

  get previewTitle(): string {
    return (this.form.get('title')?.value || '').trim();
  }

  get previewBody(): string {
    return this.resolvePlainBody();
  }

  get previewBodyHtml(): SafeHtml | null {
    const html = (this.form.get('bodyHtml')?.value || '').trim();
    if (!html) return null;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  get previewMediaUrl(): string | null {
    return this.uploaded?.downloadURL || this.existingMediaUrl() || this.rawObjectUrl;
  }

  get previewIsVideo(): boolean {
    if (this.uploaded) return this.uploaded.kind === 'video';
    if (this.contentType === 'video') return true;
    if (this.existingPost?.videoUrl) return true;
    return this.selectedFile?.type.startsWith('video/') ?? false;
  }

  communityLabel(id: string): string {
    return this.communities.find((c) => c.id === id)?.label || id;
  }

  isCommunitySelected(id: string): boolean {
    return this.selectedCommunities.includes(id);
  }

  toggleCommunity(id: string): void {
    const current = [...this.selectedCommunities];
    const idx = current.indexOf(id);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(id);
    this.form.get('communities')?.setValue(current);
    this.form.get('communities')?.markAsTouched();
  }

  selectContentType(type: CommunityContentType): void {
    if (this.isEditMode) return;
    this.form.get('contentType')?.setValue(type);
  }

  onBodyHtmlChange(html: string): void {
    this.form.get('bodyHtml')?.setValue(html, { emitEvent: false });
    this.form.get('body')?.setValue(htmlToPlainText(html), { emitEvent: false });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const kind = this.mediaKindForType(this.contentType);
    if (!kind) {
      this.lastError =
        'Articles do not require a media file. Switch to Image or Video to upload media.';
      input.value = '';
      return;
    }

    const validation = this.mediaUpload.validateFile(file, kind);
    if (!validation.ok) {
      this.lastError = validation.error;
      this.notif.create('error', 'Invalid file', validation.error, ERROR_NOTIFICATION_BOX_POSITION);
      input.value = '';
      return;
    }

    this.lastError = null;
    this.selectedFile = file;
    this.uploaded = null;
    this.revokeLocalPreview();
    this.rawObjectUrl = URL.createObjectURL(file);
    this.localPreview = this.sanitizer.bypassSecurityTrustUrl(this.rawObjectUrl);

    const groupId = this.selectedCommunities[0] || 'shared';
    try {
      this.uploaded = await this.mediaUpload.uploadCommunityMedia(
        file,
        groupId,
        kind,
        (progress) => {
          this.uploadProgress = progress;
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      this.lastError = message;
      this.uploadProgress = { progress: 0, state: 'error', error: message };
    }
  }

  clearMedia(): void {
    this.selectedFile = null;
    this.uploaded = null;
    this.uploadProgress = { progress: 0, state: 'idle' };
    this.revokeLocalPreview();
    this.localPreview = null;
  }

  async retryUpload(): Promise<void> {
    if (!this.selectedFile) return;
    const kind = this.mediaKindForType(this.contentType);
    if (!kind) return;
    const groupId = this.selectedCommunities[0] || 'shared';
    this.lastError = null;
    try {
      this.uploaded = await this.mediaUpload.uploadCommunityMedia(
        this.selectedFile,
        groupId,
        kind,
        (progress) => {
          this.uploadProgress = progress;
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      this.lastError = message;
    }
  }

  requestPublish(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (!this.canPublish) {
      this.lastError = 'Complete the publishing checklist before publishing.';
      return;
    }
    this.showPublishConfirm = true;
  }

  requestSchedule(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (!this.canSchedule) {
      this.lastError = 'Set a future schedule time and complete the checklist.';
      return;
    }
    this.showScheduleConfirm = true;
  }

  cancelPublishConfirm(): void {
    this.showPublishConfirm = false;
  }

  cancelScheduleConfirm(): void {
    this.showScheduleConfirm = false;
  }

  async saveDraft(): Promise<void> {
    await this.persist('Draft');
  }

  async confirmPublish(): Promise<void> {
    this.showPublishConfirm = false;
    await this.persist('Published');
  }

  async confirmSchedule(): Promise<void> {
    this.showScheduleConfirm = false;
    await this.persist('Scheduled');
  }

  async archiveContent(): Promise<void> {
    await this.applyStatusToBatch('Archived', 'Archive this content across all selected communities?');
  }

  async unpublishContent(): Promise<void> {
    await this.applyStatusToBatch(
      'Draft',
      'Unpublish this content?\n\nIt will move to Draft and leave the patient Community.'
    );
  }

  async persist(status: CommunityContentStatus): Promise<void> {
    this.submitted = true;
    this.lastError = null;
    this.form.markAllAsTouched();
    this.syncBodyFields();

    if (!(this.form.get('title')?.value || '').trim()) {
      this.lastError = 'Title is required.';
      return;
    }
    if (!this.selectedCommunities.length) {
      this.lastError = 'Select at least one community.';
      return;
    }
    if (this.contentType === 'article' && !this.resolvePlainBody()) {
      this.lastError = 'Article content is required.';
      return;
    }
    if ((status === 'Published' || status === 'Scheduled') && !this.canPublish) {
      this.lastError = 'Publishing checklist is incomplete.';
      return;
    }
    if (status === 'Scheduled' && !this.canSchedule) {
      this.lastError = 'Schedule time must be in the future.';
      return;
    }
    if (this.uploadProgress.state === 'uploading') {
      this.lastError = 'Wait for the media upload to finish.';
      return;
    }
    if (this.uploadProgress.state === 'error') {
      this.lastError = 'Fix the failed media upload before continuing.';
      return;
    }

    this.isSaving = true;
    try {
      const mediaUrl =
        this.uploaded?.downloadURL ||
        this.existingMediaUrl() ||
        undefined;
      const mediaKind =
        this.uploaded?.kind ||
        (this.contentType === 'video'
          ? 'video'
          : this.contentType === 'image'
            ? 'image'
            : undefined);
      const bodyHtml = (this.form.get('bodyHtml')?.value || '').trim();
      const body = this.resolvePlainBody();
      const scheduledAt = status === 'Scheduled' ? this.scheduleDate() : null;

      let result;
      if (this.isEditMode && this.contentBatchId) {
        result = await this.postService.syncCommunityContentBatch({
          contentBatchId: this.contentBatchId,
          existingPosts: this.batchPosts.length ? this.batchPosts : this.existingPost ? [this.existingPost] : [],
          title: this.form.get('title')!.value,
          body,
          bodyHtml,
          communities: this.selectedCommunities,
          contentType: this.contentType,
          status,
          mediaDownloadURL: mediaUrl,
          mediaKind,
          scheduledAt,
        });
      } else {
        result = await this.postService.publishCommunityContent({
          title: this.form.get('title')!.value,
          body,
          bodyHtml,
          communities: this.selectedCommunities,
          contentType: this.contentType,
          status,
          mediaDownloadURL: mediaUrl,
          mediaKind,
          scheduledAt,
          contentBatchId: this.contentBatchId || newContentBatchId(),
        });
      }

      if (!result.verified) {
        throw new Error(
          'Content was written but backend verification failed. Refresh the library and retry.'
        );
      }

      const successTitle =
        status === 'Published'
          ? 'Published'
          : status === 'Scheduled'
            ? 'Scheduled'
            : 'Draft saved';
      const successMsg =
        status === 'Published'
          ? `Content is live in ${result.postIds.length} community feed(s).`
          : status === 'Scheduled'
            ? `Scheduled for ${this.scheduleDate()?.toLocaleString()} across ${result.postIds.length} community feed(s).`
            : `Draft saved (${result.postIds.length} record(s)).`;

      this.notif.create('success', successTitle, successMsg, SUCCESS_NOTIFICATION_BOX_POSITION);
      await this.router.navigate(['/content'], {
        queryParams:
          status === 'Scheduled'
            ? { status: 'Scheduled' }
            : status === 'Draft'
              ? { status: 'Draft' }
              : {},
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : displayNotificationMessage('error', 'save community content');
      this.lastError = message;
      this.notif.create(
        'error',
        status === 'Published' ? 'Publishing failed' : 'Save failed',
        message,
        ERROR_NOTIFICATION_BOX_POSITION
      );
    } finally {
      this.isSaving = false;
    }
  }

  cancel(): void {
    void this.router.navigate(['/content']);
  }

  private async applyStatusToBatch(
    status: CommunityContentStatus,
    confirmMessage: string
  ): Promise<void> {
    if (!this.editPostId) return;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;
    this.isSaving = true;
    this.lastError = null;
    try {
      const targets =
        this.batchPosts.length > 0
          ? this.batchPosts
          : this.existingPost
            ? [this.existingPost]
            : [];
      for (const post of targets) {
        if (!post.id) continue;
        const result = await this.postService.setContentStatus(post.id, status);
        if (!result.verified) {
          throw new Error(`Could not verify ${status} for ${post.id}.`);
        }
      }
      this.notif.create(
        'success',
        status === 'Archived' ? 'Archived' : 'Unpublished',
        status === 'Archived'
          ? 'Content archived across communities.'
          : 'Content moved to Draft across communities.',
        SUCCESS_NOTIFICATION_BOX_POSITION
      );
      await this.router.navigate(['/content'], {
        queryParams: { status: status === 'Archived' ? 'Archived' : 'Draft' },
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Status update failed.';
    } finally {
      this.isSaving = false;
    }
  }

  private async loadExisting(id: string): Promise<void> {
    this.isLoadingExisting = true;
    try {
      const post = await this.postService.getPostById(id);
      if (!post) {
        this.lastError = 'Content not found.';
        return;
      }
      this.existingPost = post;
      this.contentBatchId = post.contentBatchId || newContentBatchId();
      if (post.contentBatchId) {
        this.batchPosts = await this.postService.getPostsByBatchId(post.contentBatchId);
      } else {
        this.batchPosts = [post];
      }

      const communityIds =
        this.batchPosts.map((p) => p.groupName).filter(Boolean).length > 0
          ? Array.from(new Set(this.batchPosts.map((p) => p.groupName).filter(Boolean)))
          : post.communities?.length
            ? post.communities
            : post.groupName
              ? [post.groupName]
              : [];

      const type = this.inferType(post);
      const plainBody = this.stripTitleFromBody(post.title, post.text);
      const bodyHtml = post.bodyHtml?.trim()
        ? post.bodyHtml
        : plainTextToEditorHtml(plainBody);

      this.form.patchValue({
        contentType: type,
        title: post.title || (post.text || '').split('\n')[0] || '',
        body: plainBody,
        bodyHtml,
        communities: communityIds,
        scheduledAtLocal: post.scheduledAt
          ? this.toLocalInputValue(this.asDate(post.scheduledAt) || new Date())
          : this.form.get('scheduledAtLocal')?.value,
      });
      this.applyTypeValidators(type);
      if (post.videoUrl || post.mediaUrl || post.mediaUrls?.[0]) {
        this.uploadProgress = { progress: 100, state: 'success' };
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Failed to load content.';
    } finally {
      this.isLoadingExisting = false;
    }
  }

  private syncBodyFields(): void {
    const html = (this.form.get('bodyHtml')?.value || '').trim();
    if (html) {
      this.form.get('body')?.setValue(htmlToPlainText(html), { emitEvent: false });
    }
  }

  private resolvePlainBody(): string {
    const html = (this.form.get('bodyHtml')?.value || '').trim();
    if (html) return htmlToPlainText(html);
    return (this.form.get('body')?.value || '').trim();
  }

  private scheduleDate(): Date | null {
    const raw = (this.form.get('scheduledAtLocal')?.value || '').trim();
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toLocalInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private asDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private stripTitleFromBody(title: string | undefined, text: string | undefined): string {
    const body = (text || '').trim();
    const t = (title || '').trim();
    if (t && body.startsWith(t)) {
      return body.slice(t.length).replace(/^\n+/, '').trim();
    }
    return body;
  }

  private inferType(post: IGroupPost): CommunityContentType {
    if (post.contentType === 'article' || post.contentType === 'video' || post.contentType === 'image') {
      return post.contentType;
    }
    if (post.videoUrl || post.mediaType === 'Video') return 'video';
    if (post.mediaUrl || (post.mediaUrls && post.mediaUrls.length) || post.mediaType === 'Picture') {
      return 'image';
    }
    return 'article';
  }

  private existingMediaUrl(): string | null {
    if (!this.existingPost) return null;
    return (
      this.existingPost.videoUrl ||
      this.existingPost.mediaUrl ||
      this.existingPost.mediaUrls?.[0] ||
      null
    );
  }

  private mediaKindForType(type: CommunityContentType): 'image' | 'video' | null {
    if (type === 'video') return 'video';
    if (type === 'image') return 'image';
    return null;
  }

  private applyTypeValidators(type: CommunityContentType): void {
    const body = this.form.get('body');
    const bodyHtml = this.form.get('bodyHtml');
    if (type === 'article') {
      body?.setValidators([Validators.required]);
      bodyHtml?.setValidators([Validators.required]);
    } else {
      body?.clearValidators();
      bodyHtml?.clearValidators();
    }
    body?.updateValueAndValidity({ emitEvent: false });
    bodyHtml?.updateValueAndValidity({ emitEvent: false });
  }

  private revokeLocalPreview(): void {
    if (this.rawObjectUrl) {
      URL.revokeObjectURL(this.rawObjectUrl);
      this.rawObjectUrl = null;
    }
  }
}
