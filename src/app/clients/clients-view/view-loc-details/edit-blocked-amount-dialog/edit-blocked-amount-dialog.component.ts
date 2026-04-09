import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { positiveWithPrecisionValidator } from 'app/clients/utils/amount-validation.util';

export interface EditBlockedAmountDialogData {
  currentBlockedAmount: number;
  currencyCode?: string;
  currencyDecimalPlaces?: number;
}

export interface EditBlockedAmountDialogResult {
  action: 'blockamount' | 'unblockamount';
  payload: {
    amount: number;
    actionDate: string;
    dateFormat: 'yyyy-MM-dd';
    locale: 'en';
    note?: string;
  };
}

@Component({
  selector: 'mifosx-edit-blocked-amount-dialog',
  templateUrl: './edit-blocked-amount-dialog.component.html',
  styleUrls: ['./edit-blocked-amount-dialog.component.scss']
})
export class EditBlockedAmountDialogComponent {
  form: FormGroup;
  isSubmitting = false;

  constructor(
    private formBuilder: FormBuilder,
    private dialogRef: MatDialogRef<EditBlockedAmountDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditBlockedAmountDialogData
  ) {
    this.form = this.formBuilder.group({
      action: [
        'block',
        Validators.required
      ],
      amount: [
        '',
        [
          Validators.required,
          positiveWithPrecisionValidator(() => this.currencyDecimalPlaces)]
      ],
      note: ['']
    });

    this.form.get('action')?.valueChanges.subscribe(() => {
      this.form.get('amount')?.updateValueAndValidity();
    });

    this.form.get('amount')?.valueChanges.subscribe(() => {
      this.form.get('amount')?.setErrors(this.getAmountErrors());
    });
  }

  get currencyCode(): string {
    return this.data.currencyCode || '';
  }

  get currencyDecimalPlaces(): number {
    return Number.isInteger(this.data.currencyDecimalPlaces) ? Number(this.data.currencyDecimalPlaces) : 2;
  }

  get currentBlockedAmount(): number {
    return Number(this.data.currentBlockedAmount || 0);
  }

  get isUnblockAction(): boolean {
    return this.form.get('action')?.value === 'unblock';
  }

  private getAmountErrors() {
    const control = this.form.get('amount');
    if (!control) {
      return null;
    }

    const currentErrors = control.errors || {};
    delete currentErrors.exceedsBlocked;

    if (!this.isUnblockAction) {
      return Object.keys(currentErrors).length ? currentErrors : null;
    }

    const amount = Number(control.value);
    if (Number.isFinite(amount) && amount > this.currentBlockedAmount) {
      return { ...currentErrors, exceedsBlocked: true };
    }

    return Object.keys(currentErrors).length ? currentErrors : null;
  }

  getAmountErrorMessage(): string {
    const control = this.form.get('amount');
    if (!control || !control.errors) {
      return '';
    }

    if (control.hasError('required')) {
      return 'Amount is required.';
    }
    if (control.hasError('positive')) {
      return this.isUnblockAction ? 'Unblock amount must be greater than 0.' : 'Block amount must be greater than 0.';
    }
    if (control.hasError('precision')) {
      return `Amount exceeds allowed precision (${this.currencyDecimalPlaces} decimal places).`;
    }
    if (control.hasError('exceedsBlocked')) {
      return 'Unblock amount cannot exceed current blocked amount.';
    }
    return 'Invalid amount.';
  }

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.form.get('amount')?.setErrors(this.getAmountErrors());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const value = this.form.value;
    const note = (value.note || '').trim();

    const result: EditBlockedAmountDialogResult = {
      action: value.action === 'unblock' ? 'unblockamount' : 'blockamount',
      payload: {
        amount: Number(value.amount),
        actionDate: this.formatDate(new Date()),
        dateFormat: 'yyyy-MM-dd',
        locale: 'en',
        ...(note ? { note } : {})
      }
    };

    this.dialogRef.close(result);
  }

  private formatDate(input: Date): string {
    const value = new Date(input);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
