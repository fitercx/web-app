import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Custom Components */

/** Custom Services */
import { LoansService } from '../../loans.service';
import { AuthenticationService } from '../../../core/authentication/authentication.service';
import { CreateNoteWithDocumentsRequest } from 'app/shared/models/file-upload.model';

@Component({
  selector: 'mifosx-notes-tab',
  templateUrl: './notes-tab.component.html',
  styleUrls: ['./notes-tab.component.scss']
})
export class NotesTabComponent {
  entityId: string;
  username: string;
  entityNotes: any;

  constructor(
    private route: ActivatedRoute,
    private loansService: LoansService,
    private authenticationService: AuthenticationService
  ) {
    const savedCredentials = this.authenticationService.getCredentials();
    this.username = savedCredentials.username;
    this.entityId = this.route.parent.snapshot.params['loanId'];
    this.addNote = this.addNote.bind(this);
    this.addNoteWithDocuments = this.addNoteWithDocuments.bind(this);
    this.route.data.subscribe((data: { loanNotes: any }) => {
      this.entityNotes = data.loanNotes;
    });
  }

  addNote(noteContent: any) {
    this.loansService.createLoanNote(this.entityId, noteContent).subscribe((response: any) => {
      this.entityNotes.push({
        id: response.resourceId,
        createdByUsername: this.username,
        createdOn: new Date(),
        note: noteContent.note
      });
    });
  }

  /**
   * Creates a loan note with document attachments.
   */
  addNoteWithDocuments(noteData: CreateNoteWithDocumentsRequest) {
    this.loansService.createLoanNoteWithDocuments(this.entityId, noteData).subscribe((response: any) => {
      this.entityNotes.push({
        id: response.resourceId,
        createdByUsername: this.username,
        createdOn: new Date(),
        note: noteData.note,
        documents: noteData.documents
      });
    });
  }

  editNote(noteId: string, noteContent: any, index: number) {
    this.loansService.editLoanNote(this.entityId, noteId, noteContent).subscribe(() => {
      this.entityNotes[index].note = noteContent.note;
    });
  }

  deleteNote(noteId: string, index: number) {
    this.loansService.deleteLoanNote(this.entityId, noteId).subscribe(() => {
      this.entityNotes.splice(index, 1);
    });
  }
}
