export function toFiniteNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function reversedPaidLpiForPeriod(period: any): number {
  return Math.max(toFiniteNumber(period?.reversedPenaltyChargesDue), 0);
}

export function reversedPaidLpiForSchedule(schedule: any): number {
  const periods = Array.isArray(schedule?.periods) ? schedule.periods : [];
  return periods.reduce((total: number, period: any) => total + reversedPaidLpiForPeriod(period), 0);
}

export function reversedPaidLpiFromTransactions(loanDetails: any): number {
  const transactions = Array.isArray(loanDetails?.transactions) ? loanDetails.transactions : [];
  return transactions.reduce((total: number, transaction: any) => {
    const isChargeAdjustment = transaction?.type?.chargeAdjustment || transaction?.type?.id === 26;
    const penaltyPortion = toFiniteNumber(transaction?.penaltyChargesPortion);
    if (!transaction?.reversed && isChargeAdjustment && penaltyPortion < 0) {
      return total + Math.abs(penaltyPortion);
    }
    return total;
  }, 0);
}

export function reversedPaidLpiForLoan(loanDetails: any): number {
  return Math.max(
    reversedPaidLpiForSchedule(loanDetails?.repaymentSchedule),
    reversedPaidLpiFromTransactions(loanDetails)
  );
}

export function reversedPaidLpiIndicatorForPeriod(loanDetails: any, period: any): number {
  const scheduleAmount = reversedPaidLpiForPeriod(period);
  if (scheduleAmount > 0) {
    return scheduleAmount;
  }

  const transactions = Array.isArray(loanDetails?.transactions) ? loanDetails.transactions : [];
  const chargesById = new Map(
    (Array.isArray(loanDetails?.charges) ? loanDetails.charges : []).map((charge: any) => [
      charge?.id,
      charge
    ])
  );

  return transactions.reduce((total: number, transaction: any) => {
    const isChargeAdjustment = transaction?.type?.chargeAdjustment || transaction?.type?.id === 26;
    const penaltyPortion = toFiniteNumber(transaction?.penaltyChargesPortion);
    if (transaction?.reversed || !isChargeAdjustment || penaltyPortion >= 0) {
      return total;
    }
    const chargeIds = reversedChargeIdsForTransaction(transaction);
    const appliesToPeriod = chargeIds.some((chargeId) => chargeMatchesPeriod(chargesById.get(chargeId), period));
    return appliesToPeriod ? total + Math.abs(penaltyPortion) : total;
  }, 0);
}

export function subtractReversedPaidLpi(value: any, reversedPaidLpi: number): number {
  return Math.max(toFiniteNumber(value) - Math.max(toFiniteNumber(reversedPaidLpi), 0), 0);
}

function reversedChargeIdsForTransaction(transaction: any): number[] {
  const paidByChargeIds = Array.isArray(transaction?.loanChargePaidByList)
    ? transaction.loanChargePaidByList.map((paidBy: any) => paidBy?.chargeId)
    : [];
  const relationChargeIds = Array.isArray(transaction?.transactionRelations)
    ? transaction.transactionRelations.map((relation: any) => relation?.toLoanCharge)
    : [];
  return Array.from(
    new Set(
      [
        ...paidByChargeIds,
        ...relationChargeIds
      ]
        .map((chargeId) => Number(chargeId))
        .filter(Boolean)
    )
  );
}

function chargeMatchesPeriod(charge: any, period: any): boolean {
  if (!charge || !period || !period.period) {
    return false;
  }

  const chargeBaseAmount = toFiniteNumber(charge?.amountPercentageAppliedTo);
  if (chargeBaseAmount > 0) {
    return [
      period?.principalOriginalDue,
      period?.principalDue
    ].some((periodPrincipal) => Math.abs(toFiniteNumber(periodPrincipal) - chargeBaseAmount) <= 0.01);
  }

  return isDateWithinPeriod(charge?.dueDate, period);
}

function isDateWithinPeriod(date: any, period: any): boolean {
  const chargeDate = toDateNumber(date);
  const fromDate = toDateNumber(period?.fromDate);
  const dueDate = toDateNumber(period?.dueDate);
  if (!chargeDate || !dueDate) {
    return false;
  }
  return (!fromDate || chargeDate > fromDate) && chargeDate <= dueDate;
}

function toDateNumber(date: any): number {
  if (!Array.isArray(date) || date.length < 3) {
    return 0;
  }
  return Number(`${date[0]}${String(date[1]).padStart(2, '0')}${String(date[2]).padStart(2, '0')}`);
}
