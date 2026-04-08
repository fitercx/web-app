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
  /** Resource type (e.g., 'clients', 'loans') */
  resourceType: string;
  /** Resource ID (e.g., clientId, loanId) */
  resourceId: number;
  /** Parent resource ID (e.g., clientId for loans) - optional */
  parentResourceId?: number;
}

/**
 * Presigned URL Response from the backend
 */
export interface PresignedUrlResponse {
  /** Correlation ID matching the request */
  uploadCorrelationId: string;
  /** Presigned PUT URL for direct upload to S3 */
  presignedUrl: string;
  /** S3 object key for the uploaded file */
  objectKey?: string;
  /** Expiration time for the presigned URL */
  expiresAt?: string;
  /** Expiration in seconds */
  expiresInSeconds?: number;
  /** Whether the presigned URL was generated successfully */
  success?: boolean;
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
  /** S3 object key after upload */
  s3ObjectKey?: string;
  /** Current upload status */
  status: 'pending' | 'getting-url' | 'uploading' | 'completed' | 'error';
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Error message if upload failed */
  errorMessage?: string;
  /** Preview URL for images */
  previewUrl?: string;
}

/**
 * Document attachment for note creation
 */
export interface NoteDocumentAttachment {
  /** Frontend-generated UUID for correlation */
  uploadCorrelationId: string;
  /** Name of the file */
  fileName: string;
  /** Size of the file in bytes */
  size: number;
  /** MIME content type */
  contentType: string;
  /** S3 object key */
  s3ObjectKey: string;
  /** Optional description */
  description?: string;
}

/**
 * Request payload for creating note with documents
 */
export interface CreateNoteWithDocumentsRequest {
  /** Note text content */
  note: string;
  /** Array of document attachments */
  documents: NoteDocumentAttachment[];
}
