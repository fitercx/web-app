import {
  ForeclosureOriginalSchedulePeriod,
  ForeclosureScheduleDisplayPeriod,
  ForeclosureUnearnedInterestDetails
} from 'app/loans/models/foreclosure-unearned-interest.model';

const AMOUNT_TOLERANCE = 0.01;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function amountsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > AMOUNT_TOLERANCE;
}

function datesDiffer(a: unknown, b: unknown): boolean {
  if (a == null || b == null) {
    return false;
  }
  return JSON.stringify(a) !== JSON.stringify(b);
}

function findCurrentPeriod(currentPeriods: any[], installmentNumber: number): any | null {
  return currentPeriods.find((period) => Number(period?.period) === installmentNumber) ?? null;
}

function buildBaseRowFromOriginal(original: ForeclosureOriginalSchedulePeriod): ForeclosureScheduleDisplayPeriod {
  const principalDue = toNumber(original.principalDue);
  const interestDue = toNumber(original.interestDue);
  return {
    period: original.installmentNumber,
    fromDate: original.fromDate,
    dueDate: original.dueDate,
    daysInPeriod: null,
    principalDue,
    principalOriginalDue: principalDue,
    interestDue,
    interestOriginalDue: interestDue,
    totalDueForPeriod: principalDue + interestDue,
    complete: false,
    foreclosureDisplay: { kind: 'original_only' }
  };
}

function attachActualFromCurrent(row: ForeclosureScheduleDisplayPeriod, current: any): void {
  const actualPrincipal = toNumber(current.principalDue);
  const actualInterest = toNumber(current.interestDue ?? current.interestOriginalDue);
  const actualDue = toNumber(current.totalDueForPeriod);
  const originalPrincipal = toNumber(row.principalDue);
  const originalInterest = toNumber(row.interestDue);
  const hasStructuralChange =
    datesDiffer(row.dueDate, current.dueDate) ||
    amountsDiffer(originalPrincipal, actualPrincipal) ||
    amountsDiffer(originalInterest, actualInterest);

  row.foreclosureDisplay = {
    kind: hasStructuralChange ? 'closure_actual' : 'paid_as_scheduled',
    actualDueDate: current.dueDate,
    actualPrincipalDue: actualPrincipal,
    actualInterestDue: actualInterest,
    actualEmiAmount: actualPrincipal + actualInterest,
    actualTotalDue: actualDue,
    actualPaidDate: current.obligationsMetOnDate,
    actualAmountPaid: toNumber(current.totalPaidForPeriod),
    actualPenaltyDue: toNumber(current.penaltyChargesDue),
    actualPenaltyPaid: toNumber(current.penaltyChargesPaid)
  };

  row.daysInPeriod = current.daysInPeriod ?? row.daysInPeriod;
  row.obligationsMetOnDate = current.obligationsMetOnDate;
  row.totalPaidForPeriod = current.totalPaidForPeriod;
  row.totalPaidInAdvanceForPeriod = current.totalPaidInAdvanceForPeriod;
  row.totalPaidLateForPeriod = current.totalPaidLateForPeriod;
  row.totalOutstandingForPeriod = current.totalOutstandingForPeriod;
  row.penaltyChargesDue = current.penaltyChargesDue;
  row.penaltyChargesPaid = current.penaltyChargesPaid;
  row.penaltyChargesWaived = current.penaltyChargesWaived;
  row.reversedPenaltyChargesDue = current.reversedPenaltyChargesDue;
  row.principalLoanBalanceOutstanding = current.principalLoanBalanceOutstanding;
  row.complete = current.complete;
}

function attachRemovedRow(
  row: ForeclosureScheduleDisplayPeriod,
  waived: { waivedInterest?: number; scheduledInterest?: number }
): void {
  row.foreclosureDisplay = {
    kind: 'removed',
    waivedInterest: toNumber(waived.waivedInterest ?? waived.scheduledInterest)
  };
  row.complete = true;
  row.obligationsMetOnDate = null;
  row.totalPaidForPeriod = 0;
  row.totalOutstandingForPeriod = 0;
}

/** True when the loan was foreclosed and we can rebuild the pre-rewrite schedule for display. */
export function isForeclosureScheduleOverlayActive(details: ForeclosureUnearnedInterestDetails | null): boolean {
  return (
    details?.closureType === 'FORECLOSURE' &&
    Array.isArray(details.originalSchedulePeriods) &&
    details.originalSchedulePeriods.length > 0
  );
}

/**
 * Merge original generator schedule with post-foreclosure actuals so the UI can show original EMI rows
 * with a secondary overlay for what actually happened (balloon closure, late pay, removed installments).
 */
export function buildForeclosureScheduleDisplayPeriods(
  currentPeriods: any[],
  details: ForeclosureUnearnedInterestDetails | null
): ForeclosureScheduleDisplayPeriod[] {
  if (!isForeclosureScheduleOverlayActive(details)) {
    return currentPeriods;
  }

  const waivedByInstallment = new Map<number, any>();
  for (const waived of details!.waivedPeriods ?? []) {
    if (waived.installmentNumber != null) {
      waivedByInstallment.set(Number(waived.installmentNumber), waived);
    }
  }

  const rows: ForeclosureScheduleDisplayPeriod[] = [];
  const disbursementRow = currentPeriods.find((period) => period?.period == null || Number(period?.period) <= 0);
  if (disbursementRow) {
    rows.push({ ...disbursementRow });
  }

  for (const original of details!.originalSchedulePeriods!) {
    const row = buildBaseRowFromOriginal(original);
    const waived = waivedByInstallment.get(Number(original.installmentNumber));
    const current = findCurrentPeriod(currentPeriods, Number(original.installmentNumber));

    if (waived) {
      attachRemovedRow(row, waived);
    } else if (current) {
      attachActualFromCurrent(row, current);
    }

    rows.push(row);
  }

  return rows;
}

export function getForeclosureDisplayStatus(item: ForeclosureScheduleDisplayPeriod): string {
  const kind = item.foreclosureDisplay?.kind;
  if (kind === 'removed') {
    return 'FORECLOSURE_REMOVED';
  }
  if (item.complete || item.obligationsMetOnDate) {
    return 'PAID';
  }
  return '';
}

export function isForeclosurePaidAsScheduled(item: ForeclosureScheduleDisplayPeriod): boolean {
  return item.foreclosureDisplay?.kind === 'paid_as_scheduled';
}

export function isForeclosureClosureActual(item: ForeclosureScheduleDisplayPeriod): boolean {
  return item.foreclosureDisplay?.kind === 'closure_actual';
}

export function isForeclosureRemovedRow(item: ForeclosureScheduleDisplayPeriod): boolean {
  return item.foreclosureDisplay?.kind === 'removed';
}

function hasForeclosureActualContext(item: ForeclosureScheduleDisplayPeriod): boolean {
  const display = item.foreclosureDisplay;
  if (!display || display.kind === 'original_only' || display.kind === 'removed') {
    return false;
  }
  if (display.kind === 'paid_as_scheduled') {
    return false;
  }
  return true;
}

export function showForeclosureDueDateOverlay(item: ForeclosureScheduleDisplayPeriod): boolean {
  const display = item.foreclosureDisplay;
  if (!hasForeclosureActualContext(item) || !display?.actualDueDate) {
    return false;
  }
  return datesDiffer(item.dueDate, display.actualDueDate);
}

export function showForeclosurePaidDateOverlay(item: ForeclosureScheduleDisplayPeriod): boolean {
  const display = item.foreclosureDisplay;
  if (!hasForeclosureActualContext(item) || !display?.actualPaidDate) {
    return false;
  }
  return datesDiffer(item.dueDate, display.actualPaidDate);
}

export function showForeclosurePrincipalOverlay(item: ForeclosureScheduleDisplayPeriod): boolean {
  const display = item.foreclosureDisplay;
  if (!hasForeclosureActualContext(item) || display?.actualPrincipalDue == null) {
    return false;
  }
  return amountsDiffer(toNumber(item.principalDue), toNumber(display.actualPrincipalDue));
}

export function showForeclosureInterestOverlay(item: ForeclosureScheduleDisplayPeriod): boolean {
  const display = item.foreclosureDisplay;
  if (!hasForeclosureActualContext(item) || display?.actualInterestDue == null) {
    return false;
  }
  const originalInterest = toNumber(item.interestDue ?? item.interestOriginalDue);
  return amountsDiffer(originalInterest, toNumber(display.actualInterestDue));
}

export function showForeclosureEmiOverlay(item: ForeclosureScheduleDisplayPeriod): boolean {
  const display = item.foreclosureDisplay;
  if (!hasForeclosureActualContext(item) || display?.actualEmiAmount == null) {
    return false;
  }
  const originalEmi = toNumber(item.principalDue) + toNumber(item.interestDue ?? item.interestOriginalDue);
  return amountsDiffer(originalEmi, toNumber(display.actualEmiAmount));
}

export function showForeclosureAmountPaidOverlay(item: ForeclosureScheduleDisplayPeriod): boolean {
  const display = item.foreclosureDisplay;
  if (!hasForeclosureActualContext(item) || display?.actualAmountPaid == null) {
    return false;
  }
  const originalEmi = toNumber(item.principalDue) + toNumber(item.interestDue ?? item.interestOriginalDue);
  return amountsDiffer(originalEmi, toNumber(display.actualAmountPaid));
}

export function hasForeclosureActualOverlay(item: ForeclosureScheduleDisplayPeriod): boolean {
  return (
    showForeclosureDueDateOverlay(item) ||
    showForeclosurePaidDateOverlay(item) ||
    showForeclosurePrincipalOverlay(item) ||
    showForeclosureInterestOverlay(item) ||
    showForeclosureEmiOverlay(item) ||
    showForeclosureAmountPaidOverlay(item)
  );
}
