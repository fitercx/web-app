import { Component, Inject } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ChangeExpiryDateDialogData {
  currentEndDate: Date | null;
  startDate: Date | null;
  nextReviewDate: Date | null;
}

export interface ChangeExpiryDateDialogResult {
  endDate: string;
  interimReviewDate: string | null;
  comment: string;
  dateFormat: 'yyyy-MM-dd';
  locale: 'en';
}

@Component({
  selector: 'mifosx-change-expiry-date-dialog',
  templateUrl: './change-expiry-date-dialog.component.html',
  styleUrls: ['./change-expiry-date-dialog.component.scss']
})
export class ChangeExpiryDateDialogComponent {
  form: FormGroup;
  submitting = false;
  /** First date the calendar allows. The new end date has to be after today. */
  readonly minNewEndDate: Date;

  constructor(
    private formBuilder: FormBuilder,
    private dialogRef: MatDialogRef<ChangeExpiryDateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ChangeExpiryDateDialogData
  ) {
    const today = this.startOfDay(new Date());
    this.minNewEndDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    this.form = this.formBuilder.group({
      newEndDate: [
        null,
        [
          Validators.required,
          this.endDateValidator.bind(this)]
      ],
      nextReviewDate: [data.nextReviewDate],
      comment: [
        '',
        [
          Validators.required,
          Validators.maxLength(1000)]
      ]
    });
  }

  get changeType(): string {
    const next = this.form.get('newEndDate')?.value as Date | null;
    if (!next || !this.data.currentEndDate) {
      return '';
    }
    const nextDay = this.startOfDay(next).getTime();
    const currentDay = this.startOfDay(this.data.currentEndDate).getTime();
    if (nextDay === currentDay) {
      return '';
    }
    return nextDay > currentDay ? 'Extension' : 'Reduction';
  }

  get reviewWarning(): string | null {
    const next = this.form.get('newEndDate')?.value as Date | null;
    if (!next) {
      return null;
    }
    const review = this.form.get('nextReviewDate')?.value as Date | null;
    if (!review || this.startOfDay(review) > this.startOfDay(next)) {
      return 'Next Review Date is empty or later than the New End Date.';
    }
    return null;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const comment = String(this.form.value.comment ?? '').trim();
    if (!comment) {
      this.form.get('comment')?.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }
    const next = this.form.value.newEndDate as Date;
    const review = this.form.value.nextReviewDate as Date | null;
    const result: ChangeExpiryDateDialogResult = {
      endDate: this.formatIso(next),
      interimReviewDate: review ? this.formatIso(review) : null,
      comment,
      dateFormat: 'yyyy-MM-dd',
      locale: 'en'
    };
    this.dialogRef.close(result);
  }

  private endDateValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value as Date | null;
    if (!value) {
      return null;
    }
    const next = this.startOfDay(value);
    const today = this.startOfDay(new Date());
    if (next <= today) {
      return { afterToday: true };
    }
    if (this.data.startDate && next <= this.startOfDay(this.data.startDate)) {
      return { afterStart: true };
    }
    if (this.data.currentEndDate && next.getTime() === this.startOfDay(this.data.currentEndDate).getTime()) {
      return { unchanged: true };
    }
    return null;
  }

  private startOfDay(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private formatIso(value: Date): string {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
}
