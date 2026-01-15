import { Component } from '@angular/core';
import { UntypedFormControl, AbstractControl, ValidatorFn } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'mifosx-loan-undo-transaction-dialog',
  templateUrl: './loan-undo-transaction-dialog.component.html',
  styleUrls: ['./loan-undo-transaction-dialog.component.scss']
})
export class LoanUndoTransactionDialogComponent {
  commentControl = new UntypedFormControl('', [this.nonWhitespaceRequired()]);

  onCommentInput(): void {
    this.commentControl.markAsTouched();
  }

  private nonWhitespaceRequired(): ValidatorFn {
    return (control: AbstractControl) => {
      const val = control.value as string;
      return val && val.trim().length > 0 ? null : { required: true };
    };
  }

  constructor(public dialogRef: MatDialogRef<LoanUndoTransactionDialogComponent>) {}
}
