/** Angular Imports */
import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { SettingsService } from 'app/settings/settings.service';

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
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  /**
   * Creates the bulk remove charges form.
   */
  ngOnInit() {
    this.maxDate = new Date();
    this.bulkRemoveForm = this.formBuilder.group({
      removeAll: [false],
      startDate: [''],
      endDate: ['']
    });

    // When "Remove All" is checked, disable date fields and clear validators
    this.bulkRemoveForm.get('removeAll')?.valueChanges.subscribe((removeAll) => {
      const startDateControl = this.bulkRemoveForm.get('startDate');
      const endDateControl = this.bulkRemoveForm.get('endDate');

      if (removeAll) {
        // Remove all: clear dates and remove validators
        startDateControl?.setValue('');
        endDateControl?.setValue('');
        startDateControl?.clearValidators();
        endDateControl?.clearValidators();
        startDateControl?.disable();
        endDateControl?.disable();
      } else {
        // Date range: enable fields and add validators
        startDateControl?.enable();
        endDateControl?.enable();
        startDateControl?.setValidators([Validators.required]);
        startDateControl?.updateValueAndValidity();
      }
    });

    // Update end date min date when start date changes
    this.bulkRemoveForm.get('startDate')?.valueChanges.subscribe((startDate) => {
      if (startDate && !this.bulkRemoveForm.get('removeAll')?.value) {
        const endDateControl = this.bulkRemoveForm.get('endDate');
        if (endDateControl) {
          endDateControl.updateValueAndValidity();
        }
      }
    });
  }

  /**
   * Closes the dialog and returns value of the form.
   */
  submit() {
    const formValue = this.bulkRemoveForm.getRawValue();
    // Form is valid if either removeAll is true OR dates are provided
    if (formValue.removeAll || (formValue.startDate && this.bulkRemoveForm.get('startDate')?.valid)) {
      this.dialogRef.close({
        removeAll: formValue.removeAll || false,
        startDate: formValue.startDate || null,
        endDate: formValue.endDate || null,
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
