export interface ChronologicalTransaction {
  id?: number | string;
  date?: number[] | Date | string | null;
  submittedOnDate?: number[] | Date | string | null;
}

/**
 * Returns transactions with the latest posting first without mutating the API response.
 * The transaction id puts the latest event first for transactions posted on the same day.
 */
export function sortTransactionsByLatest<T extends ChronologicalTransaction>(transactions: T[] = []): T[] {
  return transactions.slice().sort((left, right) => {
    const dateDifference = transactionDateValue(right) - transactionDateValue(left);
    if (dateDifference !== 0) {
      return dateDifference;
    }

    return compareTransactionIds(right.id, left.id);
  });
}

function transactionDateValue(transaction: ChronologicalTransaction): number {
  return dateValue(transaction.submittedOnDate) ?? dateValue(transaction.date) ?? Number.MIN_SAFE_INTEGER;
}

function dateValue(value: ChronologicalTransaction['date']): number | null {
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

function compareTransactionIds(leftId: number | string | undefined, rightId: number | string | undefined): number {
  const leftNumber = Number(leftId);
  const rightNumber = Number(rightId);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(leftId ?? '').localeCompare(String(rightId ?? ''));
}
