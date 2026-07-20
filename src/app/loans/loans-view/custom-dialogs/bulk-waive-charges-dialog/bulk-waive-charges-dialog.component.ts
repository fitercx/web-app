/** Angular Imports */
import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntypedFormBuilder, UntypedFormGroup, Validators, FormArray } from '@angular/forms';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';

/**
 * Bulk Waive Charges Dialog Component
 *
 * Replaces the destructive bulk removal (deactivation) of overdue charges: charges are waived through the
 * standard waiver flow instead, keeping the audit trail and accounting entries intact and never touching
 * repayment schedule dates.
 */
@Component({
  selector: 'mifosx-bulk-waive-charges-dialog',
  templateUrl: './bulk-waive-charges-dialog.component.html',
  styleUrls: ['./bulk-waive-charges-dialog.component.scss']
})
export class BulkWaiveChargesDialogComponent implements OnInit {
  /** Bulk Waive Charges Form */
  bulkWaiveForm: UntypedFormGroup;
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
    public dialogRef: MatDialogRef<BulkWaiveChargesDialogComponent>,
    public formBuilder: UntypedFormBuilder,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  /**
   * Creates the bulk waive charges form.
   */
  ngOnInit() {
    this.maxDate = new Date();
    this.bulkWaiveForm = this.formBuilder.group({
      waiveType: ['waiveAll'], // Default to "Waive All"
      startDate: [''],
      endDate: [''],
      selectedEmis: this.formBuilder.array([])
    });

    // Load EMIs with overdue charges if loan details are provided
    if (this.data && this.data.loanDetails) {
      this.loadEmisWithOverdueCharges();
    }

    // When waive type changes, handle field visibility and validation
    this.bulkWaiveForm.get('waiveType')?.valueChanges.subscribe((waiveType) => {
      const startDateControl = this.bulkWaiveForm.get('startDate');
      const endDateControl = this.bulkWaiveForm.get('endDate');

      if (waiveType === 'waiveAll') {
        // Waive all: clear dates and EMI selection
        startDateControl?.setValue('');
        endDateControl?.setValue('');
        startDateControl?.clearValidators();
        endDateControl?.clearValidators();
        startDateControl?.disable();
        endDateControl?.disable();
        this.clearEmiSelection();
      } else if (waiveType === 'waiveEmi') {
        // Waive EMI: clear dates, enable EMI selection
        startDateControl?.setValue('');
        endDateControl?.setValue('');
        startDateControl?.clearValidators();
        endDateControl?.clearValidators();
        startDateControl?.disable();
        endDateControl?.disable();
        this.setupEmiSelection();
      } else if (waiveType === 'byDateRange') {
        // Date range: enable fields and add validators, clear EMI selection
        startDateControl?.enable();
        endDateControl?.enable();
        startDateControl?.setValidators([Validators.required]);
        startDateControl?.updateValueAndValidity();
        this.clearEmiSelection();
      }
    });

    // Update end date min date when start date changes
    this.bulkWaiveForm.get('startDate')?.valueChanges.subscribe((startDate) => {
      if (startDate && this.bulkWaiveForm.get('waiveType')?.value === 'byDateRange') {
        const endDateControl = this.bulkWaiveForm.get('endDate');
        if (endDateControl) {
          endDateControl.updateValueAndValidity();
        }
      }
    });
  }

  /**
   * Loads EMIs with overdue charges from loan details
   * IMPORTANT: Derive EMI options from actual active overdue charges only.
   * This prevents showing EMIs that have schedule penalty values but no waivable charges.
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

    // Group only ACTIVE overdue charges with an outstanding amount by resolved installment number.
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
    const selectedEmisArray = this.bulkWaiveForm.get('selectedEmis') as FormArray;
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
    const selectedEmisArray = this.bulkWaiveForm.get('selectedEmis') as FormArray;
    selectedEmisArray.clear();

    this.emisWithOverdueCharges.forEach(() => {
      selectedEmisArray.push(this.formBuilder.control(false));
    });
  }

  /**
   * Clears EMI selection
   */
  clearEmiSelection() {
    const selectedEmisArray = this.bulkWaiveForm.get('selectedEmis') as FormArray;
    selectedEmisArray.clear();
  }

  /**
   * Gets the selected EMIs FormArray
   */
  getSelectedEmisFormArray(): FormArray {
    return this.bulkWaiveForm.get('selectedEmis') as FormArray;
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
    const formValue = this.bulkWaiveForm.getRawValue();
    const waiveType = formValue.waiveType || 'waiveAll';

    // Form is valid if:
    // - Waive All is selected, OR
    // - Waive EMI is selected and at least one EMI is selected, OR
    // - Date range is selected and start date is provided
    let isValid = false;
    if (waiveType === 'waiveAll') {
      isValid = true;
    } else if (waiveType === 'waiveEmi') {
      const selectedEmis = this.getSelectedEmiNumbers();
      isValid = selectedEmis.length > 0;
    } else if (waiveType === 'byDateRange') {
      isValid = formValue.startDate && this.bulkWaiveForm.get('startDate')?.valid;
    }

    if (isValid) {
      this.dialogRef.close({
        waiveAll: waiveType === 'waiveAll',
        waiveEmi: waiveType === 'waiveEmi',
        byDateRange: waiveType === 'byDateRange',
        startDate: formValue.startDate || null,
        endDate: formValue.endDate || null,
        selectedEmiNumbers: waiveType === 'waiveEmi' ? this.getSelectedEmiNumbers() : null,
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
