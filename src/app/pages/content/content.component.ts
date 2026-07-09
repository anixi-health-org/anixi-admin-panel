import { Component, EnvironmentInjector, OnDestroy, OnInit, runInInjectionContext } from '@angular/core';
import { Form, FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { COMMUNITIES, displayNotificationMessage, ERROR_NOTIFICATION_BOX_POSITION, markAllFormControlsAsTouched, SUCCESS_NOTIFICATION_BOX_POSITION } from '../../../../const';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { PostService } from '../../services/post.service';
import { IGroupPost } from '../../../interfaces/IgroupPost';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../services/auth.service';

const contentCards = [
  { index: '0', label: 'Total Posts', value: 0 },
  { index: '1', label: 'Published', value: 0 },
  { index: '2', label: 'Scheduled', value: 0 },
  { index: '3', label: 'Drafts', value: 0 },
];

const articles = [
  {title: 'Managing Diabetes in Summer', category: 'Diabetes',  communities: 'Diabetes', status: 'Published',  date: '2026-02-10'},
  {title: 'Understanding HIV Treatment Options', category: 'HIV/AIDS',  communities: 'HIV/AIDS', status: 'Published',  date: '2026-02-09'},
  {title: 'Mental Health: Breaking the Stigma', category: 'Mental Health',  communities: 'Mental Health', status: 'Scheduled',  date: '2026-02-08'},
  {title: 'Hypertension and Diet', category: 'Hypertension',  communities: 'Hypertension', status: 'Draft',  date: '2026-02-07'},
  {title: 'Living with Asthma: Daily tips', category: 'Respiratory',  communities: 'Respiratory Health', status: 'Published',  date: '2026-02-06'},
  {title: 'Cancer Screening Guidelines 2026', category: 'Cancer',  communities: 'Cancer', status: 'Draft',  date: '2026-02-05'},
  {title: 'Post-Partum Depression Awareness', category: 'Mental Health',  communities: 'Mental Health', status: 'Archived',  date: '2026-02-04'},
]

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
    private envInjector: EnvironmentInjector,
  private notif: NzNotificationService,
  private storage: Storage,
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
      // categories: [this.categories[1], Validators.required],
      // date: ['', Validators.required],
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
      if (action === 'create') {
        setTimeout(() => this.openCreateModal('article'));
      } else if (action === 'notify') {
        setTimeout(() => this.openCreateModal('notification'));
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

    postMatchesSearch(post: IGroupPost): boolean {
      const query = (this.search.value || '').trim().toLowerCase();
      if (!query) {
        return true;
      }
      const title = (post.title || '').toLowerCase();
      const text = (post.text || '').toLowerCase();
      const group = (post.groupName || '').toLowerCase();
      return title.includes(query) || text.includes(query) || group.includes(query);
    }

    postIsVisible(post: IGroupPost): boolean {
      return this.postMatchesFilter(post) && this.postMatchesSearch(post);
    }

    showModal() {
      this.openCreateModal('article');
    }

    openCreateModal(mode: 'article' | 'notification') {
      if (!this.articleElement) {
        return;
      }
      this.resetComposeForm();
      this.contentMode = mode;
      this.isVisible = true;
      this.setModalBodyLock(true);
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

    async uploadFile(file:File, groupId: string): Promise<string> {
      const filePath = `community-posts/${groupId}/${Date.now()}_${file.name}`;
      console.log(filePath);
      return await runInInjectionContext(this.envInjector, async () => {
        const fileRef = ref(this.storage, filePath);
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
      })
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

    async editPost(postId:string) {

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
