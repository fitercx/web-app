import { computeMonthlyAccrualRows } from './accrual-report.util';

const parseDate = (value: any): Date => (Array.isArray(value) ? new Date(value[0], value[1] - 1, value[2]) : value);
const formatMonthEnd = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const accrual = (date: number[], interestPortion: number, extra: any = {}) => ({
  date,
  interestPortion,
  reversed: false,
  type: { code: 'loanTransactionType.accrual', accrual: true },
  ...extra
});

const periods = [
  { period: 0, dueDate: [
      2026,
      6,
      22
    ], principalDisbursed: 1000, principalLoanBalanceOutstanding: 1000 },
  { period: 1, dueDate: [
      2026,
      7,
      22
    ], principalDue: 500, principalLoanBalanceOutstanding: 500, interestOriginalDue: 20 },
  { period: 2, dueDate: [
      2026,
      8,
      22
    ], principalDue: 500, principalLoanBalanceOutstanding: 0, interestOriginalDue: 10 }
];

function build(transactions: any[], businessDate: Date, maturityDate = new Date(2026, 7, 22)) {
  return computeMonthlyAccrualRows({
    periods,
    transactions,
    startDate: new Date(2026, 5, 22),
    maturityDate,
    businessDate,
    parseDate,
    formatMonthEnd
  });
}

describe('computeMonthlyAccrualRows', () => {
  it('sums posted daily accrual interest per calendar month', () => {
    const rows = build(
      [
        accrual(
          [
            2026,
            6,
            23
          ],
          0.5
        ),
        accrual(
          [
            2026,
            6,
            30
          ],
          0.5
        ),
        accrual(
          [
            2026,
            7,
            1
          ],
          0.7
        ),
        accrual(
          [
            2026,
            7,
            31
          ],
          0.3
        )
      ],
      new Date(2026, 7, 5)
    );

    expect(rows.map((r) => r['Interest Accrued'])).toEqual([
      '1.00',
      '1.00',
      '0.00'
    ]);
    expect(Object.keys(rows[0])).toEqual([
      'Index',
      'End of Month',
      'Opening Principal',
      'Closing Principal',
      'Interest Accrued'
    ]);
  });

  it('excludes reversed accruals, nets accrual adjustments and ignores non-accrual transactions', () => {
    const rows = build(
      [
        accrual(
          [
            2026,
            7,
            10
          ],
          2
        ),
        accrual(
          [
            2026,
            7,
            11
          ],
          5,
          { reversed: true }
        ),
        accrual(
          [
            2026,
            7,
            12
          ],
          0.5,
          { type: { code: 'loanTransactionType.accrualAdjustment' } }
        ),
        accrual(
          [
            2026,
            7,
            22
          ],
          20,
          { type: { code: 'loanTransactionType.repayment', repayment: true } }
        )
      ],
      new Date(2026, 7, 5)
    );

    expect(rows[1]['Interest Accrued']).toBe('1.50');
  });

  it('leaves months starting after the business date blank', () => {
    const rows = build(
      [
        accrual(
          [
            2026,
            6,
            25
          ],
          1
        )
      ],
      new Date(2026, 6, 15)
    );

    expect(rows.map((r) => r['Interest Accrued'])).toEqual([
      '1.00',
      '0.00',
      ''
    ]);
  });

  it('extends past maturity when accruals were posted after the maturity month', () => {
    const rows = build(
      [
        accrual(
          [
            2026,
            9,
            3
          ],
          0.4
        )
      ],
      new Date(2026, 9, 10)
    );

    expect(rows.length).toBe(4);
    expect(rows[3]['End of Month']).toBe('2026-09-30');
    expect(rows[3]['Interest Accrued']).toBe('0.40');
  });
});
