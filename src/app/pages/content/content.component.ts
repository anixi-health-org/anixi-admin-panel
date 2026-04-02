import { Component, OnInit } from '@angular/core';
import { Form, FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';

const contentCards = [
  {index: '0' , label: 'Total Articles', value: '312' },
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

const communities = [
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
  previewUrl!: string | ArrayBuffer | null;
  communities = communities;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.articleElement = this.fb.group({
      title: ['', Validators.required],
      categories: [this.categories[1], Validators.required],
      date: ['', Validators.required],
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
}
