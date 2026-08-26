/** Angular Imports */
import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';

export interface ReverseDialogData {
  historyId: number;
  amount: number;
  executionTime: string;
}

@Component({
  selector: 'mifosx-reverse-standing-instruction-dialog',
  templateUrl: './reverse-standing-instruction-dialog.component.html'
})
export class ReverseStandingInstructionDialogComponent {
  reverseForm: UntypedFormGroup;
  isSubmitting = false;
  errorMessage: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<ReverseStandingInstructionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ReverseDialogData,
    private formBuilder: UntypedFormBuilder
  ) {
    this.reverseForm = this.formBuilder.group({
      note: [
        '',
        [
          Validators.required,
          Validators.pattern(/\S+/)]
      ]
    });
  }

  get noteControl() {
    return this.reverseForm.get('note');
  }

  cancel() {
    this.dialogRef.close();
  }

  confirm() {
    if (this.reverseForm.invalid) {
      return;
    }
    this.dialogRef.close({ confirmed: true, note: this.noteControl.value.trim() });
  }
}
