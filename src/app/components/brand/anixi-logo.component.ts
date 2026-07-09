import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-anixi-logo',
  standalone: false,
  templateUrl: './anixi-logo.component.html',
  styleUrl: './anixi-logo.component.css',
})
export class AnixiLogoComponent {
  @Input() variant: 'sidebar' | 'auth' = 'sidebar';
  @Input() tagline = 'Admin Portal';
  @Input() showWordmark = true;
  @Input() showTagline = true;
}
