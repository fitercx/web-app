import {
  allocateSettlement,
  computePenaltyWaivedByBackdate,
  computeSavingsBalanceAsOf,
  computeSettlementRequired,
  computeUnearnedInterest,
  isDummyGraceInstallmentDueOnDate,
  reconcileAsOfDateAmounts,
  reconcilePenaltyWithLedger
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
});
