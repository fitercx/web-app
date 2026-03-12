/**
 * File Metadata Request interface for S3 presigned URL generation
 */
export interface FileMetadataRequest {
  /** Frontend-generated UUID for request-response correlation */
  uploadCorrelationId: string;
  /** Name of the file to upload */
  fileName: string;
  /** MIME content type of the file */
  contentType: string;
  /** Size of the file in bytes */
  fileSize: number;
}

/**
 * Presigned URL Response from the backend
 */
export interface PresignedUrlResponse {
  /** Correlation ID matching the request */
  uploadCorrelationId: string;
  /** Presigned PUT URL for direct upload to S3 */
  presignedUrl: string;
  /** Expiration time for the presigned URL */
  expiresAt?: string;
}

/**
 * File upload status tracking
 */
export interface FileUploadStatus {
  /** Unique identifier for this file upload */
  uploadCorrelationId: string;
  /** Original file object */
  file: File;
  /** Presigned URL for uploading */
  presignedUrl?: string;
  /** Current upload status */
  status: 'pending' | 'getting-url' | 'uploading' | 'completed' | 'error';
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Error message if upload failed */
  errorMessage?: string;
  /** Preview URL for images */
  previewUrl?: string;
}
