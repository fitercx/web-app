import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

function getDecimalCount(value: string): number {
  const pieces = value.split('.');
  return pieces.length === 2 ? pieces[1].length : 0;
}

function toNumericString(value: unknown): string {
  return String(value ?? '').trim();
}

export function isValidCurrencyPrecision(value: unknown, decimalPlaces: number): boolean {
  const numeric = toNumericString(value);
  if (numeric === '') {
    return true;
  }

  if (!/^\d+(\.\d+)?$/.test(numeric)) {
    return false;
  }

  return getDecimalCount(numeric) <= Math.max(0, decimalPlaces);
}

export function nonNegativeWithPrecisionValidator(getDecimalPlaces: () => number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const numeric = toNumericString(control.value);
    if (numeric === '') {
      return null;
    }

    const amount = Number(numeric);
    if (!Number.isFinite(amount)) {
      return { number: true };
    }

    if (amount < 0) {
      return { min: { min: 0, actual: amount } };
    }

    if (!isValidCurrencyPrecision(numeric, getDecimalPlaces())) {
      return { precision: true };
    }

    return null;
  };
}

export function positiveWithPrecisionValidator(getDecimalPlaces: () => number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const numeric = toNumericString(control.value);
    if (numeric === '') {
      return null;
    }

    const amount = Number(numeric);
    if (!Number.isFinite(amount)) {
      return { number: true };
    }

    if (amount <= 0) {
      return { positive: true };
    }

    if (!isValidCurrencyPrecision(numeric, getDecimalPlaces())) {
      return { precision: true };
    }

    return null;
  };
}
