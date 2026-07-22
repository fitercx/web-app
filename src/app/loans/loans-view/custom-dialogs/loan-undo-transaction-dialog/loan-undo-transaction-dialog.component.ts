import { Component, Inject, Optional } from '@angular/core';
import { UntypedFormControl, AbstractControl, ValidatorFn } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'mifosx-loan-undo-transaction-dialog',
  templateUrl: './loan-undo-transaction-dialog.component.html',
  styleUrls: ['./loan-undo-transaction-dialog.component.scss']
})
/**
 * Dialog component used to confirm the undoing of a loan transaction.
 *
 * This component presents a form that requires the user to enter a
 * non-empty, non-whitespace comment explaining the reason for undoing
 * the transaction. The `commentControl` enforces this validation and is
 * marked as touched when the user interacts with the input so that
 * validation feedback can be displayed.
 *
 * The dialog is managed via `MatDialogRef`, allowing the parent
 * component to open and close this dialog as part of the loan
 * transaction workflow.
 */
export class LoanUndoTransactionDialogComponent {
  commentControl = new UntypedFormControl('', [this.nonWhitespaceRequired()]);

  /** True when other real (non-reversed, non-accrual) transactions were posted on this loan AFTER the
   *  one being undone - undoing it will reprocess/reallocate all of that later activity too, which can
   *  shift how later repayments were applied across installments in ways that are hard to predict from
   *  the transaction list alone. Set by the caller via dialog data. */
  hasLaterTransactions = false;

  onCommentInput(): void {
    this.commentControl.markAsTouched();
  }

  private nonWhitespaceRequired(): ValidatorFn {
    return (control: AbstractControl) => {
      const val = control.value as string;
      return val && val.trim().length > 0 ? null : { required: true };
    };
  }

  constructor(
    public dialogRef: MatDialogRef<LoanUndoTransactionDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) data: { hasLaterTransactions?: boolean }
  ) {
    this.hasLaterTransactions = !!data?.hasLaterTransactions;
  }
}
