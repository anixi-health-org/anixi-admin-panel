import { Component } from '@angular/core';

const contentCards = [
  {index: '0' , label: 'Total Articles', value: '312' },
  {index: '1' , label: 'Published', value: '245' },
  {index: '2' , label: 'Scheduled', value: '28' },
  {index: '3' , label: 'Drafts', value: '39' },
]

@Component({
  selector: 'app-content',
  standalone: false,
  
  templateUrl: './content.component.html',
  styleUrl: './content.component.css'
})
export class ContentComponent {
  cards = contentCards;
}
