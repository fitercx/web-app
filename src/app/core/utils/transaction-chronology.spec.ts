import { sortTransactionsByValueDate } from './transaction-chronology';

describe('Transaction chronology', () => {
  it('sorts latest value date first regardless of posting date', () => {
    const transactions = [
      { id: 10, submittedOnDate: [
          2026,
          8,
          20
        ], date: [
          2026,
          8,
          20
        ] },
      { id: 30, submittedOnDate: [
          2026,
          8,
          25
        ], date: [
          2026,
          8,
          18
        ] },
      { id: 20, submittedOnDate: [
          2026,
          8,
          22
        ], date: [
          2026,
          8,
          22
        ] }
    ];

    expect(sortTransactionsByValueDate(transactions).map((transaction) => transaction.id)).toEqual([
      20,
      10,
      30
    ]);
  });

  it('breaks same value date ties by the latest transaction id', () => {
    const transactions = [
      { id: 10, date: [
          2026,
          8,
          21
        ] },
      { id: 30, date: [
          2026,
          8,
          21
        ] },
      { id: 20, date: [
          2026,
          8,
          21
        ] }
    ];

    expect(sortTransactionsByValueDate(transactions).map((transaction) => transaction.id)).toEqual([
      30,
      20,
      10
    ]);
  });

  it('places reversed transactions by their original value date', () => {
    const transactions = [
      { id: 3, date: [
          2026,
          8,
          25
        ], reversed: false },
      { id: 4, date: [
          2026,
          8,
          10
        ], reversed: true },
      { id: 1, date: [
          2026,
          8,
          5
        ], reversed: false }
    ];

    expect(sortTransactionsByValueDate(transactions).map((transaction) => transaction.id)).toEqual([
      3,
      4,
      1
    ]);
  });

  it('does not mutate the source list', () => {
    const transactions = [
      { id: 1, date: [
          2026,
          8,
          21
        ] },
      { id: 2, date: [
          2026,
          8,
          22
        ] }
    ];

    sortTransactionsByValueDate(transactions);

    expect(transactions.map((transaction) => transaction.id)).toEqual([
      1,
      2
    ]);
  });
});
