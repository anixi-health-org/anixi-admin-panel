import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-pdf-viewer',
  standalone: false,

  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.css',
})
export class PdfViewerComponent implements OnInit {
  safeUrl: SafeResourceUrl | undefined;
  rawUrl = '';
  fileName = 'document';
  isImage = false;
  isPdf = false;
  hasError = false;
  isDownloading = false;

  constructor(
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    const fileUrl = this.route.snapshot.queryParams['file'];
    const providedName = this.route.snapshot.queryParams['name'];

    if (!fileUrl) {
      this.hasError = true;
      return;
    }

    this.rawUrl = fileUrl;
    this.fileName = providedName || this.deriveFileName(fileUrl);
    const extension = this.getExtension(this.fileName) || this.getExtension(fileUrl);
    this.isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(extension);
    this.isPdf = extension === 'pdf' || !this.isImage;

    if (this.isPdf) {
      const finalUrl = `${fileUrl}#toolbar=1&navpanes=0`;
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(finalUrl);
    }
  }

  openInNewTab(): void {
    window.open(this.rawUrl, '_blank', 'noopener,noreferrer');
  }

  async download(): Promise<void> {
    if (this.isDownloading || !this.rawUrl) return;
    this.isDownloading = true;
    try {
      const response = await fetch(this.rawUrl);
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.triggerDownload(objectUrl);
      URL.revokeObjectURL(objectUrl);
    } catch {
      this.triggerDownload(this.rawUrl, true);
    } finally {
      this.isDownloading = false;
    }
  }

  onLoadError(): void {
    this.hasError = true;
  }

  private triggerDownload(href: string, external = false): void {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = this.fileName;
    if (external) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  private deriveFileName(url: string): string {
    try {
      const parsed = new URL(url);
      const path = decodeURIComponent(parsed.pathname);
      return path.split('/').filter(Boolean).pop() || 'document';
    } catch {
      const clean = url.split('?')[0];
      return decodeURIComponent(clean.split('/').pop() || 'document');
    }
  }

  private getExtension(value: string): string {
    const clean = value.split('?')[0].split('#')[0];
    const parts = clean.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }
}
