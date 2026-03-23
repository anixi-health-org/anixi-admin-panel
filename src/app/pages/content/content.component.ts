import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';

const contentCards = [
  {index: '0' , label: 'Total Articles', value: '312' },
  {index: '1' , label: 'Published', value: '245' },
  {index: '2' , label: 'Scheduled', value: '28' },
  {index: '3' , label: 'Drafts', value: '39' },
];




@Component({
  selector: 'app-content',
  standalone: false,
  
  templateUrl: './content.component.html',
  styleUrl: './content.component.css'
})
export class ContentComponent {
  cards = contentCards;
  search = new FormControl('');


  getColorByStatus(status: string) {
    switch(status) {
      case 'Published':
        return {
          bgColor: '#ebf6f0',
          color: '#2cab6f'
        }
      case 'Schedule':
        return {
          bgColor:  '#2cab6f',
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
}
