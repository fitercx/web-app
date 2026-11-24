/**
 * Shared computation for the loan Accrual Report Excel download.
 *
 * The report lists one row per calendar month from disbursal to maturity with:
 *   Index, End of Month, Opening Principal, Closing Principal, Interest Accrued (Actual), Interest Forecast.
 *
 * "Interest Accrued (Actual)" is the interest actually posted by the daily accrual job: the interest portion of the
 * loan's non-reversed Accrual transactions, net of Accrual Adjustments, bucketed by value-date month. This is the
 * same figure as adding up the accrual rows on the loan's Transactions tab. Future months are blank.
 *
 * "Interest Forecast" is the scheduled interest still to be accrued, mirroring Fineract's daily accrual
 * (AbstractCumulativeLoanScheduleGenerator.getPeriodInterestTillDate): each installment's interest accrues evenly
 * per day over (fromDate, dueDate]. Per installment, the forecast is the installment's interest (interestDue, net of
 * waivers/write-offs) minus the accruals already posted inside that period, spread over the period's days after the
 * latest posted accrual. Actual + Forecast therefore equals the schedule's total interest. If a fully elapsed period
 * is still under-accrued, the remainder is forecast in the business-date month, when the next accrual run posts it.
 *
 * If accruals were posted after the maturity month (e.g. an overdue loan that keeps accruing), the report is extended
 * to cover those months so the total matches the posted accruals.
 */

export interface AccrualReportRow {
  Index: number;
  'End of Month': string;
  'Opening Principal': string;
  'Closing Principal': string;
  'Interest Accrued (Actual)': string;
  'Interest Forecast': string;
}

/** A sheet row: a month row, or a total/note row whose Index cell holds a label and whose blank cells are omitted. */
export type AccrualReportSheetRow = Partial<Omit<AccrualReportRow, 'Index'>> & { Index: number | string };

export interface AccrualComputationOptions {
  /** Repayment schedule periods (each with fromDate, dueDate, interestDue, principalLoanBalanceOutstanding, ...). */
  periods: any[];
  /** Loan transactions (GET /loans/{id}?associations=transactions); accrual rows drive both interest columns. */
  transactions: any[];
  /** Loan start / disbursal date. */
  startDate: Date;
  /** Loan maturity (last installment due date). */
  maturityDate: Date;
  /** Present business date; Actual is blank for months starting after it. */
  businessDate: Date;
  /** False for loans that will not accrue any more scheduled interest (see isAccrualForecastEnabled). */
  forecastEnabled: boolean;
  /** Parses a schedule date value (number[] or Date) into a Date. */
  parseDate: (value: any) => Date;
  /** Formats the End-of-Month date for display. */
  formatMonthEnd: (date: Date) => string;
}

export const ACCRUAL_FORECAST_NOTE =
  'Interest Forecast assumes the current repayment schedule (no prepayments, reschedules or rate changes) and excludes late payment interest.';

/** Column widths for the sheet, in AccrualReportRow column order. */
export const ACCRUAL_REPORT_COLUMN_WIDTHS = [
  8,
  15,
  18,
  18,
  24,
  18
].map((wch) => ({ wch }));

/** Rows appended after the month rows by appendAccrualTotals that are rendered bold (Total, Total Lifetime Interest). */
export const ACCRUAL_BOLD_TOTAL_ROW_COUNT = 2;

const ACCRUAL_CODE = 'loanTransactionType.accrual';
const ACCRUAL_ADJUSTMENT_CODE = 'loanTransactionType.accrualAdjustment';
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_DISPLAY_AMOUNT = 0.005;

interface PostedAccrual {
  date: Date;
  interest: number;
}

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

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MILLIS_PER_DAY);
}

function addToMonth(byMonth: Map<string, number>, date: Date, amount: number): void {
  const key = monthKey(date);
  byMonth.set(key, (byMonth.get(key) ?? 0) + amount);
}

function formatAmount(value: number | null): string {
  return value !== null ? value.toFixed(2) : '';
}

/**
 * Appends the "Total" row (per column), the "Total Lifetime Interest" row (Actual + Forecast) and, when forecasting,
 * the assumption note. Blank cells are omitted so the row labels can overflow into the empty columns in Excel.
 */
export function appendAccrualTotals(rows: AccrualReportRow[], forecastEnabled: boolean): AccrualReportSheetRow[] {
  const actualTotal = rows.reduce((sum, row) => sum + toNumber(row['Interest Accrued (Actual)']), 0);
  const forecastTotal = rows.reduce((sum, row) => sum + toNumber(row['Interest Forecast']), 0);

  const result: AccrualReportSheetRow[] = [
    ...rows,
    {
      Index: 'Total',
      'Interest Accrued (Actual)': actualTotal.toFixed(2),
      ...(forecastEnabled ? { 'Interest Forecast': forecastTotal.toFixed(2) } : {})
    },
    {
      Index: 'Total Lifetime Interest (Actual + Forecast)',
      'Interest Forecast': (actualTotal + forecastTotal).toFixed(2)
    }
  ];
  if (forecastEnabled) {
    result.push({ Index: ACCRUAL_FORECAST_NOTE });
  }
  return result;
}

/** No forecast for loans that are closed, overpaid, written off or charged off. */
export function isAccrualForecastEnabled(loan: any): boolean {
  const status = loan?.status ?? {};
  return !(
    status.closed ||
    status.closedObligationsMet ||
    status.closedWrittenOff ||
    status.closedRescheduled ||
    status.overpaid ||
    loan?.chargedOff
  );
}

/** Posted accrual interest entries (Accrual positive, Accrual Adjustment negative, reversed rows excluded). */
function collectPostedAccruals(transactions: any[], parseDate: (value: any) => Date): PostedAccrual[] {
  const entries: PostedAccrual[] = [];
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
    entries.push({ date: parseDate(transaction.date), interest: isAccrualAdjustment ? -interest : interest });
  }
  return entries;
}

/** Scheduled interest still to accrue, per calendar month (see file header for the method). */
function computeForecastByMonth(
  periods: any[],
  postedAccruals: PostedAccrual[],
  lastAccrualDate: Date | null,
  businessDate: Date,
  parseDate: (value: any) => Date
): Map<string, number> {
  const byMonth = new Map<string, number>();

  for (const period of periods) {
    const interest = toNumber(period.interestDue);
    if (!period.period || !period.fromDate || !period.dueDate || interest <= 0) {
      continue;
    }
    const fromDate = parseDate(period.fromDate);
    const dueDate = parseDate(period.dueDate);
    if (dueDate <= fromDate) {
      continue;
    }

    const postedInPeriod = postedAccruals
      .filter((entry) => entry.date > fromDate && entry.date <= dueDate)
      .reduce((sum, entry) => sum + entry.interest, 0);
    const remaining = interest - postedInPeriod;
    if (remaining <= 0) {
      continue;
    }

    const accrueFrom = lastAccrualDate && lastAccrualDate > fromDate ? lastAccrualDate : fromDate;
    const remainingDays = daysBetween(accrueFrom, dueDate);
    if (remainingDays <= 0) {
      addToMonth(byMonth, businessDate, remaining);
      continue;
    }

    const perDay = remaining / remainingDays;
    for (let day = 1; day <= remainingDays; day++) {
      addToMonth(
        byMonth,
        new Date(accrueFrom.getFullYear(), accrueFrom.getMonth(), accrueFrom.getDate() + day),
        perDay
      );
    }
  }

  return byMonth;
}

/**
 * Builds the month-by-month accrual rows: principal from the repayment schedule, "Interest Accrued (Actual)" from
 * the posted accrual transactions and "Interest Forecast" from the schedule interest not yet accrued.
 */
export function computeMonthlyAccrualRows(options: AccrualComputationOptions): AccrualReportRow[] {
  const { periods, transactions, startDate, businessDate, forecastEnabled, parseDate, formatMonthEnd } = options;
  const rows: AccrualReportRow[] = [];

  if (!periods || periods.length === 0) {
    return rows;
  }

  const postedAccruals = collectPostedAccruals(transactions, parseDate);
  const postedAccrualByMonth = new Map<string, number>();
  let lastAccrualDate: Date | null = null;
  for (const entry of postedAccruals) {
    addToMonth(postedAccrualByMonth, entry.date, entry.interest);
    if (!lastAccrualDate || entry.date > lastAccrualDate) {
      lastAccrualDate = entry.date;
    }
  }

  const forecastByMonth = forecastEnabled
    ? computeForecastByMonth(periods, postedAccruals, lastAccrualDate, businessDate, parseDate)
    : new Map<string, number>();

  const maturityDate = options.maturityDate;
  let lastReportDate = lastAccrualDate && lastAccrualDate > maturityDate ? lastAccrualDate : maturityDate;
  if (forecastByMonth.has(monthKey(businessDate)) && businessDate > lastReportDate) {
    lastReportDate = businessDate;
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

    const key = monthKey(currentMonth);
    const interestAccrued = monthStartDate > businessDate ? null : (postedAccrualByMonth.get(key) ?? 0);
    const forecast = forecastByMonth.get(key) ?? 0;
    const interestForecast = Math.abs(forecast) >= MIN_DISPLAY_AMOUNT ? forecast : null;

    rows.push({
      Index: index,
      'End of Month': formatMonthEnd(monthEndDate),
      'Opening Principal': openingPrincipal.toFixed(2),
      'Closing Principal': closingPrincipal.toFixed(2),
      'Interest Accrued (Actual)': formatAmount(interestAccrued),
      'Interest Forecast': formatAmount(interestForecast)
    });

    previousPrincipalBalance = closingPrincipal;
    currentMonth = new Date(year, month + 1, 1);
    index++;
  }

  return rows;
}
