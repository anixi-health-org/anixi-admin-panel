import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-pdf-viewer',
  standalone: false,
  
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.css'
})
export class PdfViewerComponent implements OnInit {
  url: SafeResourceUrl | undefined;

  constructor(private route: ActivatedRoute,
    private sanitizer: DomSanitizer) {}
  ngOnInit(): void {
   const fileUrl = this.route.snapshot.queryParams['file'];

   if (fileUrl) {
    const finalUrl = `${fileUrl}#toolbar=0&navpanes=0`;
    this.url = this.sanitizer.bypassSecurityTrustResourceUrl(finalUrl);
   }
  }
}
