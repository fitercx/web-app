import { Component, Inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoansService } from 'app/loans/loans.service';

@Component({
  selector: 'mifosx-change-repayment-strategy-dialog',
  templateUrl: './change-repayment-strategy-dialog.component.html',
  styleUrls: ['./change-repayment-strategy-dialog.component.scss']
})
export class ChangeRepaymentStrategyDialogComponent implements OnInit {
  strategyForm: UntypedFormGroup;
  strategyOptions: { code: string; name: string }[] = [];
  currentStrategyName = '';
  currentStrategyCode = '';
  unsupportedReason = '';
  loading = true;
  submitting = false;

  constructor(
    public dialogRef: MatDialogRef<ChangeRepaymentStrategyDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { loanId: number },
    private formBuilder: UntypedFormBuilder,
    private loansService: LoansService,
    private snackBar: MatSnackBar
  ) {
    this.strategyForm = this.formBuilder.group({
      transactionProcessingStrategyCode: [
        '',
        Validators.required
      ],
      note: [
        '',
        Validators.maxLength(500)]
    });
  }

  ngOnInit(): void {
    this.loansService.repaymentStrategyTemplate(String(this.data.loanId)).subscribe({
      next: (template: any) => {
        this.currentStrategyCode = template?.transactionProcessingStrategyCode || '';
        this.currentStrategyName = template?.transactionProcessingStrategyName || this.currentStrategyCode;
        this.strategyOptions = template?.transactionProcessingStrategyOptions || [];
        this.unsupportedReason = template?.unsupportedReason || '';
        this.strategyForm.patchValue({ transactionProcessingStrategyCode: this.currentStrategyCode });
        if (this.unsupportedReason) {
          this.strategyForm.disable();
        }
        this.loading = false;
      },
      error: (error: any) => {
        this.loading = false;
        this.unsupportedReason = this.errorMessage(error);
        this.strategyForm.disable();
      }
    });
  }

  get selectedStrategyUnchanged(): boolean {
    return this.strategyForm.get('transactionProcessingStrategyCode')?.value === this.currentStrategyCode;
  }

  submit(): void {
    if (this.strategyForm.invalid || this.selectedStrategyUnchanged || this.submitting || this.unsupportedReason) {
      return;
    }
    const selectedCode = this.strategyForm.get('transactionProcessingStrategyCode')?.value;
    const selected = this.strategyOptions.find((option) => option.code === selectedCode);
    const note = (this.strategyForm.get('note')?.value || '').trim();
    const payload: Record<string, string> = {
      transactionProcessingStrategyCode: selectedCode,
      transactionProcessingStrategyName: selected?.name || selectedCode,
      previousTransactionProcessingStrategyCode: this.currentStrategyCode,
      previousTransactionProcessingStrategyName: this.currentStrategyName
    };
    if (note) {
      payload.note = note;
    }

    this.submitting = true;
    this.loansService.updateRepaymentStrategy(String(this.data.loanId), payload).subscribe({
      next: (response: any) => {
        this.submitting = false;
        const awaitingApproval = response?.rollbackTransaction === true;
        this.snackBar.open(
          awaitingApproval
            ? 'Repayment strategy change submitted for checker approval.'
            : 'Repayment strategy updated.',
          'Close',
          { duration: 4000 }
        );
        this.dialogRef.close({ applied: !awaitingApproval, awaitingApproval });
      },
      error: (error: any) => {
        this.submitting = false;
        this.snackBar.open(this.errorMessage(error), 'Close', { duration: 6000 });
      }
    });
  }

  private errorMessage(error: any): string {
    const errors = error?.error?.errors;
    if (Array.isArray(errors) && errors.length && errors[0].defaultUserMessage) {
      return errors[0].defaultUserMessage;
    }
    return error?.error?.defaultUserMessage || 'Unable to change the repayment strategy.';
  }
}
