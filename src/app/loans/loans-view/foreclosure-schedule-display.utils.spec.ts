import {
  buildForeclosureScheduleDisplayPeriods,
  getForeclosureDisplayStatus,
  hasForeclosureActualOverlay,
  isForeclosureScheduleOverlayActive,
  showForeclosureDueDateOverlay,
  showForeclosureEmiOverlay,
  showForeclosurePaidDateOverlay,
  showForeclosurePrincipalOverlay
} from './foreclosure-schedule-display.utils';

describe('foreclosure-schedule-display.utils', () => {
  const foreclosureDetails = {
    closureType: 'FORECLOSURE' as const,
    unearnedInterest: 4848.58,
    foreclosureDate: [
      2026,
      8,
      17
    ],
    originalMaturityDate: [
      2026,
      11,
      16
    ],
    remainingDays: 91,
    removedInstallmentCount: 3,
    originalScheduleInterest: 16542.28,
    interestCollected: 11693.7,
    originalSchedulePeriods: [
      { installmentNumber: 1, dueDate: [
          2026,
          6,
          15
        ], principalDue: 27297.88, interestDue: 4625.83 },
      { installmentNumber: 2, dueDate: [
          2026,
          7,
          15
        ], principalDue: 28019.45, interestDue: 3904.26 },
      { installmentNumber: 3, dueDate: [
          2026,
          8,
          15
        ], principalDue: 28019.45, interestDue: 2403.39 },
      { installmentNumber: 4, dueDate: [
          2026,
          9,
          15
        ], principalDue: 28019.45, interestDue: 1623.07 },
      { installmentNumber: 5, dueDate: [
          2026,
          10,
          15
        ], principalDue: 28019.45, interestDue: 1623.07 },
      { installmentNumber: 6, dueDate: [
          2026,
          11,
          16
        ], principalDue: 28624.32, interestDue: 822.12 }
    ],
    waivedPeriods: [
      { installmentNumber: 4, scheduledInterest: 1623.07, waivedInterest: 1623.07 },
      { installmentNumber: 5, scheduledInterest: 1623.07, waivedInterest: 1623.07 },
      { installmentNumber: 6, scheduledInterest: 822.12, waivedInterest: 822.12 }
    ]
  };

  const currentPeriods = [
    { period: null, dueDate: [
        2026,
        5,
        15
      ], principalDue: 0, interestDue: 0 },
    {
      period: 1,
      dueDate: [
        2026,
        6,
        15
      ],
      principalDue: 27297.88,
      interestDue: 4625.83,
      totalDueForPeriod: 31923.71,
      totalPaidForPeriod: 31923.71,
      obligationsMetOnDate: [
        2026,
        8,
        17
      ],
      complete: true
    },
    {
      period: 2,
      dueDate: [
        2026,
        7,
        15
      ],
      principalDue: 28019.45,
      interestDue: 3904.26,
      totalDueForPeriod: 32606.21,
      totalPaidForPeriod: 32606.21,
      obligationsMetOnDate: [
        2026,
        8,
        17
      ],
      complete: true
    },
    {
      period: 3,
      dueDate: [
        2026,
        8,
        17
      ],
      principalDue: 119682.67,
      interestDue: 3163.61,
      totalDueForPeriod: 124356.39,
      totalPaidForPeriod: 124356.39,
      obligationsMetOnDate: [
        2026,
        8,
        17
      ],
      complete: true
    }
  ];

  it('builds original schedule rows plus removed installments', () => {
    const rows = buildForeclosureScheduleDisplayPeriods(currentPeriods, foreclosureDetails);
    expect(rows).toHaveLength(7);
    expect(rows.filter((row) => row.foreclosureDisplay?.kind === 'removed')).toHaveLength(3);
    expect(rows.find((row) => row.period === 3)?.foreclosureDisplay?.kind).toBe('closure_actual');
  });

  it('marks removed installments with foreclosure status', () => {
    const rows = buildForeclosureScheduleDisplayPeriods(currentPeriods, foreclosureDetails);
    expect(getForeclosureDisplayStatus(rows.find((row) => row.period === 4)!)).toBe('FORECLOSURE_REMOVED');
    expect(getForeclosureDisplayStatus(rows.find((row) => row.period === 3)!)).toBe('PAID');
  });

  it('detects actual overlay when closure balloon differs from original EMI', () => {
    const rows = buildForeclosureScheduleDisplayPeriods(currentPeriods, foreclosureDetails);
    const emi3 = rows.find((row) => row.period === 3)!;
    const emi1 = rows.find((row) => row.period === 1)!;

    expect(hasForeclosureActualOverlay(emi3)).toBe(true);
    expect(showForeclosureDueDateOverlay(emi3)).toBe(true);
    expect(showForeclosureEmiOverlay(emi3)).toBe(true);
    expect(showForeclosurePrincipalOverlay(emi3)).toBe(true);

    expect(showForeclosureDueDateOverlay(emi1)).toBe(false);
    expect(showForeclosureEmiOverlay(emi1)).toBe(false);
    expect(showForeclosurePrincipalOverlay(emi1)).toBe(false);
    expect(showForeclosurePaidDateOverlay(emi1)).toBe(false);
    expect(hasForeclosureActualOverlay(emi1)).toBe(false);
    expect(hasForeclosureActualOverlay(rows.find((row) => row.period === 4)!)).toBe(false);
  });

  it('falls back to current schedule when original snapshot is missing', () => {
    expect(isForeclosureScheduleOverlayActive({ ...foreclosureDetails, originalSchedulePeriods: undefined })).toBe(
      false
    );
    expect(
      buildForeclosureScheduleDisplayPeriods(currentPeriods, {
        ...foreclosureDetails,
        originalSchedulePeriods: undefined
      })
    ).toBe(currentPeriods);
  });
});
