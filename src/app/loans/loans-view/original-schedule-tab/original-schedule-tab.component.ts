import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Currency } from 'app/shared/models/general.model';

@Component({
  selector: 'mifosx-original-schedule-tab',
  templateUrl: './original-schedule-tab.component.html',
  styleUrls: ['./original-schedule-tab.component.scss']
})
export class OriginalScheduleTabComponent {
  /** Loan Details Data */
  originalScheduleDetails: any;
  /** Loan details data from parent */
  loanDetailsData: any;
  /** Base columns for regular loans */
  baseDisplayedColumns: string[] = [
    'number',
    'date',
    'balanceOfLoan',
    'principalDue',
    'interest',
    'fees',
    'penalties',
    'outstanding'
  ];
  /** Columns to be displayed in original schedule table. */
  displayedColumns: string[] = [];

  currency: Currency | null = null;

  /**
   * Retrieves the loans with associations data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   */
  constructor(private route: ActivatedRoute) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.currency = data.loanDetailsData.currency;
      this.originalScheduleDetails = data.loanDetailsData.originalSchedule;
      this.loanDetailsData = data.loanDetailsData;
      this.updateDisplayedColumns();
    });
  }

  /**
   * Checks if the loan is a line of credit of receivable type
   */
  private isLineOfCreditReceivable(): boolean {
    if (!this.loanDetailsData) {
      return false;
    }

    // Check if loan has a line of credit ID (indicating it's a LOC loan)
    const hasLineOfCredit = !!(
      this.loanDetailsData.lineOfCreditId || this.loanDetailsData.additionalProperties?.lineOfCreditId
    );

    if (!hasLineOfCredit) {
      return false;
    }

    // Check if it's of receivable type
    const locProductType = this.loanDetailsData.additionalProperties?.locProductType;
    return locProductType === 'RECEIVABLE';
  }

  /**
   * Updates the displayed columns based on loan type
   */
  private updateDisplayedColumns(): void {
    if (this.isLineOfCreditReceivable()) {
      // For LOC Receivable: remove principalDue column and add new LOC-specific columns at the end
      this.displayedColumns = [...this.baseDisplayedColumns].filter((col) => col !== 'principalDue');

      // Add LOC-specific columns at the end of the schedule
      this.displayedColumns.push('disbursedAmount', 'refundAmount');
    } else {
      // For regular loans: use base columns as-is
      this.displayedColumns = [...this.baseDisplayedColumns];
    }
  }

  /**
   * Calculates the disbursed amount (principal - total interest on loan) for LOC receivable loans
   * Only shows when the loan is disbursed
   */
  getDisbursedAmount(item: any): number {
    if (!this.isLineOfCreditReceivable() || !item.principalDisbursed) {
      return 0;
    }

    const principal = item.principalDisbursed || 0;
    const totalInterest = this.originalScheduleDetails?.totalInterestCharged || 0;
    return Math.max(0, principal - totalInterest);
  }

  /**
   * Calculates the refund amount for overpayments in LOC receivable loans
   */
  getRefundAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      return 0;
    }

    // Check if there's an overpayment (total paid > total due)
    const totalPaid = item.totalPaidForPeriod || 0;
    const totalDue = item.totalDueForPeriod || 0;

    if (totalPaid > totalDue) {
      return totalPaid - totalDue;
    }

    return 0;
  }
}
