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

  it('maps a legacy one-day-late LPI date back to the preceding EMI even when principal amounts are equal', () => {
    const julyPeriod = {
      period: 1,
      fromDate: [
        2026,
        6,
        30
      ],
      dueDate: [
        2026,
        7,
        31
      ],
      principalDue: 19213.34
    };
    const augustPeriod = {
      period: 2,
      fromDate: [
        2026,
        7,
        31
      ],
      dueDate: [
        2026,
        8,
        31
      ],
      principalDue: 19213.34
    };
    const loanDetails = {
      repaymentSchedule: { periods: [
          julyPeriod,
          augustPeriod
        ] },
      charges: [
        {
          id: 10,
          amountPercentageAppliedTo: 19213.34,
          dueDate: [
            2026,
            8,
            1
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
    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, julyPeriod)).toBeCloseTo(15.79, 6);
    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, augustPeriod)).toBe(0);
  });

  it('keeps an LPI posted on an EMI due date in the period ending on that date', () => {
    const julyPeriod = {
      period: 1,
      fromDate: [
        2026,
        6,
        30
      ],
      dueDate: [
        2026,
        7,
        31
      ]
    };
    const augustPeriod = {
      period: 2,
      fromDate: [
        2026,
        7,
        31
      ],
      dueDate: [
        2026,
        8,
        31
      ]
    };
    const loanDetails = {
      charges: [
        {
          id: 11,
          dueDate: [
            2026,
            7,
            31
          ]
        }
      ],
      transactions: [
        {
          reversed: false,
          penaltyChargesPortion: -16.21,
          type: { chargeAdjustment: true },
          loanChargePaidByList: [{ chargeId: 11 }]
        }
      ]
    };

    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, julyPeriod)).toBeCloseTo(16.21, 6);
    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, augustPeriod)).toBe(0);
  });
});
