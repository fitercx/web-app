import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ClientsService } from 'app/clients/clients.service';
import { GroupsService } from 'app/groups/groups.service';
import { LoansService } from 'app/loans/loans.service';
import { SavingsService } from 'app/savings/savings.service';
import { DeleteDialogComponent } from 'app/shared/delete-dialog/delete-dialog.component';
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { S3Service } from 'app/core/services/s3.service';
import {
  FileUploadStatus,
  FileMetadataRequest,
  PresignedUrlResponse,
  NoteDocumentAttachment,
  CreateNoteWithDocumentsRequest
} from 'app/shared/models/file-upload.model';

@Component({
  selector: 'mifosx-entity-notes-tab',
  templateUrl: './entity-notes-tab.component.html',
  styleUrls: ['./entity-notes-tab.component.scss']
})
export class EntityNotesTabComponent implements OnInit {
  @ViewChild('formRef', { static: true }) formRef: any;

  @Input() entityId: string;
  @Input() entityNotes: any;

  @Input() callbackAdd: (note: any) => void;
  @Input() callbackAddWithDocuments: (noteData: CreateNoteWithDocumentsRequest) => void;
  @Input() callbackEdit: (noteId: string, note: string, index: number) => void;
  @Input() callbackDelete: (noteId: string, index: number) => void;

  noteForm: UntypedFormGroup;

  /** File upload properties */
  selectedFiles: FileUploadStatus[] = [];
  isDragOver = false;
  acceptedImageTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  constructor(
    private formBuilder: UntypedFormBuilder,
    private savingsService: SavingsService,
    private loansService: LoansService,
    private clientsService: ClientsService,
    private groupsService: GroupsService,
    private dialog: MatDialog,
    private s3Service: S3Service
  ) {}

  ngOnInit() {
    this.createNoteForm();
  }

  createNoteForm() {
    this.noteForm = this.formBuilder.group({
      note: [
        '',
        Validators.required
      ]
    });
  }

  addNote() {
    // Get successfully uploaded files
    const uploadedFiles = this.selectedFiles.filter((f) => f.status === 'completed' && f.s3ObjectKey);

    if (uploadedFiles.length > 0 && this.callbackAddWithDocuments) {
      // Create note with documents
      const documents: NoteDocumentAttachment[] = uploadedFiles.map((f) => ({
        uploadCorrelationId: f.uploadCorrelationId,
        fileName: f.file.name,
        size: f.file.size,
        contentType: f.file.type,
        s3ObjectKey: f.s3ObjectKey!,
        description: ''
      }));

      const noteData: CreateNoteWithDocumentsRequest = {
        note: this.noteForm.value.note,
        documents: documents
      };

      this.callbackAddWithDocuments(noteData);
    } else {
      // Create note without documents (original behavior)
      this.callbackAdd(this.noteForm.value);
    }

    // Reset form and clear selected files
    this.formRef.resetForm();
    this.selectedFiles = [];
  }

  /**
   * Check if there are any files still uploading
   */
  isUploading(): boolean {
    return this.selectedFiles.some((f) => f.status === 'uploading' || f.status === 'getting-url');
  }

  editNote(noteId: string, noteContent: string, index: number) {
    const editNoteDialogRef = this.dialog.open(FormDialogComponent, {
      data: {
        formfields: [
          {
            controlName: 'note',
            required: true,
            value: noteContent,
            controlType: 'input',
            label: 'Note'
          }
        ],
        layout: {
          columns: 1,
          addButtonText: 'Confirm'
        },
        title: 'Edit Note'
      }
    });
    editNoteDialogRef.afterClosed().subscribe((response: any) => {
      if (response.data && response.data.value.note !== noteContent) {
        this.callbackEdit(noteId, response.data.value, index);
      }
    });
  }

  deleteNote(noteId: string, index: number) {
    const deleteNoteDialogRef = this.dialog.open(DeleteDialogComponent, {
      data: { deleteContext: `Note: ${this.entityNotes[index].note}` }
    });
    deleteNoteDialogRef.afterClosed().subscribe((response: any) => {
      if (response.delete) {
        this.callbackDelete(noteId, index);
      }
    });
  }

  /**
   * Handle drag over event
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  /**
   * Handle drag leave event
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  /**
   * Handle file drop event
   */
  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFiles(files);
    }
  }

  /**
   * Handle files selected via file input
   */
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFiles(input.files);
    }
    // Reset input so same file can be selected again
    input.value = '';
  }

  /**
   * Process selected files - validate, create previews, and request presigned URLs
   */
  private processFiles(fileList: FileList): void {
    const validFiles: File[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (this.isValidImageFile(file)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      return;
    }

    // Create file status objects and generate previews
    const newFileStatuses: FileUploadStatus[] = validFiles.map((file) => {
      const fileStatus: FileUploadStatus = {
        uploadCorrelationId: this.s3Service.generateCorrelationId(),
        file: file,
        status: 'pending',
        progress: 0,
        previewUrl: undefined
      };

      // Generate preview
      this.generatePreview(file, fileStatus);

      return fileStatus;
    });

    // Add to selected files
    this.selectedFiles = [
      ...this.selectedFiles,
      ...newFileStatuses
    ];

    // Request presigned URLs from backend
    this.requestPresignedUrls(newFileStatuses);
  }

  /**
   * Validate if file is an accepted image type
   */
  private isValidImageFile(file: File): boolean {
    return this.acceptedImageTypes.includes(file.type);
  }

  /**
   * Generate image preview URL
   */
  private generatePreview(file: File, fileStatus: FileUploadStatus): void {
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      fileStatus.previewUrl = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Request presigned URLs from the backend
   */
  private requestPresignedUrls(fileStatuses: FileUploadStatus[]): void {
    // Update status to getting-url
    fileStatuses.forEach((fs) => (fs.status = 'getting-url'));

    // Create metadata request
    const metadataRequests: FileMetadataRequest[] = fileStatuses.map((fs) => ({
      uploadCorrelationId: fs.uploadCorrelationId,
      fileName: fs.file.name,
      contentType: fs.file.type,
      fileSize: fs.file.size
    }));

    // Call backend to get presigned URLs
    this.s3Service.generatePresignedUrls(metadataRequests).subscribe({
      next: (response: any) => {
        console.log('Raw response from backend:', response);

        // Handle different response structures
        let responses: PresignedUrlResponse[] = [];
        if (Array.isArray(response)) {
          responses = response;
        } else if (response && response.urls) {
          responses = response.urls;
        } else if (response && response.files) {
          responses = response.files;
        } else if (response && response.data) {
          responses = Array.isArray(response.data) ? response.data : [response.data];
        } else if (response && response.presignedUrl) {
          // Single response object
          responses = [response];
        }

        console.log('Parsed presigned URL responses:', responses);

        // Match responses to file statuses by correlation ID and start uploads
        responses.forEach((presignedResponse: PresignedUrlResponse) => {
          const fileStatus = fileStatuses.find(
            (fs) => fs.uploadCorrelationId === presignedResponse.uploadCorrelationId
          );
          if (fileStatus) {
            fileStatus.presignedUrl = presignedResponse.presignedUrl;
            // Store the S3 object key for later use when creating the note
            fileStatus.s3ObjectKey = presignedResponse.objectKey;
            console.log(`Presigned URL received for ${fileStatus.file.name}:`, presignedResponse.presignedUrl);
            console.log(`S3 Object Key: ${presignedResponse.objectKey}`);
            // Immediately start uploading to S3
            this.uploadFileToS3(fileStatus);
          } else {
            console.warn(`No matching file status found for correlation ID: ${presignedResponse.uploadCorrelationId}`);
          }
        });

        // Check if any files didn't get a presigned URL
        fileStatuses.forEach((fs) => {
          if (!fs.presignedUrl && fs.status === 'getting-url') {
            console.error(`No presigned URL received for ${fs.file.name} (${fs.uploadCorrelationId})`);
            fs.status = 'error';
            fs.errorMessage = 'No presigned URL received';
          }
        });
      },
      error: (error) => {
        console.error('Error getting presigned URLs:', error);
        fileStatuses.forEach((fs) => {
          fs.status = 'error';
          fs.errorMessage = 'Failed to get upload URL';
        });
      }
    });
  }

  /**
   * Upload a single file to S3 using its presigned URL
   */
  private uploadFileToS3(fileStatus: FileUploadStatus): void {
    if (!fileStatus.presignedUrl) {
      fileStatus.status = 'error';
      fileStatus.errorMessage = 'No presigned URL available';
      return;
    }

    fileStatus.status = 'uploading';
    fileStatus.progress = 0;

    this.s3Service
      .uploadFileToS3(fileStatus.presignedUrl, fileStatus.file, (progress) => {
        fileStatus.progress = progress;
      })
      .subscribe({
        next: () => {
          fileStatus.status = 'completed';
          fileStatus.progress = 100;
          console.log(`Successfully uploaded ${fileStatus.file.name} to S3`);
        },
        error: (error) => {
          fileStatus.status = 'error';
          fileStatus.errorMessage = `Upload failed: ${error.statusText || 'Unknown error'}`;
          console.error(`Failed to upload ${fileStatus.file.name} to S3:`, error);
        }
      });
  }

  /**
   * Remove a file from the selected files list
   */
  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = [
      'Bytes',
      'KB',
      'MB',
      'GB'
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if a content type is an image
   */
  isImageType(contentType: string): boolean {
    return contentType && contentType.startsWith('image/');
  }

  /**
   * Get icon for non-image file types
   */
  getFileIcon(contentType: string): string {
    if (contentType && contentType.includes('pdf')) {
      return 'file-pdf';
    }
    return 'file-alt';
  }

  /**
   * Open document in new tab using presigned URL
   */
  openDocument(document: any): void {
    if (document.presignedUrl) {
      window.open(document.presignedUrl, '_blank');
    }
  }
}
