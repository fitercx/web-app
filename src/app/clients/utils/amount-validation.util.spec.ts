import { FormControl } from '@angular/forms';
import {
  isValidCurrencyPrecision,
  nonNegativeWithPrecisionValidator,
  positiveWithPrecisionValidator
} from './amount-validation.util';

describe('amount-validation.util', () => {
  it('validates currency precision correctly', () => {
    expect(isValidCurrencyPrecision('10.12', 2)).toBeTrue();
    expect(isValidCurrencyPrecision('10.123', 2)).toBeFalse();
    expect(isValidCurrencyPrecision('10', 2)).toBeTrue();
  });

  it('enforces non-negative values with precision', () => {
    const validator = nonNegativeWithPrecisionValidator(() => 2);

    expect(validator(new FormControl(-1))).toEqual(jasmine.objectContaining({ min: jasmine.anything() }));
    expect(validator(new FormControl('10.123'))).toEqual(jasmine.objectContaining({ precision: true }));
    expect(validator(new FormControl('10.12'))).toBeNull();
  });

  it('enforces positive-only values with precision', () => {
    const validator = positiveWithPrecisionValidator(() => 2);

    expect(validator(new FormControl(0))).toEqual(jasmine.objectContaining({ positive: true }));
    expect(validator(new FormControl('10.123'))).toEqual(jasmine.objectContaining({ precision: true }));
    expect(validator(new FormControl('10.12'))).toBeNull();
  });
});
