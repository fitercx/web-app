/**
 * Shared computation for the loan Accrual Report Excel download.
 *
 * The report lists one row per calendar month from disbursal to maturity with:
 *   Index, End of Month, Opening Principal, Closing Principal, Interest Accrued.
 *
 * "Interest Accrued" is the interest actually posted by the daily accrual job: the interest portion of the
 * loan's non-reversed Accrual transactions, net of Accrual Adjustments, bucketed by transaction-date month. This is
 * the same figure as adding up the accrual rows on the loan's Transactions tab.
 *
 * Future months (starting after the business date) are blank (null -> ''). If accruals were posted after the
 * maturity month (e.g. an overdue loan that keeps accruing), the report is extended to cover those months so the
 * total matches the posted accruals.
 */

export interface AccrualReportRow {
  Index: number;
  'End of Month': string;
  'Opening Principal': string;
  'Closing Principal': string;
  'Interest Accrued': string;
}

export interface AccrualComputationOptions {
  /** Repayment schedule periods (each with dueDate, interestOriginalDue, principalLoanBalanceOutstanding, ...). */
  periods: any[];
  /** Loan transactions (GET /loans/{id}?associations=transactions); accrual rows drive "Interest Accrued". */
  transactions: any[];
  /** Loan start / disbursal date. */
  startDate: Date;
  /** Loan maturity (last installment due date). */
  maturityDate: Date;
  /** Present business date; months starting after it are left blank. */
  businessDate: Date;
  /** Parses a schedule date value (number[] or Date) into a Date. */
  parseDate: (value: any) => Date;
  /** Formats the End-of-Month date for display. */
  formatMonthEnd: (date: Date) => string;
}

const ACCRUAL_CODE = 'loanTransactionType.accrual';
const ACCRUAL_ADJUSTMENT_CODE = 'loanTransactionType.accrualAdjustment';

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

/** Net posted accrual interest per calendar month (Accrual minus Accrual Adjustment, reversed rows excluded). */
function sumPostedAccrualInterestByMonth(
  transactions: any[],
  parseDate: (value: any) => Date
): { byMonth: Map<string, number>; lastAccrualDate: Date | null } {
  const byMonth = new Map<string, number>();
  let lastAccrualDate: Date | null = null;

  for (const transaction of transactions || []) {
    if (transaction?.reversed || !transaction?.date) {
      continue;
    }
    const code = transaction.type?.code;
    const isAccrual = code === ACCRUAL_CODE || (code == null && transaction.type?.accrual === true);
    const isAccrualAdjustment = code === ACCRUAL_ADJUSTMENT_CODE;
    if (!isAccrual && !isAccrualAdjustment) {
      continue;
    }
    const interest = toNumber(transaction.interestPortion);
    if (interest === 0) {
      continue;
    }
    const date = parseDate(transaction.date);
    const key = monthKey(date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + (isAccrualAdjustment ? -interest : interest));
    if (!lastAccrualDate || date > lastAccrualDate) {
      lastAccrualDate = date;
    }
  }

  return { byMonth, lastAccrualDate };
}

/**
 * Builds the month-by-month accrual rows: principal from the repayment schedule, "Interest Accrued" from the
 * posted accrual transactions.
 */
export function computeMonthlyAccrualRows(options: AccrualComputationOptions): AccrualReportRow[] {
  const { periods, transactions, startDate, businessDate, parseDate, formatMonthEnd } = options;
  const rows: AccrualReportRow[] = [];

  if (!periods || periods.length === 0) {
    return rows;
  }

  const { byMonth: postedAccrualByMonth, lastAccrualDate } = sumPostedAccrualInterestByMonth(transactions, parseDate);
  const maturityDate = options.maturityDate;
  const lastReportDate = lastAccrualDate && lastAccrualDate > maturityDate ? lastAccrualDate : maturityDate;

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
  const finalMonth = new Date(lastReportDate.getFullYear(), lastReportDate.getMonth(), 1);

  while (currentMonth <= finalMonth) {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const isFirstMonth = sameMonth(currentMonth, startDate);
    const isMaturityMonth = sameMonth(currentMonth, maturityDate);

    const monthEndDate = isMaturityMonth ? new Date(maturityDate) : new Date(year, month + 1, 0);
    const monthStartDate = isFirstMonth ? new Date(startDate) : new Date(year, month, 1);

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

    // Closing principal (balance after this month's payment).
    let closingPrincipal = openingPrincipal;
    if (periodsDueThisMonth.length > 0) {
      closingPrincipal = toNumber(periodsDueThisMonth[periodsDueThisMonth.length - 1].principalLoanBalanceOutstanding);
    }
    if (isMaturityMonth) {
      closingPrincipal = 0;
    }

    const interestAccrued =
      monthStartDate > businessDate ? null : (postedAccrualByMonth.get(monthKey(currentMonth)) ?? 0);

    rows.push({
      Index: index,
      'End of Month': formatMonthEnd(monthEndDate),
      'Opening Principal': openingPrincipal.toFixed(2),
      'Closing Principal': closingPrincipal.toFixed(2),
      'Interest Accrued': interestAccrued !== null ? interestAccrued.toFixed(2) : ''
    });

    previousPrincipalBalance = closingPrincipal;
    currentMonth = new Date(year, month + 1, 1);
    index++;
  }

  return rows;
}
