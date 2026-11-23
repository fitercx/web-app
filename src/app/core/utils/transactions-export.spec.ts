import { buildTransactionExportRows, transactionExportFileName } from './transactions-export';

describe('Transactions export', () => {
  it('builds one row per transaction in the given order with blank cells for missing values', () => {
    const rows = buildTransactionExportRows(
      [
        { id: 2, amount: 50 },
        { id: 1, amount: null }
      ],
      [
        { header: 'Id', value: (t) => t.id },
        { header: 'Amount', value: (t) => t.amount }
      ]
    );

    expect(rows).toEqual([
      { Id: 2, Amount: 50 },
      { Id: 1, Amount: '' }
    ]);
  });

  it('names the file after the account and business date', () => {
    expect(transactionExportFileName('LoanTransactions', '000/101', new Date(2026, 9, 7))).toBe(
      'LoanTransactions_000101_20261007.xlsx'
    );
  });
});
