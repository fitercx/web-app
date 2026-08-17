/**
 * Shared helpers for backdated settlement / make-repayment screens.
 *
 * The repayment schedule and loan summary are as-of today (they still include LPI
 * accrued after a selected backdate). The /template/penalties payload is as-of the
 * selected transaction date. Allocation, default amount, and "will this close the
 * loan?" MUST follow the as-of-date figures, otherwise the UI quotes phantom LPI
 * and operators overpay after the backend waives those charges.
 */

export function roundAmount(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

export interface SettlementComponents {
  penalty: number;
  fee: number;
  tax: number;
  interest: number;
  principal: number;
}

export interface SettlementAllocation extends SettlementComponents {
  unallocated: number;
}

export interface InstallmentBucket extends SettlementComponents {
  period?: number;
}

const WATERFALL_ORDER: Array<keyof SettlementComponents> = [
  'penalty',
  'fee',
  'tax',
  'interest',
  'principal'
];

/** LPI that is on the loan today but will be waived by settling on the selected date. */
export function computePenaltyWaivedByBackdate(penaltyInSummary: number, penaltyAsOfDate: number): number {
  return Math.max(roundAmount(Number(penaltyInSummary || 0) - Number(penaltyAsOfDate || 0)), 0);
}

/**
 * Amount required to settle the loan as of the selected date under mifos-standard /
 * pro-rata-mifos-standard: remaining principal (all EMIs) + interest due as of that date
 * (current EMI / pro-rated) + fees + tax + LPI still due. Future EMI interest is not collected.
 */
export function computeSettlementRequired(components: SettlementComponents): number {
  return roundAmount(
    Number(components.principal || 0) +
      Number(components.interest || 0) +
      Number(components.fee || 0) +
      Number(components.tax || 0) +
      Number(components.penalty || 0)
  );
}

/**
 * Waterfall allocation capped to as-of-date component totals.
 * Principal budget is remaining principal (all EMIs), matching mifos-standard in-advance
 * application. Penalty/interest budgets come from /template/penalties so waived LPI is not previewed.
 */
export function allocateSettlement(
  amount: number,
  asOfDateComponents: SettlementComponents,
  buckets: InstallmentBucket[] = []
): SettlementAllocation {
  const allocation: SettlementAllocation = {
    penalty: 0,
    fee: 0,
    tax: 0,
    interest: 0,
    principal: 0,
    unallocated: 0
  };
  let remaining = roundAmount(amount);
  if (remaining <= 0) {
    return allocation;
  }

  const budgets: SettlementComponents = {
    penalty: roundAmount(asOfDateComponents.penalty),
    fee: roundAmount(asOfDateComponents.fee),
    tax: roundAmount(asOfDateComponents.tax),
    interest: roundAmount(asOfDateComponents.interest),
    principal: roundAmount(asOfDateComponents.principal)
  };

  const apply = (key: keyof SettlementComponents, outstanding: number): void => {
    if (remaining <= 0 || outstanding <= 0) {
      return;
    }
    const applied = Math.min(remaining, roundAmount(outstanding));
    allocation[key] = roundAmount(allocation[key] + applied);
    remaining = roundAmount(remaining - applied);
    budgets[key] = roundAmount(budgets[key] - applied);
  };

  for (const bucket of buckets) {
    if (remaining <= 0) {
      break;
    }
    for (const key of WATERFALL_ORDER) {
      apply(key, Math.min(roundAmount(bucket[key] || 0), budgets[key]));
    }
  }

  for (const key of WATERFALL_ORDER) {
    apply(key, budgets[key]);
  }

  allocation.unallocated = remaining;
  return allocation;
}

/**
 * Running balance of the last non-reversed savings transaction on or before `asOf`.
 * Falls back to the current available balance when there is no history (or asOf is missing).
 */
export function computeSavingsBalanceAsOf(
  transactions: Array<{
    date?: any;
    runningBalance?: number;
    reversed?: boolean;
    isReversal?: boolean;
    id?: number;
  }>,
  asOf: Date | null,
  toComparableDate: (value: any) => Date | null,
  fallbackBalance: number
): number {
  if (!asOf || !Array.isArray(transactions) || !transactions.length) {
    return roundAmount(fallbackBalance);
  }
  const selected = toComparableDate(asOf);
  if (!selected) {
    return roundAmount(fallbackBalance);
  }

  const eligible = transactions
    .filter((txn) => !txn.reversed && !txn.isReversal)
    .map((txn) => ({
      time: toComparableDate(txn.date)?.getTime() ?? null,
      runningBalance: Number(txn.runningBalance || 0),
      id: Number(txn.id || 0)
    }))
    .filter((txn) => txn.time !== null && (txn.time as number) <= selected.getTime())
    .sort((a, b) => (a.time as number) - (b.time as number) || a.id - b.id);

  if (!eligible.length) {
    return 0;
  }
  return roundAmount(eligible[eligible.length - 1].runningBalance);
}
