/** Angular Imports */
import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntypedFormBuilder, UntypedFormGroup, Validators, FormArray } from '@angular/forms';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';

/**
 * Bulk Remove Charges Dialog Component
 */
@Component({
  selector: 'mifosx-bulk-remove-charges-dialog',
  templateUrl: './bulk-remove-charges-dialog.component.html',
  styleUrls: ['./bulk-remove-charges-dialog.component.scss']
})
export class BulkRemoveChargesDialogComponent implements OnInit {
  /** Bulk Remove Charges Form */
  bulkRemoveForm: UntypedFormGroup;
  /** Minimum date allowed */
  minDate = new Date(2000, 0, 1);
  /** Maximum date allowed */
  maxDate = new Date();
  /** EMIs with overdue charges */
  emisWithOverdueCharges: any[] = [];

  /**
   * @param {MatDialogRef} dialogRef Component reference to dialog.
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {SettingsService} settingsService Settings Service.
   * @param {any} data Provides values for the form (if available).
   */
  constructor(
    public dialogRef: MatDialogRef<BulkRemoveChargesDialogComponent>,
    public formBuilder: UntypedFormBuilder,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  /**
   * Creates the bulk remove charges form.
   */
  ngOnInit() {
    this.maxDate = new Date();
    this.bulkRemoveForm = this.formBuilder.group({
      removalType: ['removeAll'], // Default to "Remove All"
      startDate: [''],
      endDate: [''],
      selectedEmis: this.formBuilder.array([])
    });

    // Load EMIs with overdue charges if loan details are provided
    if (this.data && this.data.loanDetails) {
      this.loadEmisWithOverdueCharges();
    }

    // When removal type changes, handle field visibility and validation
    this.bulkRemoveForm.get('removalType')?.valueChanges.subscribe((removalType) => {
      const startDateControl = this.bulkRemoveForm.get('startDate');
      const endDateControl = this.bulkRemoveForm.get('endDate');
      const selectedEmisControl = this.bulkRemoveForm.get('selectedEmis') as FormArray;

      if (removalType === 'removeAll') {
        // Remove all: clear dates and EMI selection
        startDateControl?.setValue('');
        endDateControl?.setValue('');
        startDateControl?.clearValidators();
        endDateControl?.clearValidators();
        startDateControl?.disable();
        endDateControl?.disable();
        this.clearEmiSelection();
      } else if (removalType === 'removeEmi') {
        // Remove EMI: clear dates, enable EMI selection
        startDateControl?.setValue('');
        endDateControl?.setValue('');
        startDateControl?.clearValidators();
        endDateControl?.clearValidators();
        startDateControl?.disable();
        endDateControl?.disable();
        this.setupEmiSelection();
      } else if (removalType === 'byDateRange') {
        // Date range: enable fields and add validators, clear EMI selection
        startDateControl?.enable();
        endDateControl?.enable();
        startDateControl?.setValidators([Validators.required]);
        startDateControl?.updateValueAndValidity();
        this.clearEmiSelection();
      }
    });

    // Update end date min date when start date changes
    this.bulkRemoveForm.get('startDate')?.valueChanges.subscribe((startDate) => {
      if (startDate && this.bulkRemoveForm.get('removalType')?.value === 'byDateRange') {
        const endDateControl = this.bulkRemoveForm.get('endDate');
        if (endDateControl) {
          endDateControl.updateValueAndValidity();
        }
      }
    });
  }

  /**
   * Loads EMIs with overdue charges from loan details
   * IMPORTANT: Derive EMI options from actual active overdue charges only.
   * This prevents showing EMIs that have schedule penalty values but no removable charges.
   */
  loadEmisWithOverdueCharges() {
    if (
      !this.data.loanDetails ||
      !this.data.loanDetails.repaymentSchedule ||
      !this.data.loanDetails.repaymentSchedule.periods
    ) {
      return;
    }

    const periods = (this.data.loanDetails.repaymentSchedule.periods || [])
      .filter((period: any) => period && period.period && period.dueDate && period.dueDate.length === 3)
      .sort((a: any, b: any) => Number(a.period) - Number(b.period));
    const charges = this.data.loanDetails.charges || [];

    const toDate = (value: any): Date | null => {
      if (Array.isArray(value) && value.length === 3) {
        const date = new Date(value[0], value[1] - 1, value[2]);
        if (!Number.isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          return date;
        }
      }
      const parsed = this.dateUtils.parseDate(value);
      if (parsed) {
        const date = new Date(parsed);
        if (!Number.isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          return date;
        }
      }
      return null;
    };

    const resolveInstallmentNumber = (charge: any): number | null => {
      if (charge?.installmentNumber) {
        return Number(charge.installmentNumber);
      }

      const chargeDueDate = toDate(charge?.dueDate);
      if (!chargeDueDate) {
        return null;
      }

      // IMPORTANT: Use (prevDueDate, currentDueDate] window mapping to match backend and schedule behavior.
      // - Charge due on Feb 24 should map to EMI due Mar 02 (not EMI due Feb 02).
      for (let i = 0; i < periods.length; i++) {
        const current = periods[i];
        const currentDueDate = toDate(current.dueDate);
        if (!currentDueDate) {
          continue;
        }
        const currentFromDate = toDate(current.fromDate);
        const prevDueDate = i - 1 >= 0 ? toDate(periods[i - 1].dueDate) : null;

        // Preferred mapping when fromDate is available: (fromDate, dueDate]
        if (currentFromDate) {
          const inFromDueWindow = chargeDueDate > currentFromDate && chargeDueDate <= currentDueDate;
          if (inFromDueWindow) {
            return Number(current.period);
          }
        }

        const inCurrentWindow = prevDueDate
          ? chargeDueDate > prevDueDate && chargeDueDate <= currentDueDate
          : chargeDueDate <= currentDueDate;
        if (inCurrentWindow) {
          return Number(current.period);
        }
      }
      return null;
    };

    // Group only ACTIVE overdue charges by resolved installment number.
    const emiOverdueMap = new Map<number, any>();
    charges.forEach((charge: any) => {
      const isOverdueCharge = charge?.chargeTimeType?.value?.toLowerCase().includes('overdue');
      const outstanding = Number(charge?.amountOutstanding || 0);
      if (!isOverdueCharge || outstanding <= 0 || charge?.paid || charge?.waived) {
        return;
      }

      const installmentNumber = resolveInstallmentNumber(charge);
      if (!installmentNumber) {
        return;
      }

      const matchingPeriod = periods.find((p: any) => Number(p.period) === installmentNumber);
      if (!matchingPeriod) {
        return;
      }

      if (!emiOverdueMap.has(installmentNumber)) {
        emiOverdueMap.set(installmentNumber, {
          installmentNumber,
          dueDate: matchingPeriod.dueDate,
          dueDateFormatted: this.formatDate(matchingPeriod.dueDate),
          overdueAmount: 0,
          chargeCount: 0
        });
      }

      const emiData = emiOverdueMap.get(installmentNumber);
      emiData.overdueAmount += outstanding;
      emiData.chargeCount += 1;
    });

    // Convert map to array and sort by installment number
    this.emisWithOverdueCharges = Array.from(emiOverdueMap.values()).sort(
      (a, b) => a.installmentNumber - b.installmentNumber
    );

    // Update FormArray to match the number of EMIs
    const selectedEmisArray = this.bulkRemoveForm.get('selectedEmis') as FormArray;
    while (selectedEmisArray.length < this.emisWithOverdueCharges.length) {
      selectedEmisArray.push(this.formBuilder.control(false));
    }
    while (selectedEmisArray.length > this.emisWithOverdueCharges.length) {
      selectedEmisArray.removeAt(selectedEmisArray.length - 1);
    }
  }

  /**
   * Formats date array to readable string
   */
  formatDate(dateArray: number[]): string {
    if (!dateArray || dateArray.length !== 3) {
      return '';
    }
    const date = new Date(dateArray[0], dateArray[1] - 1, dateArray[2]);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /**
   * Sets up EMI selection checkboxes
   */
  setupEmiSelection() {
    const selectedEmisArray = this.bulkRemoveForm.get('selectedEmis') as FormArray;
    selectedEmisArray.clear();

    this.emisWithOverdueCharges.forEach((emi) => {
      selectedEmisArray.push(this.formBuilder.control(false));
    });
  }

  /**
   * Clears EMI selection
   */
  clearEmiSelection() {
    const selectedEmisArray = this.bulkRemoveForm.get('selectedEmis') as FormArray;
    selectedEmisArray.clear();
  }

  /**
   * Gets the selected EMIs FormArray
   */
  getSelectedEmisFormArray(): FormArray {
    return this.bulkRemoveForm.get('selectedEmis') as FormArray;
  }

  /**
   * Gets selected EMI installment numbers
   */
  getSelectedEmiNumbers(): number[] {
    const selectedEmisArray = this.getSelectedEmisFormArray();
    const selected: number[] = [];

    selectedEmisArray.controls.forEach((control, index) => {
      if (control.value && this.emisWithOverdueCharges[index]) {
        selected.push(this.emisWithOverdueCharges[index].installmentNumber);
      }
    });

    return selected;
  }

  /**
   * Closes the dialog and returns value of the form.
   */
  submit() {
    const formValue = this.bulkRemoveForm.getRawValue();
    const removalType = formValue.removalType || 'removeAll';

    // Form is valid if:
    // - Remove All is selected, OR
    // - Remove EMI is selected and at least one EMI is selected, OR
    // - Date range is selected and start date is provided
    let isValid = false;
    if (removalType === 'removeAll') {
      isValid = true;
    } else if (removalType === 'removeEmi') {
      const selectedEmis = this.getSelectedEmiNumbers();
      isValid = selectedEmis.length > 0;
    } else if (removalType === 'byDateRange') {
      isValid = formValue.startDate && this.bulkRemoveForm.get('startDate')?.valid;
    }

    if (isValid) {
      this.dialogRef.close({
        removeAll: removalType === 'removeAll',
        removeEmi: removalType === 'removeEmi',
        byDateRange: removalType === 'byDateRange',
        startDate: formValue.startDate || null,
        endDate: formValue.endDate || null,
        selectedEmiNumbers: removalType === 'removeEmi' ? this.getSelectedEmiNumbers() : null,
        removeCompleteEmiOverdue: removalType === 'removeEmi',
        confirm: true
      });
    }
  }

  /**
   * Closes the dialog without action.
   */
  cancel() {
    this.dialogRef.close();
  }
}
