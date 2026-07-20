import { Component, Inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';

@Component({
  selector: 'mifosx-adjust-installment-date-dialog',
  templateUrl: './adjust-installment-date-dialog.component.html',
  styleUrls: ['./adjust-installment-date-dialog.component.scss']
})
export class AdjustInstallmentDateDialogComponent implements OnInit {
  adjustDateForm: UntypedFormGroup;
  minDate: Date;
  maxDate: Date;
  adjustableInstallments: any[] = [];
  selectedInstallment: any = null;
  selectedInstallmentHasOverdueCharges = false;
  /** Whether interest recalculation is available for this loan (from the backend template). */
  interestRecalculationSupported = true;
  /** Reason interest recalculation is unavailable, shown on screen when the option is disabled. */
  interestRecalculationNotSupportedReason = '';
  private businessDate: Date;

  constructor(
    public dialogRef: MatDialogRef<AdjustInstallmentDateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formBuilder: UntypedFormBuilder,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private loansService: LoansService
  ) {
    this.minDate = data.disbursementDate ? new Date(data.disbursementDate) : new Date(2000, 0, 1);
    this.maxDate = new Date();
    this.maxDate.setFullYear(this.maxDate.getFullYear() + 10);
    this.adjustableInstallments = data.adjustableInstallments || [];
    this.businessDate = this.settingsService.businessDate;
  }

  ngOnInit() {
    this.adjustDateForm = this.formBuilder.group({
      installmentNumber: [
        '',
        Validators.required
      ],
      newDueDate: [
        '',
        Validators.required
      ],
      adjustWithInterestRecalculation: [false]
    });

    // Ask the backend whether interest recalculation is allowed for this loan. If not (e.g. advance-substituted
    // receivable LOC), uncheck + disable the option and show the reason on screen.
    if (this.data && this.data.loanId != null) {
      this.loansService.adjustInstallmentDateTemplate(String(this.data.loanId)).subscribe({
        next: (template: any) => {
          this.interestRecalculationSupported = template?.interestRecalculationSupported !== false;
          this.interestRecalculationNotSupportedReason = template?.interestRecalculationNotSupportedReason || '';
          if (!this.interestRecalculationSupported) {
            const control = this.adjustDateForm.get('adjustWithInterestRecalculation');
            control?.setValue(false);
            control?.disable();
          }
        },
        error: () => {
          // On template failure, leave the option enabled (backend still guards the write path).
          this.interestRecalculationSupported = true;
        }
      });
    }

    // When installment is selected, pre-fill the new due date
    this.adjustDateForm.get('installmentNumber')?.valueChanges.subscribe((installmentNumber) => {
      if (installmentNumber) {
        this.selectedInstallment = this.adjustableInstallments.find((inst: any) => inst.period === installmentNumber);
        if (this.selectedInstallment && this.selectedInstallment.dueDate) {
          this.adjustDateForm.patchValue({
            newDueDate: new Date(this.selectedInstallment.dueDate)
          });
        }
        this.selectedInstallmentHasOverdueCharges = this.hasOverdueChargesForInstallment(this.selectedInstallment);
      } else {
        this.selectedInstallment = null;
        this.selectedInstallmentHasOverdueCharges = false;
        this.adjustDateForm.patchValue({ newDueDate: '' });
      }
    });
  }

  submit() {
    if (this.adjustDateForm.valid) {
      const formValue = this.adjustDateForm.value;
      this.dialogRef.close({
        installmentNumber: formValue.installmentNumber,
        newDueDate: formValue.newDueDate,
        adjustWithInterestRecalculation: !!formValue.adjustWithInterestRecalculation
      });
    }
  }

  isInstallmentSelectionDisabled(installment: any): boolean {
    return this.hasOverdueChargesForInstallment(installment);
  }

  private hasOverdueChargesForInstallment(installment: any): boolean {
    if (!installment) {
      return false;
    }
    if (installment.hasOverdueCharges !== undefined) {
      return installment.hasOverdueCharges;
    }
    // Block adjustment only if there are actual overdue charges (fees, penalties)
    // This matches the backend validation logic which checks for outstanding charges
    // Note: We check fees and penalties; tax charges are validated on the backend
    const feeChargesOutstanding = Number(installment.feeChargesOutstanding ?? 0);
    const penaltyChargesOutstanding = Number(installment.penaltyChargesOutstanding ?? 0);
    return feeChargesOutstanding > 0 || penaltyChargesOutstanding > 0;
  }
}
