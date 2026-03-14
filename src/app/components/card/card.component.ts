import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: false,
  
  templateUrl: './card.component.html',
  styleUrl: './card.component.css'
})
export class CardComponent {
  @Input() cardValue!: any;



  warningMessage(label:string, value: string): string {
    if (label === 'Report Pending') {
      return 'needs review'
    }
    if (label === 'Doctors Pending' && Number(value) > 0 )
      return 'awaiting';
    return '';
  }
}
