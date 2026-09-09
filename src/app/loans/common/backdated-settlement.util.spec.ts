import {
  allocateSettlement,
  computeAuthoritativeSettlementCap,
  computePenaltyWaivedByBackdate,
  formatWaivedLpiMessage,
  formatLpiWaivedAfterDateMessage,
  computeProjectedOverpayment,
  computeSavingsBalanceAsOf,
  computeScheduleCloseCap,
  computeLpiOnlyPeriodOutstanding,
  computeSettlementRequired,
  computeUnearnedInterest,
  isDummyGraceInstallmentDueOnDate,
  lastAllowedLocForeclosureDate,
  reconcileAsOfDateAmounts,
  reconcilePenaltyWithLedger,
  applyEmiAmountCoverage
} from './backdated-settlement.util';

describe('backdated-settlement.util', () => {
  const toComparableDate = (value: any): Date | null => {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (Array.isArray(value)) {
      return new Date(value[0], value[1] - 1, value[2]);
    }
    return null;
  };

  it('does not allocate waived LPI when penalty as of the selected date is 0', () => {
    const allocation = allocateSettlement(
      81984.11,
      { penalty: 0, fee: 0, tax: 0, interest: 3484.11, principal: 78500 },
      [{ penalty: 196.26, fee: 0, tax: 0, interest: 3484.11, principal: 78500, period: 1 }]
    );

    expect(allocation.penalty).toBe(0);
    expect(allocation.interest).toBe(3484.11);
    expect(allocation.principal).toBe(78500);
    expect(allocation.unallocated).toBe(0);
  });

  it('treats paying principal+interest on the due date as a full settlement after LPI waiver', () => {
    expect(
      computeSettlementRequired({
        principal: 78500,
        interest: 3484.11,
        fee: 0,
        tax: 0,
        penalty: 0
      })
    ).toBe(81984.11);
    expect(computePenaltyWaivedByBackdate(197.89, 0)).toBe(197.89);
  });

  it('formats waived LPI copy with dynamic amount and from-date', () => {
    expect(formatWaivedLpiMessage('AED', '213.970', '25-Aug')).toBe(
      'Waived LPI amount of AED 213.970 from 25-Aug till today'
    );
  });

  it('formats Make Repayment waived LPI copy with the selected date', () => {
    expect(formatLpiWaivedAfterDateMessage('AED', '22.82', '18-Aug')).toBe(
      'AED 22.82 of late-payment interest accrued after 18-Aug will be waived and is not charged.'
    );
  });

  it('close amount is remaining principal plus as-of-date interest, not today summary minus waived LPI', () => {
    // Today's summary 82182 minus waived 259.88 would be 81922.12 — below the due total.
    expect(
      computeSettlementRequired({
        principal: 78500,
        interest: 3484.11,
        fee: 0,
        tax: 0,
        penalty: 0
      })
    ).toBe(81984.11);
  });

  it('full settlement required is remaining principal plus interest as of date, not schedule outstanding', () => {
    expect(
      computeSettlementRequired({
        principal: 150000,
        interest: 3965,
        fee: 0,
        tax: 0,
        penalty: 0
      })
    ).toBe(153965);
  });

  it('allocates remaining principal of later EMIs instead of treating it as a refund', () => {
    const allocation = allocateSettlement(165000, {
      penalty: 0,
      fee: 0,
      tax: 0,
      interest: 3965,
      principal: 150000
    });

    expect(allocation.principal).toBe(150000);
    expect(allocation.interest).toBe(3965);
    expect(allocation.penalty).toBe(0);
    expect(allocation.unallocated).toBe(11035);
  });

  it('full settlement includes unpaid LPI that repayment will collect', () => {
    expect(
      computeSettlementRequired({
        principal: 110000,
        interest: 3390.41,
        fee: 0,
        tax: 0,
        penalty: 2021.33
      })
    ).toBe(115411.74);
  });

  it('includes projected future LPI exactly once in the suggested repayment amount', () => {
    const reconciled = reconcileAsOfDateAmounts({
      isBackdated: false,
      penaltyTemplate: {
        principalOutstanding: 1000,
        remainingPrincipalOutstanding: 1000,
        interestOutstanding: 50,
        penaltyAmountDue: 20
      },
      repaymentTemplate: {
        feeChargesPortion: 0,
        taxChargesPortion: 0
      },
      additionalPenalty: 12.18
    });

    expect(reconciled.penalty).toBe(32.18);
    expect(reconciled.defaultTransactionAmount).toBe(1082.18);
  });

  it('allocates 0 LPI when settling on the installment due date', () => {
    const closeAmount = computeSettlementRequired({
      penalty: 0,
      fee: 0,
      tax: 0,
      interest: 3965,
      principal: 150000
    });
    const allocation = allocateSettlement(closeAmount, {
      penalty: 0,
      fee: 0,
      tax: 0,
      interest: 3965,
      principal: 150000
    });

    expect(allocation.penalty).toBe(0);
    expect(allocation.principal).toBe(150000);
    expect(allocation.interest).toBe(3965);
    expect(allocation.unallocated).toBe(0);
  });

  it('computes unearned interest as ledger interest minus pro-rated as-of-date interest', () => {
    expect(computeUnearnedInterest(2663.01, 2367.12)).toBe(295.89);
  });

  it('returns the savings running balance as of the selected backdate', () => {
    const balance = computeSavingsBalanceAsOf(
      [
        { id: 1, date: [
            2026,
            8,
            9
          ], runningBalance: 82000, reversed: false },
        { id: 2, date: [
            2026,
            8,
            12
          ], runningBalance: 5000, reversed: false }
      ],
      new Date(2026, 7, 9),
      toComparableDate,
      5000
    );

    expect(balance).toBe(82000);
  });

  it('adds ledger penalty gap back when dummy grace row caused template to underquote LPI', () => {
    const periods = [{ period: 2, dueDate: [
          2026,
          8,
          18
        ], principalDue: 0, interestDue: 0, isAdditional: true }];
    expect(
      isDummyGraceInstallmentDueOnDate(periods, new Date(2026, 7, 18), (value) => {
        if (Array.isArray(value)) {
          return new Date(value[0], value[1] - 1, value[2]);
        }
        return null;
      })
    ).toBe(true);
    expect(
      reconcilePenaltyWithLedger({
        penaltyFromTemplate: 1271.55,
        penaltyInSummary: 1356.32,
        fullLoanOutstanding: 104489.88,
        dueWithoutPenaltyReconcile: 103133.56,
        isBusinessDate: true,
        onInstallmentDueDate: true,
        hasRealEmiDueOnDate: false
      })
    ).toBe(1356.32);
  });

  it('does not add penalty gap on a genuine on-time EMI due date', () => {
    expect(
      reconcilePenaltyWithLedger({
        penaltyFromTemplate: 0,
        penaltyInSummary: 73.97,
        fullLoanOutstanding: 81984.11,
        dueWithoutPenaltyReconcile: 81984.11,
        isBusinessDate: true,
        onInstallmentDueDate: true,
        hasRealEmiDueOnDate: true
      })
    ).toBe(0);
  });

  it('prefers repayment template penalty on business date instead of inflated ledger penalty', () => {
    const reconciled = reconcileAsOfDateAmounts({
      isBackdated: false,
      isBusinessDate: true,
      penaltyTemplate: {
        principalOutstanding: 100000,
        remainingPrincipalOutstanding: 100000,
        interestOutstanding: 2580.82,
        penaltyAmountDue: 739.71
      },
      repaymentTemplate: {
        amount: 103238.34,
        principalPortion: 100000,
        interestPortion: 2580.82,
        penaltyChargesPortion: 657.52,
        feeChargesPortion: 0,
        taxChargesPortion: 0
      },
      loanSummary: { penaltyChargesOutstanding: 739.71, totalOutstanding: 103320.53 }
    });

    expect(reconciled.penalty).toBe(657.52);
    expect(reconciled.defaultTransactionAmount).toBe(103238.34);
    expect(reconciled.principal).toBe(100000);
    expect(reconciled.interest).toBe(2580.82);
  });

  it('uses as-of-date interest from penalties template, not full remaining repayment interest', () => {
    const reconciled = reconcileAsOfDateAmounts({
      isBackdated: false,
      isBusinessDate: true,
      penaltyTemplate: {
        principalOutstanding: 73000,
        remainingPrincipalOutstanding: 73000,
        interestOutstanding: 1941.1,
        penaltyAmountDue: 0
      },
      repaymentTemplate: {
        amount: 76312,
        principalPortion: 73000,
        interestPortion: 3312,
        penaltyChargesPortion: 0,
        feeChargesPortion: 0,
        taxChargesPortion: 0
      }
    });

    expect(reconciled.interest).toBe(1941.1);
    expect(reconciled.principal).toBe(73000);
    expect(reconciled.defaultTransactionAmount).toBe(74941.1);
  });

  it('does not inflate LPI via ledger reconcile when penalties template matches repayment template on business date', () => {
    expect(
      reconcilePenaltyWithLedger({
        penaltyFromTemplate: 657.52,
        penaltyInSummary: 739.71,
        fullLoanOutstanding: 103320.53,
        dueWithoutPenaltyReconcile: 102580.82,
        isBusinessDate: true,
        onInstallmentDueDate: false,
        hasRealEmiDueOnDate: false
      })
    ).toBe(739.71);
  });

  it('prefers repayment template when backdating before a later partial repayment', () => {
    const reconciled = reconcileAsOfDateAmounts({
      isBackdated: true,
      penaltyTemplate: {
        principalOutstanding: 95000,
        remainingPrincipalOutstanding: 95000,
        interestOutstanding: 4216.44,
        penaltyAmountDue: 0
      },
      repaymentTemplate: {
        amount: 20879.01,
        principalPortion: 20879.01,
        interestPortion: 0,
        penaltyChargesPortion: 0,
        feeChargesPortion: 0,
        taxChargesPortion: 0
      },
      loanSummary: { totalOutstanding: 20879.01, principalOutstanding: 20879.01 }
    });

    expect(reconciled.defaultTransactionAmount).toBe(20879.01);
    expect(reconciled.principal).toBe(20879.01);
    expect(reconciled.interest).toBe(0);
    expect(reconciled.remainingPrincipal).toBe(20879.01);
  });

  it('schedule close cap is lower than template for bullet PF before maturity (accrual overpay risk)', () => {
    const periods = [
      {
        period: 1,
        complete: false,
        dueDate: [
          2026,
          7,
          31
        ],
        totalDueForPeriod: 103846.58,
        totalPaidForPeriod: 0,
        principalOriginalDue: 100000,
        interestOriginalDue: 3846.58
      }
    ];
    expect(computeScheduleCloseCap(periods)).toBe(103846.58);

    const cap = computeAuthoritativeSettlementCap({
      outstandingAfterWaiver: 104438.36,
      fullLoanOutstanding: 104438.36,
      scheduleCloseCap: 103846.58,
      datedRepaymentTemplateAmount: 104438.36
    });
    expect(cap).toBe(103846.58);
    expect(computeProjectedOverpayment(104438.36, cap)).toBe(591.78);
  });

  it('paying today includes post-due additional LPI omitted by the repayment template', () => {
    const periods = [
      {
        period: 1,
        complete: false,
        principalOriginalDue: 77000,
        interestOriginalDue: 3417.53,
        totalOutstandingForPeriod: 80480.82
      },
      {
        period: 2,
        complete: false,
        isAdditional: true,
        principalOriginalDue: 0,
        interestOriginalDue: 0,
        totalOutstandingForPeriod: 506.32
      }
    ];
    expect(computeLpiOnlyPeriodOutstanding(periods)).toBe(506.32);
    expect(computeScheduleCloseCap(periods)).toBe(80987.14);

    const reconciled = reconcileAsOfDateAmounts({
      isBackdated: false,
      isBusinessDate: true,
      penaltyTemplate: {
        principalOutstanding: 77000,
        remainingPrincipalOutstanding: 77000,
        interestOutstanding: 3417.53,
        penaltyAmountDue: 63.29
      },
      repaymentTemplate: {
        amount: 80480.82,
        principalPortion: 77000,
        interestPortion: 3417.53,
        penaltyChargesPortion: 63.29,
        feeChargesPortion: 0,
        taxChargesPortion: 0
      },
      lpiOnlyScheduleOutstanding: 506.32
    });
    expect(reconciled.penalty).toBe(569.61);
    expect(reconciled.defaultTransactionAmount).toBe(80987.14);
  });

  it('authoritative cap ignores zero schedule and uses UI figures', () => {
    expect(
      computeAuthoritativeSettlementCap({
        outstandingAfterWaiver: 81984.11,
        fullLoanOutstanding: 82182,
        scheduleCloseCap: 0
      })
    ).toBe(81984.11);
  });

  it('closing the loan marks every remaining EMI as covered', () => {
    const chips = applyEmiAmountCoverage(
      [
        { period: 2, amount: 27363.33 },
        { period: 3, amount: 27363.33 }
      ],
      76201.6,
      true
    );
    expect(chips.map((chip) => chip.coverage)).toEqual([
      'covered',
      'covered'
    ]);
  });

  it('partial amount covers the first EMI and leaves later EMIs uncovered', () => {
    const chips = applyEmiAmountCoverage(
      [
        { period: 2, amount: 27363.33 },
        { period: 3, amount: 27363.33 }
      ],
      27363.33,
      false
    );
    expect(chips.map((chip) => chip.coverage)).toEqual([
      'covered',
      'uncovered'
    ]);
  });

  it('amount between two EMIs marks the second as partial', () => {
    const chips = applyEmiAmountCoverage(
      [
        { period: 2, amount: 100 },
        { period: 3, amount: 100 }
      ],
      150,
      false
    );
    expect(chips.map((chip) => chip.coverage)).toEqual([
      'covered',
      'partial'
    ]);
  });

  it('does not treat overdue LPI as a partial payment on the next EMI', () => {
    const chips = applyEmiAmountCoverage(
      [
        { period: 1, amount: 15688.22 },
        { period: 2, amount: 15688.22 }
      ],
      15787.49,
      false,
      99.27
    );
    expect(chips.map((chip) => chip.coverage)).toEqual([
      'covered',
      'uncovered'
    ]);
  });

  it('overpay cap is as-of-date full outstanding, not a single EMI template amount', () => {
    const cap = computeAuthoritativeSettlementCap({
      outstandingAfterWaiver: 60500.99,
      fullLoanOutstanding: 60650,
      scheduleCloseCap: 62000
    });
    expect(cap).toBe(60500.99);
    expect(computeProjectedOverpayment(6050.88, cap)).toBe(0);
    expect(computeProjectedOverpayment(60501, cap)).toBe(0.01);
  });

  it('backdated close cap is LPI through the selected date, not outstanding as of today', () => {
    const cap = computeAuthoritativeSettlementCap({
      outstandingAfterWaiver: 15100.5,
      fullLoanOutstanding: 15250.75,
      scheduleCloseCap: 16000
    });
    expect(cap).toBe(15100.5);
    expect(computeProjectedOverpayment(15250.75, cap)).toBe(150.25);
  });

  it('partial EMI payment is below schedule close cap so no projected overpayment', () => {
    const periods = [
      { period: 1, complete: false, totalOutstandingForPeriod: 27363.33 },
      { period: 2, complete: false, totalOutstandingForPeriod: 27363.33 },
      { period: 3, complete: false, totalOutstandingForPeriod: 27363.33 }
    ];
    const cap = computeAuthoritativeSettlementCap({
      outstandingAfterWaiver: 164179,
      fullLoanOutstanding: 164179,
      scheduleCloseCap: computeScheduleCloseCap(periods)
    });
    expect(computeProjectedOverpayment(27363.33, cap)).toBe(0);
  });

  it('last allowed LOC foreclosure date is the day before the earliest unpaid EMI', () => {
    const suggested = lastAllowedLocForeclosureDate(
      [
        {
          period: 1,
          complete: false,
          dueDate: [
            2026,
            8,
            29
          ],
          principalDue: 1110000,
          interestDue: 65687.67,
          totalOutstandingForPeriod: 1176599.98
        }
      ],
      toComparableDate,
      new Date(2026, 7, 3),
      new Date(2026, 8, 2)
    );
    expect(suggested).toEqual(new Date(2026, 7, 28));
  });

  it('returns null when the last allowed LOC foreclosure date is before the 30-day window', () => {
    expect(
      lastAllowedLocForeclosureDate(
        [
          {
            period: 1,
            complete: false,
            dueDate: [
              2026,
              6,
              1
            ],
            principalDue: 100,
            interestDue: 10,
            totalOutstandingForPeriod: 110
          }
        ],
        toComparableDate,
        new Date(2026, 7, 3),
        new Date(2026, 8, 2)
      )
    ).toBeNull();
  });
});
