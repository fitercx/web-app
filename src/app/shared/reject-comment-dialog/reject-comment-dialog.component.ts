import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'mifosx-reject-comment-dialog',
  templateUrl: './reject-comment-dialog.component.html',
  styleUrls: ['./reject-comment-dialog.component.scss']
})
export class RejectCommentDialogComponent {
  form: FormGroup;

  constructor(
    private formBuilder: FormBuilder,
    private dialogRef: MatDialogRef<RejectCommentDialogComponent>
  ) {
    this.form = this.formBuilder.group({
      comment: [
        '',
        [
          Validators.required,
          Validators.maxLength(1000)]
      ]
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(String(this.form.value.comment).trim());
  }
}
