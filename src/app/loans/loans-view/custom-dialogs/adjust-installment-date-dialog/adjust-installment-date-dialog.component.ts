import { Component, Inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';

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
  private businessDate: Date;

  constructor(
    public dialogRef: MatDialogRef<AdjustInstallmentDateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formBuilder: UntypedFormBuilder,
    private settingsService: SettingsService,
    private dateUtils: Dates
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
      ]
    });

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
        newDueDate: formValue.newDueDate
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
    // Block adjustment if Overdue Interest > 0.0
    const overdueInterest = Number(installment.totalOverdue ?? 0);
    return overdueInterest > 0.0;
  }
}
