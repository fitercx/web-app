import { sortTransactionsByLatest } from './transaction-chronology';

describe('Transaction chronology', () => {
  it('sorts latest transaction date and transaction id first', () => {
    const transactions = [
      { id: 30, submittedOnDate: [
          2026,
          8,
          22
        ], date: [
          2026,
          8,
          21
        ] },
      { id: 10, submittedOnDate: [
          2026,
          8,
          21
        ], date: [
          2026,
          8,
          21
        ] },
      { id: 20, submittedOnDate: [
          2026,
          8,
          22
        ], date: [
          2026,
          8,
          21
        ] }
    ];

    expect(sortTransactionsByLatest(transactions).map((transaction) => transaction.id)).toEqual([
      30,
      20,
      10
    ]);
  });

  it('falls back to value date and does not mutate the source list', () => {
    const transactions = [
      { id: 2, date: [
          2026,
          8,
          22
        ] },
      { id: 1, date: [
          2026,
          8,
          21
        ] }
    ];

    expect(sortTransactionsByLatest(transactions).map((transaction) => transaction.id)).toEqual([
      2,
      1
    ]);
    expect(transactions.map((transaction) => transaction.id)).toEqual([
      2,
      1
    ]);
  });
});
