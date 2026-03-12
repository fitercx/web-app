/** Angular Imports */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** rxjs Imports */
import { Observable } from 'rxjs';

/** Models */
import { FileMetadataRequest, PresignedUrlResponse } from 'app/shared/models/file-upload.model';

/**
 * S3 Service for handling file uploads via presigned URLs
 */
@Injectable({
  providedIn: 'root'
})
export class S3Service {
  /**
   * @param {HttpClient} http Http Client to send requests
   */
  constructor(private http: HttpClient) {}

  /**
   * Generate presigned PUT URLs for batch file uploads
   * @param {FileMetadataRequest[]} fileMetadataList List of file metadata for which to generate presigned URLs
   * @returns {Observable<PresignedUrlResponse[]>} Observable containing the presigned URL responses
   */
  generatePresignedUrls(fileMetadataList: FileMetadataRequest[]): Observable<PresignedUrlResponse[]> {
    return this.http.post<PresignedUrlResponse[]>('/v1/s3/presigned-urls', { files: fileMetadataList });
  }

  /**
   * Upload a file directly to S3 using a presigned URL
   * Uses XMLHttpRequest to bypass Angular interceptors that add auth headers
   * @param {string} presignedUrl The presigned PUT URL
   * @param {File} file The file to upload
   * @param {function} onProgress Optional progress callback
   * @returns {Observable<any>} Observable for the upload request
   */
  uploadFileToS3(presignedUrl: string, file: File, onProgress?: (percent: number) => void): Observable<any> {
    return new Observable((observer) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log(`S3 upload successful for ${file.name}`);
          observer.next({ status: xhr.status, response: xhr.response });
          observer.complete();
        } else {
          console.error(`S3 upload failed for ${file.name}:`, xhr.status, xhr.statusText);
          observer.error({ status: xhr.status, statusText: xhr.statusText, response: xhr.response });
        }
      });

      xhr.addEventListener('error', () => {
        console.error(`S3 upload error for ${file.name}`);
        observer.error({ status: xhr.status, statusText: 'Network error' });
      });

      xhr.addEventListener('abort', () => {
        observer.error({ status: 0, statusText: 'Upload aborted' });
      });

      xhr.open('PUT', presignedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);

      // Return cleanup function
      return () => {
        xhr.abort();
      };
    });
  }

  /**
   * Generates a UUID v4 for correlation tracking
   * @returns {string} A randomly generated UUID
   */
  generateCorrelationId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Creates file metadata request from a File object
   * @param {File} file The file to create metadata for
   * @returns {FileMetadataRequest} The file metadata request object
   */
  createFileMetadata(file: File): FileMetadataRequest {
    return {
      uploadCorrelationId: this.generateCorrelationId(),
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    };
  }
}
