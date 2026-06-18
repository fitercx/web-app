/**
 * Shared computation for the loan Accrual Report Excel download.
 *
 * The report lists one row per calendar month from disbursal to maturity with:
 *   Index, End of Month, Opening Principal, Closing Principal, Interest Accrued, Actual Interest Accrued.
 *
 * "Interest Accrued" is the schedule interest (sum of each installment's interestOriginalDue) bucketed by its
 * due-month, so the report total matches the repayment schedule.
 *
 * "Actual Interest Accrued" is a daily reducing-balance accrual on a 360-day year, per Finance's reference
 * workbook. Each calendar month is split at the EMI due date: interest accrues on the pre-payment balance up to
 * the due date and on the post-payment balance afterwards:
 *
 *   actual = openingPrincipal x rate x firstHalfDays / 360  +  closingPrincipal x rate x secondHalfDays / 360
 *
 * where (matching the workbook's day convention):
 *   - firstHalfDays  = daysBetween(previousMonthLastDay, dueDate) + 1   (for the first/disbursal month: from the
 *                      disbursal date with no +1)
 *   - secondHalfDays = daysBetween(dueDate, monthEnd)
 *   - a month with no EMI (e.g. the disbursal stub month) accrues a single segment on the opening principal from
 *     its start (disbursal date for the first month, else the 1st) to month end.
 *
 * `rate` is the loan PRODUCT's annual nominal interest rate (a reducing-balance rate, since these products use the
 * Declining Balance interest method), expressed as a fraction (annualRatePercent / 100).
 *
 * The column is gated by the business date: past months show the full month accrual, the current month accrues only
 * up to the business date, and future months are blank (null -> '').
 */

export interface AccrualReportRow {
  Index: number;
  'End of Month': string;
  'Opening Principal': string;
  'Closing Principal': string;
  'Interest Accrued': string;
  'Actual Interest Accrued': string;
}

export interface AccrualComputationOptions {
  /** Repayment schedule periods (each with dueDate, interestOriginalDue, principalLoanBalanceOutstanding, ...). */
  periods: any[];
  /** Loan start / disbursal date. */
  startDate: Date;
  /** Loan maturity (last installment due date). */
  maturityDate: Date;
  /** Present business date used for the current-month / future-month gating. */
  businessDate: Date;
  /** Loan product annual nominal (reducing-balance) interest rate as a percentage, e.g. 18.95. */
  annualRatePercent: number;
  /** Parses a schedule date value (number[] or Date) into a Date. */
  parseDate: (value: any) => Date;
  /** Formats the End-of-Month date for display. */
  formatMonthEnd: (date: Date) => string;
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Whole calendar days between two dates (b - a). Both are local midnight dates from parseDate. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MILLIS_PER_DAY);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Builds the month-by-month accrual rows. Mirrors the original repayment-schedule month loop for principal/interest
 * derivation; only "Actual Interest Accrued" uses the new daily reducing-balance formula.
 */
export function computeMonthlyAccrualRows(options: AccrualComputationOptions): AccrualReportRow[] {
  const { periods, startDate, maturityDate, businessDate, parseDate, formatMonthEnd } = options;
  const rate = toNumber(options.annualRatePercent) / 100;
  const rows: AccrualReportRow[] = [];

  if (!periods || periods.length === 0) {
    return rows;
  }

  let initialPrincipal = 0;
  const firstDisbursementPeriod = periods.find((p) => p.principalDisbursed && p.principalDisbursed > 0);
  if (firstDisbursementPeriod) {
    initialPrincipal = firstDisbursementPeriod.principalDisbursed;
  } else {
    initialPrincipal = toNumber(periods[0].principalLoanBalanceOutstanding) + toNumber(periods[0].principalDue);
  }
  let previousPrincipalBalance = initialPrincipal;

  let index = 1;
  let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const finalMonth = new Date(maturityDate.getFullYear(), maturityDate.getMonth(), 1);

  while (currentMonth <= finalMonth) {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const isFirstMonth = sameMonth(currentMonth, startDate);
    const isMaturityMonth = sameMonth(currentMonth, maturityDate);

    const monthEndDate = isMaturityMonth ? new Date(maturityDate) : new Date(year, month + 1, 0);
    const monthStartDate = isFirstMonth ? new Date(startDate) : new Date(year, month, 1);
    const prevMonthLastDay = new Date(year, month, 0);

    // Opening principal (balance entering the month, before this month's payment).
    let openingPrincipal = previousPrincipalBalance;
    const periodsBeforeMonth = periods.filter((p) => p.dueDate && parseDate(p.dueDate) < monthStartDate);
    if (periodsBeforeMonth.length > 0) {
      const lastBefore = periodsBeforeMonth[periodsBeforeMonth.length - 1];
      openingPrincipal = lastBefore.principalDisbursed
        ? lastBefore.principalDisbursed
        : toNumber(lastBefore.principalLoanBalanceOutstanding);
    } else if (isFirstMonth) {
      openingPrincipal = initialPrincipal;
    }

    const periodsDueThisMonth = periods.filter((period) => {
      if (!period.dueDate) {
        return false;
      }
      const dueDate = parseDate(period.dueDate);
      return dueDate >= monthStartDate && dueDate <= monthEndDate;
    });

    // Interest Accrued: full schedule interest recognised in each installment's due month (unchanged).
    const interestAccrued = periodsDueThisMonth.reduce((sum, period) => sum + toNumber(period.interestOriginalDue), 0);

    // Closing principal (balance after this month's payment).
    let closingPrincipal = openingPrincipal;
    if (periodsDueThisMonth.length > 0) {
      closingPrincipal = toNumber(periodsDueThisMonth[periodsDueThisMonth.length - 1].principalLoanBalanceOutstanding);
    }
    if (isMaturityMonth) {
      closingPrincipal = 0;
    }

    // EMI due date that splits the month (the last installment due in the month, if any).
    const dueDate = periodsDueThisMonth.length
      ? parseDate(periodsDueThisMonth[periodsDueThisMonth.length - 1].dueDate)
      : null;

    const actualInterestAccrued = computeActualInterestAccrued({
      monthStartDate,
      monthEndDate,
      prevMonthLastDay,
      startDate,
      dueDate,
      openingPrincipal,
      closingPrincipal,
      rate,
      businessDate,
      isFirstMonth
    });

    rows.push({
      Index: index,
      'End of Month': formatMonthEnd(monthEndDate),
      'Opening Principal': openingPrincipal.toFixed(2),
      'Closing Principal': closingPrincipal.toFixed(2),
      'Interest Accrued': interestAccrued.toFixed(2),
      'Actual Interest Accrued': actualInterestAccrued !== null ? actualInterestAccrued.toFixed(2) : ''
    });

    previousPrincipalBalance = closingPrincipal;
    currentMonth = new Date(year, month + 1, 1);
    index++;
  }

  return rows;
}

interface ActualAccrualInputs {
  monthStartDate: Date;
  monthEndDate: Date;
  prevMonthLastDay: Date;
  startDate: Date;
  dueDate: Date | null;
  openingPrincipal: number;
  closingPrincipal: number;
  rate: number;
  businessDate: Date;
  isFirstMonth: boolean;
}

/**
 * Daily reducing-balance accrual for one calendar month, gated by the business date.
 * Returns null for a future month (rendered blank).
 */
function computeActualInterestAccrued(input: ActualAccrualInputs): number | null {
  const { monthStartDate, monthEndDate, businessDate } = input;

  if (monthEndDate < businessDate) {
    // Past month: full month accrual.
    return accrualThroughEnd(input, monthEndDate);
  }
  if (businessDate >= monthStartDate) {
    // Current month: accrue only up to the business date.
    return accrualThroughEnd(input, businessDate);
  }
  // Future month: blank.
  return null;
}

/** Accrual for the month from its start through `effectiveEnd` (month end for past months, business date for the current month). */
function accrualThroughEnd(input: ActualAccrualInputs, effectiveEnd: Date): number {
  const { prevMonthLastDay, startDate, dueDate, openingPrincipal, closingPrincipal, rate, isFirstMonth } = input;
  const firstSegmentStart = isFirstMonth ? startDate : prevMonthLastDay;
  const firstPlus = isFirstMonth ? 0 : 1;

  // Month with no EMI (e.g. disbursal stub): single segment on the opening principal.
  if (!dueDate) {
    const days = Math.max(0, daysBetween(firstSegmentStart, effectiveEnd) + firstPlus);
    return (openingPrincipal * rate * days) / 360;
  }

  // First segment: pre-payment balance up to the due date (capped at the effective end).
  const firstEnd = effectiveEnd < dueDate ? effectiveEnd : dueDate;
  const firstDays = Math.max(0, daysBetween(firstSegmentStart, firstEnd) + firstPlus);
  let interest = (openingPrincipal * rate * firstDays) / 360;

  // Second segment: post-payment balance from the due date to the effective end.
  if (effectiveEnd > dueDate) {
    const secondDays = Math.max(0, daysBetween(dueDate, effectiveEnd));
    interest += (closingPrincipal * rate * secondDays) / 360;
  }

  return interest;
}
