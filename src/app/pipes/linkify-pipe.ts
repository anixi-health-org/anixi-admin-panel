import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import linkifyHtml from 'linkify-html';

@Pipe({
  name: 'linkify',
  standalone: false,
})
export class LinkifyPipe implements PipeTransform {

  private sanitizer = inject(DomSanitizer);
  transform(value: string | null): SafeHtml {
    if (!value) return '';
    
    const options = {
      target: '_blank',
      className:'linkified'
    };
    const linkifiedText = linkifyHtml(value, options);
    return this.sanitizer.bypassSecurityTrustHtml(linkifiedText);
  }

}
