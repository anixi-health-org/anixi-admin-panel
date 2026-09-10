import { Component, OnDestroy, OnInit } from '@angular/core';
import { Form, FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { COMMUNITIES, displayNotificationMessage, ERROR_NOTIFICATION_BOX_POSITION, markAllFormControlsAsTouched, SUCCESS_NOTIFICATION_BOX_POSITION } from '../../../../const';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { PostService } from '../../services/post.service';
import { MediaUploadService } from '../../services/media-upload.service';
import { IGroupPost } from '../../../interfaces/IgroupPost';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../services/auth.service';

const contentCards = [
  { index: '0', label: 'Total Posts', value: 0 },
  { index: '1', label: 'Published', value: 0 },
  { index: '2', label: 'Drafts', value: 0 },
  { index: '3', label: 'Scheduled', value: 0 },
];

const categories = [
  {name:'Diabetes'}, {name:'HIV/AIDS'}, 
  {name:'Mental Heath'}, {name: 'Hypertension'}, 
  {name:'Respiratory'}, {name:'Cancer'}
];






@Component({
  selector: 'app-content',
  standalone: false,
  templateUrl: './content.component.html',
  styleUrl: './content.component.css'
})
export class ContentComponent implements OnInit, OnDestroy{
  cards = contentCards;
  search = new FormControl('');
  menuItemStatus = new FormControl('All Status');
  typeFilter = new FormControl('All');
  communityFilter = new FormControl('All');
  pageTitle = 'Community';
  pageSubtitle = 'Create and manage health content published to Anixi patient communities.';
  scheduledAutomationNote = false;
  isVisible = false;
  categories = categories;
  articleElement!: FormGroup;
  selectedFile?: File;
  mediaUrl!: string;
  previewUrl!: SafeUrl | null;
  fileType!: string | null;
  private rawUrl: string | null = null;
  communities = COMMUNITIES;
  submitted = false;
  isLoading = false;
  isLoadingSkeleton = true;
  totalPost = 0;
  publishedCount = 0;
  scheduledCount = 0;
  draftCount = 0;
  mediaType!: string;
  previewModalVisible = false;
  isDeleteModalVisible = false;
  contentMode: 'article' | 'notification' = 'article';
  // posts$!: Observable<any[]>;
  posts: IGroupPost[] = [];
  post!: IGroupPost;
  isDeleted = false;

  constructor(private fb: FormBuilder,
  private notif: NzNotificationService,
  private mediaUpload: MediaUploadService,
  private postService: PostService,
  private sanitizer: DomSanitizer,
  private messageService: NzMessageService,
  private authService: AuthService,
  private route: ActivatedRoute,
  private router: Router
) {}

  ngOnInit(): void {
    this.articleElement = this.fb.group({
      title: ['', Validators.required],
      content: ['', Validators.required],
      communities: this.fb.array([], Validators.required)
    });
    this.isLoadingSkeleton = true;
     this.postService.fetchAdminPost(this.authService.getAdminUserId() ?? undefined).subscribe(res => {
      const data = res.data;
      this.totalPost = data.length;
      this.publishedCount = data.filter((post) => (post.status ?? 'Published') === 'Published').length;
      this.scheduledCount = data.filter((post) => post.status === 'Scheduled').length;
      this.draftCount = data.filter((post) => post.status === 'Draft').length;
      this.posts = data.sort((a, b) => {
        return b.timeStamp.toDate() - a.timeStamp.toDate();
      });
      this.isLoadingSkeleton = res.loading;
     });

    this.route.queryParamMap.subscribe((params) => {
      const action = params.get('action');
      if (action === 'create' || action === 'notify') {
        void this.router.navigate(['/content/new']);
        return;
      }

      const status = params.get('status');
      if (status === 'Published' || status === 'Draft' || status === 'Scheduled' || status === 'Archived') {
        this.setMenuItemValue(status);
        this.pageTitle =
          status === 'Draft'
            ? 'Drafts'
            : status === 'Published'
              ? 'Published'
              : status === 'Scheduled'
                ? 'Scheduled'
                : 'Archived';
        this.pageSubtitle =
          status === 'Scheduled'
            ? 'Scheduled posts auto-publish at their set time (checked every few minutes).'
            : status === 'Draft'
              ? 'Continue editing drafts, then publish when ready.'
              : status === 'Published'
                ? 'Content currently visible in the patient Community.'
                : 'Archived community content.';
        this.scheduledAutomationNote = status === 'Scheduled';
      } else {
        this.pageTitle = 'Community';
        this.pageSubtitle =
          'Create and manage health content published to Anixi patient communities.';
        this.scheduledAutomationNote = false;
      }

      const filter = params.get('filter');
      if (filter === 'reported') {
        this.setMenuItemValue('Reported');
      }
    });
  }

  ngOnDestroy(): void {
    if (this.rawUrl) {
      URL.revokeObjectURL(this.rawUrl);
    }
    this.setModalBodyLock(false);
  }
  getColorByStatus(status: string) {
    switch(status) {
      case 'Published':
        return {
          bgColor: '#ebf6f0',
          color: '#2cab6f'
        }
      case 'Scheduled':
        return {
          bgColor:  '#eaf5fb',
          color: '#269ed9',
        }
      case 'Draft':
        return {
          bgColor: '#f9fafb',
          color: '#66758a'
        }
      default:
        return {
          bgColor: '#f1f2f4',
          color: '#9da7b4'
        }
    }
  }
   setMenuItemValue(value:string) {
      this.menuItemStatus.setValue(value);
    }

    postMatchesFilter(post: IGroupPost): boolean {
      const filter = this.menuItemStatus.value;
      if (filter === 'All Status') {
        return true;
      }
      if (filter === 'Reported') {
        return post.reported === true;
      }
      return (post?.status || 'Published') === filter;
    }

    postMatchesType(post: IGroupPost): boolean {
      const filter = this.typeFilter.value;
      if (!filter || filter === 'All') return true;
      return this.contentTypeLabel(post).toLowerCase() === filter.toLowerCase();
    }

    postMatchesCommunity(post: IGroupPost): boolean {
      const filter = this.communityFilter.value;
      if (!filter || filter === 'All') return true;
      return (post.groupName || '') === filter;
    }

    postMatchesSearch(post: IGroupPost): boolean {
      const query = (this.search.value || '').trim().toLowerCase();
      if (!query) {
        return true;
      }
      const title = (post.title || '').toLowerCase();
      const text = (post.text || '').toLowerCase();
      const group = (post.groupName || '').toLowerCase();
      const author = (post.userName || '').toLowerCase();
      return (
        title.includes(query) ||
        text.includes(query) ||
        group.includes(query) ||
        author.includes(query)
      );
    }

    postIsVisible(post: IGroupPost): boolean {
      return (
        this.postMatchesFilter(post) &&
        this.postMatchesType(post) &&
        this.postMatchesCommunity(post) &&
        this.postMatchesSearch(post)
      );
    }

    visiblePosts(): IGroupPost[] {
      return this.posts.filter((post) => this.postIsVisible(post));
    }

    postDate(post: IGroupPost): Date | null {
      const ts = post.timeStamp;
      if (ts && typeof ts.toDate === 'function') return ts.toDate();
      return null;
    }

    async publishPost(post: IGroupPost): Promise<void> {
      const confirmed = window.confirm(
        'Publish this content?\n\nIt will become visible to patients in the assigned community.'
      );
      if (!confirmed) return;
      try {
        const result = await this.postService.setContentStatus(post.id, 'Published');
        if (!result.verified) throw new Error('Publish was not confirmed by the API.');
        this.messageService.success('Published and verified in backend.');
      } catch (error) {
        this.notif.create(
          'error',
          'Publish failed',
          error instanceof Error ? error.message : 'Could not publish.',
          ERROR_NOTIFICATION_BOX_POSITION
        );
      }
    }

    async archivePost(post: IGroupPost): Promise<void> {
      const confirmed = window.confirm(
        'Archive this content?\n\nIt will no longer appear in the patient Community.'
      );
      if (!confirmed) return;
      try {
        const result = await this.postService.setContentStatus(post.id, 'Archived');
        if (!result.verified) throw new Error('Archive was not confirmed by the API.');
        this.messageService.success('Archived and verified in backend.');
      } catch (error) {
        this.notif.create(
          'error',
          'Archive failed',
          error instanceof Error ? error.message : 'Could not archive.',
          ERROR_NOTIFICATION_BOX_POSITION
        );
      }
    }

    async unpublishPost(post: IGroupPost): Promise<void> {
      const confirmed = window.confirm(
        'Unpublish this content?\n\nIt will move back to Draft and leave the patient Community.'
      );
      if (!confirmed) return;
      try {
        const result = await this.postService.setContentStatus(post.id, 'Draft');
        if (!result.verified) throw new Error('Unpublish was not confirmed by the API.');
        this.messageService.success('Moved to Draft and verified in backend.');
      } catch (error) {
        this.notif.create(
          'error',
          'Unpublish failed',
          error instanceof Error ? error.message : 'Could not unpublish.',
          ERROR_NOTIFICATION_BOX_POSITION
        );
      }
    }

    showModal() {
      void this.router.navigate(['/content/new']);
    }

    openCreateModal(_mode: 'article' | 'notification') {
      void this.router.navigate(['/content/new']);
    }

    contentTypeLabel(post: IGroupPost): string {
      if (post.contentType) {
        return post.contentType.charAt(0).toUpperCase() + post.contentType.slice(1);
      }
      if (post.videoUrl || post.mediaType === 'Video') return 'Video';
      if (post.mediaUrl || post.mediaType === 'Picture' || (post.mediaUrls && post.mediaUrls.length)) {
        return 'Image';
      }
      return 'Article';
    }

    mediaPreviewUrl(post: IGroupPost): string | null {
      return post.videoUrl || post.mediaUrl || post.mediaUrls?.[0] || null;
    }

    isVideoPost(post: IGroupPost): boolean {
      return !!(post.videoUrl || post.mediaType === 'Video' || post.contentType === 'video');
    }

    editPost(postId: string) {
      void this.router.navigate(['/content', postId, 'edit']);
    }

    private resetComposeForm(): void {
      this.submitted = false;
      this.isLoading = false;
      this.previewUrl = null;
      this.fileType = null;
      this.selectedFile = undefined;
      if (this.rawUrl) {
        URL.revokeObjectURL(this.rawUrl);
        this.rawUrl = null;
      }
      this.communitiesFormArray.clear();
      this.articleElement.reset({
        title: '',
        content: '',
      });
    }

    handleCancel() {
      this.isVisible = false;
      this.previewModalVisible = false;
      this.isDeleteModalVisible = false;
      this.submitted = false;
      this.isLoading = false;
      this.setModalBodyLock(false);
      this.clearComposeQueryParams();
      this.resetComposeForm();
    }

    private setModalBodyLock(locked: boolean): void {
      document.body.classList.toggle('content-modal-open', locked);
    }

    private clearComposeQueryParams(): void {
      const action = this.route.snapshot.queryParamMap.get('action');
      if (action !== 'create' && action !== 'notify') {
        return;
      }

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { action: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    onFileSelected(event: Event): void {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      this.selectedFile = file;
      this.previewFile(file);
    }

    get communitiesFormArray() {
      return this.articleElement.controls['communities'] as FormArray;
    }

    previewFile(file:File) {
      // remove the old url to avoid leaks
      if (this.rawUrl) URL.revokeObjectURL(this.rawUrl);
      this.fileType = file.type.split('/')[0];

      this.rawUrl = URL.createObjectURL(file);
      this.previewUrl = this.sanitizer.bypassSecurityTrustUrl(this.rawUrl);
    }

    onCheckBoxChange(event: Event) {
      const checkbox = event.target as HTMLInputElement;
      const value = checkbox.value;
      const checked = checkbox.checked;

      if (checked) {
        this.communitiesFormArray.push(new FormControl(value));
      } else {
        const index = this.communitiesFormArray.controls.findIndex(ctrl => ctrl.value === value);
        if (index > -1) {
          this.communitiesFormArray.removeAt(index);
        }
      }
    }

    async onSubmit() {
      this.isLoading = true;
      try {
        this.submitted = true;
        if (this.articleElement.invalid) {
         markAllFormControlsAsTouched(this.articleElement);
         this.isLoading = false;
         return;
        }
        if (this.selectedFile) {
            this.mediaUrl = await this.uploadFile(this.selectedFile, 
              this.communitiesFormArray.value[0]);
        }
        const communities = this.communitiesFormArray.controls;
        if (this.fileType) {
          this.mediaType = this.getMediaType(this.fileType);
        }
        const title = this.articleElement.get('title')?.value;
        const text = this.articleElement.get('content')?.value;
        for (let community of communities) {
          const postId = Date.now().toString();
          const postData: Partial<IGroupPost> = {
            id: postId,
            title: title,
            firstName: "admin",
            userName: 'anixi health',
            text: text,
            groupName: community.value,
            lastName: "anixihealth",
            postType: "Post",
            mediaType: this.mediaType || '',
            mediaUrl: this.mediaUrl || '',
            status: "Published"
          }
          await this.postService.saveGroupPost(postId, postData);
        }
        this.isLoading = false;
        this.isVisible = false;
        this.setModalBodyLock(false);
        this.clearComposeQueryParams();
        this.notif.create(
          'success',
          'Success',
          displayNotificationMessage('success', 'Post published'),
          SUCCESS_NOTIFICATION_BOX_POSITION
        );
        this.resetComposeForm();
        
      } catch (error) {
        this.isLoading = false;
        this.notif.create(
          'error',
          'Error',
          displayNotificationMessage('Error', 'Failed to published the post'),
          ERROR_NOTIFICATION_BOX_POSITION
        )
      }
    }

    async uploadFile(file: File, groupId: string): Promise<string> {
      const kind = (file.type || '').startsWith('video/') ? 'video' : 'image';
      const result = await this.mediaUpload.uploadCommunityMedia(file, groupId, kind);
      return result.downloadURL;
    }

    cancel() {
      this.messageService.info('Delete post canceled');
    }
    async deletePost(postId: string) {
      try {
        await this.postService.deleteGroupPost(postId);
        this.isDeleted = true;
        this.messageService.success('Post deleted successfully');
      } catch(error) {
        this.notif.create(
          'error',
          'Failed',
          displayNotificationMessage('Error', 'Failed to delete post'),
          ERROR_NOTIFICATION_BOX_POSITION
        );
      }
    }

    getMediaType(filetype: string | null) {
      switch(filetype) {
        case 'image' :
          return 'Picture';
        case 'video':
          return 'Video'
        default:
          return '';
      }  
    }

    getPostTitle(title?:string, text?: string) {
      if (!title && text?.length == 0)
        return 'No title';
      if (title) 
        return title
      if (!title && text)
        return `${text.substring(0, 60)}....`;
      return  'No title';
    }

    getCardValue(label: string): number {
      switch (label) {
        case 'Total Posts':
          return this.totalPost;
        case 'Published':
          return this.publishedCount;
        case 'Scheduled':
          return this.scheduledCount;
        case 'Drafts':
          return this.draftCount;
        default:
          return 0;
      }
    }



    openPreview(post: IGroupPost) {
      this.post = post;
      this.previewModalVisible = true;
    }
    
}
