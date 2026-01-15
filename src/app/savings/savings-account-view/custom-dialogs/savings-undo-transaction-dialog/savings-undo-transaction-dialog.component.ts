/** Angular Imports */
import { Component } from '@angular/core';
import { UntypedFormControl, AbstractControl, ValidatorFn } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';

/**
 * Savings Undo transaction dialog component with mandatory comment.
 */
@Component({
  selector: 'mifosx-savings-undo-transaction-dialog',
  templateUrl: './savings-undo-transaction-dialog.component.html',
  styleUrls: ['./savings-undo-transaction-dialog.component.scss']
})
export class SavingsUndoTransactionDialogComponent {
  /** Comment control (required, trims whitespace) */
  commentControl = new UntypedFormControl('', [this.nonWhitespaceRequired()]);

  /** Marks touched on input so error can appear while focused */
  onCommentInput(): void {
    this.commentControl.markAsTouched();
  }

  /** Validator: requires non-whitespace content */
  private nonWhitespaceRequired(): ValidatorFn {
    return (control: AbstractControl) => {
      const val = control.value as string;
      return val && val.trim().length > 0 ? null : { required: true };
    };
  }

  /**
   * @param {MatDialogRef} dialogRef Component reference to dialog.
   */
  constructor(public dialogRef: MatDialogRef<SavingsUndoTransactionDialogComponent>) {}
}
