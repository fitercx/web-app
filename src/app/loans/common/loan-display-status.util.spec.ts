import { loanDisplayStatus } from './loan-display-status.util';

describe('loanDisplayStatus', () => {
  it('returns Foreclosed when loan subStatus is Foreclosed', () => {
    expect(
      loanDisplayStatus({
        status: { value: 'Closed (obligations met)' },
        subStatus: { value: 'Foreclosed' }
      })
    ).toBe('Foreclosed');
  });

  it('returns Foreclosed when isForcedClosure is set', () => {
    expect(
      loanDisplayStatus({
        status: { value: 'Closed (obligations met)' },
        additionalProperties: { isForcedClosure: true }
      })
    ).toBe('Foreclosed');
  });

  it('returns Foreclosed when isForcedClosure is set on the loan root', () => {
    expect(
      loanDisplayStatus({
        status: { value: 'Closed (obligations met)' },
        isForcedClosure: true
      })
    ).toBe('Foreclosed');
  });

  it('returns Restructured when that flag is set and the loan is not forced closed', () => {
    expect(
      loanDisplayStatus({
        status: { value: 'Closed (obligations met)' },
        subStatus: { value: 'Foreclosed' },
        additionalProperties: { isRestructured: true }
      })
    ).toBe('Restructured');
  });

  it('falls back to core status value', () => {
    expect(loanDisplayStatus({ status: { value: 'Active' } })).toBe('Active');
  });
});
