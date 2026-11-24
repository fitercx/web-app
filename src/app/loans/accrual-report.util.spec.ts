import {
  ACCRUAL_FORECAST_NOTE,
  appendAccrualTotals,
  computeMonthlyAccrualRows,
  isAccrualForecastEnabled
} from './accrual-report.util';

const parseDate = (value: any): Date => (Array.isArray(value) ? new Date(value[0], value[1] - 1, value[2]) : value);
const formatMonthEnd = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const ymd = (year: number, month: number, day: number): number[] => [
  year,
  month,
  day
];

const accrual = (date: number[], interestPortion: number, extra: any = {}) => ({
  date,
  interestPortion,
  reversed: false,
  type: { code: 'loanTransactionType.accrual', accrual: true },
  ...extra
});

/** One accrual per day of `amount`, for each day from `from` to `to` inclusive. */
const dailyAccruals = (from: Date, to: Date, amount: number) => {
  const result = [];
  for (let day = new Date(from); day <= to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    result.push(accrual(ymd(day.getFullYear(), day.getMonth() + 1, day.getDate()), amount));
  }
  return result;
};

// Disbursed 22 Jun 2026. Installment 1 covers 22 Jun - 22 Jul (30 days, 30.00 interest = 1.00/day),
// installment 2 covers 22 Jul - 22 Aug (31 days, 31.00 interest = 1.00/day). Lifetime interest 61.00.
const periods = [
  { dueDate: ymd(2026, 6, 22), principalDisbursed: 1000, principalLoanBalanceOutstanding: 1000 },
  {
    period: 1,
    fromDate: ymd(2026, 6, 22),
    dueDate: ymd(2026, 7, 22),
    principalDue: 500,
    principalLoanBalanceOutstanding: 500,
    interestOriginalDue: 30,
    interestDue: 30
  },
  {
    period: 2,
    fromDate: ymd(2026, 7, 22),
    dueDate: ymd(2026, 8, 22),
    principalDue: 500,
    principalLoanBalanceOutstanding: 0,
    interestOriginalDue: 31,
    interestDue: 31
  }
];

function build(transactions: any[], businessDate: Date, options: { forecastEnabled?: boolean; periods?: any[] } = {}) {
  return computeMonthlyAccrualRows({
    periods: options.periods ?? periods,
    transactions,
    startDate: new Date(2026, 5, 22),
    maturityDate: new Date(2026, 7, 22),
    businessDate,
    forecastEnabled: options.forecastEnabled ?? true,
    parseDate,
    formatMonthEnd
  });
}

const actual = (rows: any[]) => rows.map((r) => r['Interest Accrued (Actual)']);
const forecast = (rows: any[]) => rows.map((r) => r['Interest Forecast']);
const sum = (values: string[]) => values.reduce((total, value) => total + (Number(value) || 0), 0);

describe('computeMonthlyAccrualRows', () => {
  describe('Interest Accrued (Actual)', () => {
    it('sums posted daily accrual interest per value-date month', () => {
      const rows = build(
        [
          accrual(ymd(2026, 6, 23), 0.5),
          accrual(ymd(2026, 6, 30), 0.5),
          accrual(ymd(2026, 7, 1), 0.7),
          accrual(ymd(2026, 7, 31), 0.3)],
        new Date(2026, 7, 5)
      );

      expect(actual(rows)).toEqual([
        '1.00',
        '1.00',
        '0.00'
      ]);
      expect(Object.keys(rows[0])).toEqual([
        'Index',
        'End of Month',
        'Opening Principal',
        'Closing Principal',
        'Interest Accrued (Actual)',
        'Interest Forecast'
      ]);
    });

    it('excludes reversed accruals, nets accrual adjustments and ignores non-accrual transactions', () => {
      const rows = build(
        [
          accrual(ymd(2026, 7, 10), 2),
          accrual(ymd(2026, 7, 11), 5, { reversed: true }),
          accrual(ymd(2026, 7, 12), 0.5, { type: { code: 'loanTransactionType.accrualAdjustment' } }),
          accrual(ymd(2026, 7, 22), 20, { type: { code: 'loanTransactionType.repayment', repayment: true } })
        ],
        new Date(2026, 7, 5)
      );

      expect(rows[1]['Interest Accrued (Actual)']).toBe('1.50');
    });

    it('leaves months starting after the business date blank', () => {
      const rows = build([accrual(ymd(2026, 6, 25), 1)], new Date(2026, 6, 15));

      expect(actual(rows)).toEqual([
        '1.00',
        '0.00',
        ''
      ]);
    });

    it('extends past maturity when accruals were posted after the maturity month', () => {
      const rows = build([accrual(ymd(2026, 9, 3), 0.4)], new Date(2026, 9, 10), { forecastEnabled: false });

      expect(rows.length).toBe(4);
      expect(rows[3]['End of Month']).toBe('2026-09-30');
      expect(rows[3]['Interest Accrued (Actual)']).toBe('0.40');
    });
  });

  describe('Interest Forecast', () => {
    it('spreads each installment evenly over its days and splits periods that span two months', () => {
      const rows = build([], new Date(2026, 5, 22));

      // June: 23-30 Jun of installment 1 (8 days). July: 1-22 Jul of installment 1 (22) + 23-31 Jul of
      // installment 2 (9). August: 1-22 Aug of installment 2 (22).
      expect(forecast(rows)).toEqual([
        '8.00',
        '31.00',
        '22.00'
      ]);
      expect(sum(forecast(rows))).toBeCloseTo(61, 2);
    });

    it('fills both Actual and Forecast for the current month and forecasts unposted lag days', () => {
      // Accruals posted daily up to 5 Jul, but the business date is 10 Jul (6-9 Jul not yet posted).
      const rows = build(dailyAccruals(new Date(2026, 5, 23), new Date(2026, 6, 5), 1), new Date(2026, 6, 10));

      expect(actual(rows)).toEqual([
        '8.00',
        '5.00',
        ''
      ]);
      // July forecast: 6-22 Jul of installment 1 (17 days) + 23-31 Jul of installment 2 (9 days).
      expect(forecast(rows)).toEqual([
        '',
        '26.00',
        '22.00'
      ]);
      expect(sum(actual(rows)) + sum(forecast(rows))).toBeCloseTo(61, 2);
    });

    it('reconciles a partially accrued installment so Actual + Forecast equals the schedule interest', () => {
      // 10.00 posted for installment 1 (not at the per-day rate); 20.00 remains over 1-22 Jul.
      const rows = build([accrual(ymd(2026, 6, 30), 10)], new Date(2026, 5, 30));

      expect(forecast(rows)).toEqual([
        '',
        '29.00',
        '22.00'
      ]);
      expect(sum(actual(rows)) + sum(forecast(rows))).toBeCloseTo(61, 2);
    });

    it('uses interestDue so waived interest is not forecast', () => {
      const waivedPeriods = periods.map((p) =>
        p.period === 1 ? { ...p, interestOriginalDue: 30, interestWaived: 10, interestDue: 20 } : p
      );
      const rows = build([], new Date(2026, 5, 22), { periods: waivedPeriods });

      expect(sum(forecast(rows))).toBeCloseTo(51, 2);
    });

    it('does not forecast for loans with forecasting disabled', () => {
      const rows = build([], new Date(2026, 5, 22), { forecastEnabled: false });

      expect(forecast(rows)).toEqual([
        '',
        '',
        ''
      ]);
    });

    it('does not forecast past maturity once the schedule is fully accrued', () => {
      const rows = build(dailyAccruals(new Date(2026, 5, 23), new Date(2026, 7, 22), 1), new Date(2026, 8, 10));

      expect(rows.length).toBe(3);
      expect(forecast(rows)).toEqual([
        '',
        '',
        ''
      ]);
      expect(sum(actual(rows))).toBeCloseTo(61, 2);
    });
  });
});

describe('appendAccrualTotals', () => {
  it('adds column totals, the lifetime total and the assumption note', () => {
    const rows = build(dailyAccruals(new Date(2026, 5, 23), new Date(2026, 6, 5), 1), new Date(2026, 6, 10));
    const sheet = appendAccrualTotals(rows, true);

    expect(sheet.length).toBe(rows.length + 3);
    expect(sheet[rows.length]).toEqual({
      Index: 'Total',
      'Interest Accrued (Actual)': '13.00',
      'Interest Forecast': '48.00'
    });
    expect(sheet[rows.length + 1]).toEqual({
      Index: 'Total Lifetime Interest (Actual + Forecast)',
      'Interest Forecast': '61.00'
    });
    expect(sheet[rows.length + 2]).toEqual({ Index: ACCRUAL_FORECAST_NOTE });
  });

  it('omits the forecast total and the note when forecasting is disabled', () => {
    const rows = build([accrual(ymd(2026, 6, 25), 1)], new Date(2026, 6, 10), { forecastEnabled: false });
    const sheet = appendAccrualTotals(rows, false);

    expect(sheet.length).toBe(rows.length + 2);
    expect(sheet[rows.length]).toEqual({ Index: 'Total', 'Interest Accrued (Actual)': '1.00' });
    expect(sheet[rows.length + 1]).toEqual({
      Index: 'Total Lifetime Interest (Actual + Forecast)',
      'Interest Forecast': '1.00'
    });
  });
});

describe('isAccrualForecastEnabled', () => {
  it('is enabled for active loans and disabled for closed, overpaid, written-off and charged-off loans', () => {
    expect(isAccrualForecastEnabled({ status: { active: true } })).toBe(true);
    expect(isAccrualForecastEnabled({ status: { closed: true, closedObligationsMet: true } })).toBe(false);
    expect(isAccrualForecastEnabled({ status: { overpaid: true } })).toBe(false);
    expect(isAccrualForecastEnabled({ status: { closed: true, closedWrittenOff: true } })).toBe(false);
    expect(isAccrualForecastEnabled({ status: { active: true }, chargedOff: true })).toBe(false);
  });
});
