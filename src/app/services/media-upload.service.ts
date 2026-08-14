import { Injectable } from '@angular/core';
import {
  getDownloadURL,
  ref,
  Storage,
  uploadBytesResumable,
} from '@angular/fire/storage';

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
  constructor(private storage: Storage) {}

  validateFile(
    file: File,
    kind: MediaUploadKind
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
    groupId: string,
    kind: MediaUploadKind,
    onProgress?: (progress: MediaUploadProgress) => void
  ): Promise<MediaUploadResult> {
    const validation = this.validateFile(file, kind);
    if (!validation.ok) {
      onProgress?.({ progress: 0, state: 'error', error: validation.error });
      return Promise.reject(new Error(validation.error));
    }

    const contentType = file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
    const folder = kind === 'video' ? 'videos' : 'images';
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const storagePath = `community-posts/${groupId}/${folder}/${Date.now()}_${safeName}`;
    const fileRef = ref(this.storage, storagePath);
    const task = uploadBytesResumable(fileRef, file, { contentType });

    return new Promise((resolve, reject) => {
      onProgress?.({ progress: 0, state: 'uploading' });
      task.on(
        'state_changed',
        (snapshot) => {
          const progress =
            snapshot.totalBytes > 0
              ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              : 0;
          onProgress?.({ progress, state: 'uploading' });
        },
        (error) => {
          const message = error?.message || 'Upload failed.';
          onProgress?.({ progress: 0, state: 'error', error: message });
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(task.snapshot.ref);
            onProgress?.({ progress: 100, state: 'success' });
            resolve({
              downloadURL,
              storagePath,
              contentType,
              kind,
              fileName: file.name,
              size: file.size,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Could not get download URL.';
            onProgress?.({ progress: 0, state: 'error', error: message });
            reject(error);
          }
        }
      );
    });
  }
}
