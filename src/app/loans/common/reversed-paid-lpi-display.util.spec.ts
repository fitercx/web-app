import {
  reversedPaidLpiForLoan,
  reversedPaidLpiForPeriod,
  reversedPaidLpiIndicatorForPeriod,
  reversedPaidLpiForSchedule
} from './reversed-paid-lpi-display.util';

describe('Paid LPI refund display utility', () => {
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

  it('uses the authoritative schedule refund instead of duplicated transaction history', () => {
    const loanDetails = {
      repaymentSchedule: { periods: [{ reversedPenaltyChargesDue: 12.18 }] },
      transactions: [
        {
          reversed: false,
          penaltyChargesPortion: 12.18,
          type: { id: 18, refundForActiveLoan: true }
        },
        {
          reversed: false,
          penaltyChargesPortion: 12.18,
          type: { id: 18, refundForActiveLoan: true }
        }
      ]
    };

    expect(reversedPaidLpiForLoan(loanDetails)).toBeCloseTo(12.18, 6);
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

  it('uses the targeted refund installment instead of guessing from charge date or equal principal', () => {
    const julyPeriod = { period: 1, dueDate: [
        2026,
        7,
        31
      ], principalDue: 19213.34 };
    const augustPeriod = { period: 2, dueDate: [
        2026,
        8,
        31
      ], principalDue: 19213.34 };
    const loanDetails = {
      repaymentSchedule: { periods: [
          julyPeriod,
          augustPeriod
        ] },
      charges: [{ id: 12, dueDate: [
            2026,
            8,
            1
          ], amountPercentageAppliedTo: 19213.34 }],
      transactions: [
        {
          reversed: false,
          penaltyChargesPortion: 82.19,
          type: { id: 18, refundForActiveLoan: true },
          loanChargePaidByList: [{ chargeId: 12, installmentNumber: 1 }]
        }
      ]
    };

    expect(reversedPaidLpiForLoan(loanDetails)).toBeCloseTo(82.19, 6);
    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, julyPeriod)).toBeCloseTo(82.19, 6);
    expect(reversedPaidLpiIndicatorForPeriod(loanDetails, augustPeriod)).toBe(0);
  });
});
