import * as XLSX from 'xlsx';

export type TransactionExportCell = string | number | null | undefined;

export interface TransactionExportColumn<T> {
  header: string;
  value: (transaction: T) => TransactionExportCell;
}

/**
 * Builds worksheet rows in the given transaction order so exports match the on-screen table.
 */
export function buildTransactionExportRows<T>(
  transactions: T[],
  columns: TransactionExportColumn<T>[]
): Record<string, string | number>[] {
  return transactions.map((transaction) =>
    columns.reduce(
      (row, column) => {
        row[column.header] = column.value(transaction) ?? '';
        return row;
      },
      {} as Record<string, string | number>
    )
  );
}

export function exportTransactionsToExcel<T>(
  transactions: T[],
  columns: TransactionExportColumn<T>[],
  sheetName: string,
  fileName: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(buildTransactionExportRows(transactions, columns), {
    header: columns.map((column) => column.header)
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export function transactionExportFileName(prefix: string, accountIdentifier: string, businessDate: Date): string {
  const identifier = String(accountIdentifier ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'account';
  const year = businessDate.getFullYear();
  const month = `${businessDate.getMonth() + 1}`.padStart(2, '0');
  const day = `${businessDate.getDate()}`.padStart(2, '0');
  return `${prefix}_${identifier}_${year}${month}${day}.xlsx`;
}
