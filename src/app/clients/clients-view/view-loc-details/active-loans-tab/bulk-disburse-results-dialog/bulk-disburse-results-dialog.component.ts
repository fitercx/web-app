import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BulkLoanDisbursementResponse, SingleLoanDisbursementResult } from 'app/clients/clients.service';

export interface BulkDisburseResultsDialogData {
  response: BulkLoanDisbursementResponse;
  locCurrency: string;
}

@Component({
  selector: 'mifosx-bulk-disburse-results-dialog',
  templateUrl: './bulk-disburse-results-dialog.component.html',
  styleUrls: ['./bulk-disburse-results-dialog.component.scss']
})
export class BulkDisburseResultsDialogComponent {
  /** Displayed columns for results table */
  displayedColumns: string[] = [
    'loanAccountNo',
    'invoiceNo',
    'amount',
    'status'
  ];

  constructor(
    public dialogRef: MatDialogRef<BulkDisburseResultsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BulkDisburseResultsDialogData
  ) {}

  /**
   * Get the status icon based on success/failure
   */
  getStatusIcon(result: SingleLoanDisbursementResult): string {
    return result.success ? 'check_circle' : 'error';
  }

  /**
   * Get the status icon color
   */
  getStatusIconColor(result: SingleLoanDisbursementResult): string {
    return result.success ? 'success' : 'warn';
  }

  /**
   * Get the status text
   */
  getStatusText(result: SingleLoanDisbursementResult): string {
    return result.success ? 'Success' : 'Failed';
  }

  /**
   * Get the error message for failed disbursements
   */
  getErrorMessage(result: SingleLoanDisbursementResult): string {
    return result.errorMessage || result.errorCode || 'Unknown error';
  }

  /**
   * Get the amount for display
   */
  getAmount(result: SingleLoanDisbursementResult): number | null {
    return result.amountDisbursed ?? null;
  }

  /**
   * Get overall status icon
   */
  getOverallStatusIcon(): string {
    switch (this.data.response.status) {
      case 'COMPLETE':
        return 'check_circle';
      case 'PARTIAL':
        return 'warning';
      case 'FAILED':
        return 'error';
      default:
        return 'info';
    }
  }

  /**
   * Get overall status color class
   */
  getOverallStatusClass(): string {
    switch (this.data.response.status) {
      case 'COMPLETE':
        return 'status-complete';
      case 'PARTIAL':
        return 'status-partial';
      case 'FAILED':
        return 'status-failed';
      default:
        return '';
    }
  }

  /**
   * Close the dialog
   */
  close(): void {
    this.dialogRef.close();
  }
}
