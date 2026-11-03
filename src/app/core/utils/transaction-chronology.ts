export interface ChronologicalTransaction {
  id?: number | string;
  date?: number[] | Date | string | null;
}

type TransactionDate = ChronologicalTransaction['date'];

/**
 * Returns transactions with the latest value date first without mutating the API response.
 * The API exposes no created timestamp, so the transaction id orders same-day transactions by creation.
 */
export function sortTransactionsByValueDate<T extends ChronologicalTransaction>(transactions: T[] = []): T[] {
  return transactions.slice().sort((left, right) => {
    const dateDifference = sortableTimestamp(right.date) - sortableTimestamp(left.date);
    if (dateDifference !== 0) {
      return dateDifference;
    }

    return compareTransactionIds(right.id, left.id);
  });
}

function transactionDateToTimestamp(value: TransactionDate): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (Array.isArray(value) && value.length >= 3) {
    return Date.UTC(value[0], value[1] - 1, value[2], value[3] || 0, value[4] || 0, value[5] || 0);
  }

  if (typeof value === 'string' && value) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  return null;
}

function sortableTimestamp(value: TransactionDate): number {
  return transactionDateToTimestamp(value) ?? Number.MIN_SAFE_INTEGER;
}

function compareTransactionIds(leftId: number | string | undefined, rightId: number | string | undefined): number {
  const leftNumber = Number(leftId);
  const rightNumber = Number(rightId);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(leftId ?? '').localeCompare(String(rightId ?? ''));
}
