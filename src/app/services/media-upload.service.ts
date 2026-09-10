import { Injectable } from '@angular/core';
import { DjangoApiService } from './django-api.service';

export type MediaUploadKind = 'image' | 'video';

export type MediaUploadProgress = {
  progress: number;
  state: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
};

export type MediaUploadResult = {
  downloadURL: string;
  storagePath: string;
  contentType: string;
  kind: MediaUploadKind;
  fileName: string;
  size: number;
};

@Injectable({ providedIn: 'root' })
export class MediaUploadService {
  constructor(private djangoApi: DjangoApiService) {}

  validateFile(
    file: File,
    kind: MediaUploadKind,
  ): { ok: true } | { ok: false; error: string } {
    const type = (file.type || '').toLowerCase();
    if (kind === 'image') {
      if (!type.startsWith('image/')) {
        return { ok: false, error: 'Please choose an image file (JPG, PNG, WEBP, etc.).' };
      }
      if (file.size > 15 * 1024 * 1024) {
        return { ok: false, error: 'Images must be under 15 MB.' };
      }
    } else {
      if (!type.startsWith('video/')) {
        return { ok: false, error: 'Please choose a video file (MP4, MOV, etc.).' };
      }
      if (file.size > 95 * 1024 * 1024) {
        return { ok: false, error: 'Videos must be under 95 MB.' };
      }
    }
    return { ok: true };
  }

  uploadCommunityMedia(
    file: File,
    _groupId: string,
    kind: MediaUploadKind,
    onProgress?: (progress: MediaUploadProgress) => void,
  ): Promise<MediaUploadResult> {
    const validation = this.validateFile(file, kind);
    if (!validation.ok) {
      onProgress?.({ progress: 0, state: 'error', error: validation.error });
      return Promise.reject(new Error(validation.error));
    }

    onProgress?.({ progress: 10, state: 'uploading' });
    return this.djangoApi
      .uploadDocument(file, 'community-post')
      .then((result) => {
        onProgress?.({ progress: 100, state: 'success' });
        return {
          downloadURL: result.url,
          storagePath: result.storageKey,
          contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
          kind,
          fileName: file.name,
          size: file.size,
        };
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Upload failed.';
        onProgress?.({ progress: 0, state: 'error', error: message });
        throw error;
      });
  }
}
