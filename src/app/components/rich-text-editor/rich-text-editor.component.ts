import {
  Component,
  ElementRef,
  forwardRef,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-rich-text-editor',
  standalone: false,
  templateUrl: './rich-text-editor.component.html',
  styleUrl: './rich-text-editor.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    },
  ],
})
export class RichTextEditorComponent implements ControlValueAccessor {
  @ViewChild('editor') editorRef!: ElementRef<HTMLDivElement>;

  disabled = false;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private lastHtml = '';

  writeValue(value: string | null): void {
    const html = value || '';
    this.lastHtml = html;
    queueMicrotask(() => {
      if (!this.editorRef?.nativeElement) return;
      if (this.editorRef.nativeElement.innerHTML !== html) {
        this.editorRef.nativeElement.innerHTML = html;
      }
    });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(): void {
    const html = this.editorRef.nativeElement.innerHTML;
    this.lastHtml = html;
    this.onChange(html);
  }

  onBlur(): void {
    this.onTouched();
  }

  exec(command: string, value?: string): void {
    if (this.disabled) return;
    this.editorRef.nativeElement.focus();
    document.execCommand(command, false, value);
    this.onInput();
  }

  applyHeading(): void {
    this.exec('formatBlock', 'h3');
  }

  applyParagraph(): void {
    this.exec('formatBlock', 'p');
  }

  applyLink(): void {
    if (this.disabled) return;
    const url = window.prompt('Enter link URL', 'https://');
    if (!url?.trim()) return;
    this.exec('createLink', url.trim());
  }
}

/** Convert editor HTML to patient-safe plain text. */
export function htmlToPlainText(html: string): string {
  if (!html?.trim()) return '';
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<\/\s*h[1-6]\s*>/gi, '\n\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*div\s*>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function plainTextToEditorHtml(text: string): string {
  const raw = (text || '').trim();
  if (!raw) return '';
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br>');
      return `<p>${lines || '<br>'}</p>`;
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
