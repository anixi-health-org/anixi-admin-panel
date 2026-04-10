import { Component, EnvironmentInjector, OnInit, runInInjectionContext } from '@angular/core';
import { Form, FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { COMMUNITIES, displayNotificationMessage, ERROR_NOTIFICATION_BOX_POSITION, markAllFormControlsAsTouched } from '../../../../const';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { ref } from 'firebase/storage';
import { getDownloadURL, Storage, uploadBytes } from '@angular/fire/storage';
import { PostService } from '../../services/post.service';
import { IGroupPost } from '../../../interfaces/IgroupPost';

const contentCards = [
  {index: '0' , label: 'Total Posts', value: '312' },
  {index: '1' , label: 'Published', value: '245' },
  {index: '2' , label: 'Scheduled', value: '28' },
  {index: '3' , label: 'Drafts', value: '39' },
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
export class ContentComponent implements OnInit{
  cards = contentCards;
  articles = articles;
  search = new FormControl('');
  menuItemStatus = new FormControl('All Status');
  isVisible = false;
  categories = categories;
  articleElement!: FormGroup;
  selectedFile!: File;
  imageUrl!: string;
  previewUrl!: string | ArrayBuffer | null;
  communities = COMMUNITIES;
  submitted = false;
  isLoading = false;

  constructor(private fb: FormBuilder, 
    private envInjector: EnvironmentInjector,
  private notif: NzNotificationService,
  private storage: Storage,
  private postService: PostService
) {}

  ngOnInit(): void {
    this.articleElement = this.fb.group({
      title: ['', Validators.required],
      content: ['', Validators.required],
      // categories: [this.categories[1], Validators.required],
      // date: ['', Validators.required],
      communities: this.fb.array([], Validators.required)
    })
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

    showModal() {
      this.isVisible = true
    }
    handleCancel() {
      this.isVisible = false;
    }

    beforeUpload = (file:File): boolean => {
      this.selectedFile = file;
      this.previewFile(file);
      return false;
    }

    get communitiesFormArray() {
      return this.articleElement.controls['communities'] as FormArray;
    }

    previewFile(file:File) {
      const reader = new FileReader();
      reader.onload = () => {
        this.previewUrl = reader.result;
      };
      reader.readAsDataURL(file);
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
      try {
        this.isLoading = true;
        this.submitted = true;
        if (this.articleElement.invalid) {
         markAllFormControlsAsTouched(this.articleElement);
         return;
        }
        if (this.selectedFile) {
            this.imageUrl = await this.uploadFile(this.selectedFile, 
              this.communitiesFormArray.value[0]);
        }
        const communities = this.communitiesFormArray.controls;
        for (let community of communities) {
          const postData: Partial<IGroupPost> = {
            firstName: "anixi health",
            groupName: community.value,
            lastName: ,
            userId: ,
            postType: ,
            mediaType: ,
            mediaUrl: ,
            visibility: 
          }
          await this.postService.saveGroupPost(community.value, )
        }
        
      } catch (error) {
        this.isLoading = false;
        this.notif.create(
          'error',
          'Error',
          displayNotificationMessage('success', 'Failed to published the post'),
          ERROR_NOTIFICATION_BOX_POSITION
        )
      }
    }

    async uploadFile(file:File, groupId: string): Promise<string> {
      const filePath = `community-posts/${groupId}/${Date.now()}_${file.name}`;
      return await runInInjectionContext(this.envInjector, async () => {
        const fileRef = ref(this.storage, filePath);
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
      })
    }

}
