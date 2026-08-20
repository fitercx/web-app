import {
  reversedPaidLpiForLoan,
  reversedPaidLpiForPeriod,
  reversedPaidLpiIndicatorForPeriod,
  reversedPaidLpiForSchedule,
  subtractReversedPaidLpi
} from './reversed-paid-lpi-display.util';

describe('Reversed paid LPI display utility', () => {
  it('sums reversed paid LPI across repayment schedule periods', () => {
    const schedule = {
      periods: [
        { reversedPenaltyChargesDue: 15.6 },
        { reversedPenaltyChargesDue: '10.4' },
        { reversedPenaltyChargesDue: 0 }]
    };

    expect(reversedPaidLpiForSchedule(schedule)).toBeCloseTo(26, 6);
  });

  it('treats missing and invalid reversed LPI as zero', () => {
    expect(reversedPaidLpiForPeriod({})).toBe(0);
    expect(reversedPaidLpiForPeriod({ reversedPenaltyChargesDue: 'abc' })).toBe(0);
    expect(reversedPaidLpiForSchedule({ periods: null })).toBe(0);
  });

  it('subtracts reversed paid LPI without returning a negative display amount', () => {
    expect(subtractReversedPaidLpi(100, 15.6)).toBeCloseTo(84.4, 6);
    expect(subtractReversedPaidLpi(10, 15.6)).toBe(0);
  });

  it('maps transaction-only reversed LPI back to the original EMI by charge base principal', () => {
    const period = { period: 2, principalDue: 19213.34 };
    const loanDetails = {
      repaymentSchedule: { periods: [period] },
      charges: [
        {
          id: 10,
          amountPercentageAppliedTo: 19213.34,
          dueDate: [
            2026,
            8,
            20
          ]
        }
      ],
      transactions: [
        {
          reversed: false,
          penaltyChargesPortion: -15.79,
          type: { chargeAdjustment: true },
          loanChargePaidByList: [{ chargeId: 10 }],
          transactionRelations: [{ toLoanCharge: 10 }]
        }
      ]
    };

    expect(reversedPaidLpiForLoan(loanDetails)).toBeCloseTo(15.79, 6);
    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, period)).toBeCloseTo(15.79, 6);
    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, { period: 4, principalDue: 20242.51 })).toBe(0);
  });
});
