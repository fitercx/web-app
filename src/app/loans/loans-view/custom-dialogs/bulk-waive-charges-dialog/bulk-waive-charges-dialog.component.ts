/** Angular Imports */
import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntypedFormBuilder, UntypedFormGroup, Validators, FormArray } from '@angular/forms';
import { SettingsService } from 'app/settings/settings.service';

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
   * Loads EMIs with overdue charges from loan details.
   * <p>
   * IMPORTANT: this reads each installment's OWN `penaltyChargesOutstanding` from the repayment
   * schedule (backed by `m_loan_repayment_schedule`, kept correct by the backend's authoritative
   * per-charge -> installment linkage) rather than re-deriving "which installment does this overdue
   * charge belong to" here in the UI from each charge's own due date. A daily-accruing LPI charge is
   * by design dated AFTER its own installment's due date (it accrues during the arrears period), so
   * a naive due-date-window guess in the UI can attribute it to the WRONG (later) installment - see
   * BUG_REPORT.md Finding #2, which hit the exact same class of mismapping on the backend. Reading
   * the already-correct per-period aggregate avoids re-implementing (and re-risking) that resolution
   * logic on the client.
   */
  loadEmisWithOverdueCharges() {
    const periods = this.data?.loanDetails?.repaymentSchedule?.periods;
    if (!Array.isArray(periods)) {
      return;
    }

    this.emisWithOverdueCharges = periods
      .filter((period: any) => period && period.period && Number(period.penaltyChargesOutstanding || 0) > 0)
      .map((period: any) => ({
        installmentNumber: Number(period.period),
        dueDate: period.dueDate,
        dueDateFormatted: this.formatDate(period.dueDate),
        overdueAmount: Number(period.penaltyChargesOutstanding || 0)
      }))
      .sort((a: any, b: any) => a.installmentNumber - b.installmentNumber);

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
