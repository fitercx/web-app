import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { reversedPaidLpiForLoan, subtractReversedPaidLpi } from 'app/loans/common/reversed-paid-lpi-display.util';
import { getForeclosureUnearnedInterestDetails } from '../foreclosure-unearned-interest.utils';

@Component({
  selector: 'mifosx-general-tab',
  templateUrl: './general-tab.component.html',
  styleUrls: ['./general-tab.component.scss']
})
export class GeneralTabComponent implements OnInit {
  /** Currency Code */
  currencyCode: string;
  loanDetails: any;
  status: any;
  loanSummaryColumns: string[] = [
    'Empty',
    'Original',
    'Paid',
    'Waived',
    'Written Off',
    'Outstanding',
    'Over Due'
  ];
  loanDetailsColumns: string[] = [
    'Key',
    'Value'
  ];
  loanSummaryTableData: {
    property: string;
    original: string | number;
    adjustment: string | number;
    paid: string | number;
    waived: string | number;
    writtenOff: string | number;
    outstanding: string | number;
    overdue: string | number;
    reversedPaidLpi?: number;
    paidBeforeReversedPaidLpi?: number;
  }[];
  loanDetailsTableData: {
    key: string;
    value?: string | number;
  }[];

  /** Data source for loans summary table. */
  dataSource: MatTableDataSource<any>;
  detailsDataSource: MatTableDataSource<any>;

  netDisbursedAmount: number = null;

  constructor(private route: ActivatedRoute) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetails = data.loanDetailsData;
      this.currencyCode = this.loanDetails.currency.code;
      if (this.loanDetails.transactions) {
        this.loanDetails.transactions.some((transaction: any) => {
          if (transaction.type.code === 'loanTransactionType.chargeback') {
            this.loanSummaryColumns = [
              'Empty',
              'Original',
              'Adjustments',
              'Paid',
              'Waived',
              'Written Off',
              'Outstanding',
              'Over Due'
            ];
            return;
          }
        });
      }
    });
  }

  ngOnInit() {
    this.status = this.loanDetails.value;
    this.calculateNetDisbursedAmount();
    if (this.loanDetails.summary) {
      this.setloanSummaryTableData();
      this.setloanDetailsTableData();
    } else {
      this.setloanNonDetailsTableData();
    }
  }
  /** Calculate Net Disbursed Amount from loan details */
  calculateNetDisbursedAmount() {
    this.netDisbursedAmount = this.loanDetails.netDisbursalAmount;
  }

  /** Returns the disbursed amount based on loan status */
  getDisbursedAmount(): number {
    // Only show disbursed amount if loan status is 300 (active) or higher (e.g., active, overpaid, closed, etc.)
    // For pending approval (100) and approved (200), show 0.00
    const isDisbursed = this.loanDetails?.status?.id >= 300;
    if (!isDisbursed) {
      return 0;
    }

    if (this.loanDetails.factorRateEnabled) {
      return this.loanDetails.factorRateLoanAmount;
    }
    return this.loanDetails?.principal || 0;
  }

  /** Returns the approved amount based on loan status */
  getApprovedAmount(): number {
    // Show approved amount for approved (200) and active (300) loans
    // For pending approval (100), show 0.00
    const statusId = this.loanDetails?.status?.id;
    if (statusId === 100) {
      // Submitted and pending approval
      return 0;
    }

    if (this.isReceivableLineOfCredit()) {
      return this.getProposedAmount();
    }

    if (this.loanDetails.factorRateEnabled) {
      return this.loanDetails.factorRateLoanAmount;
    }

    return this.loanDetails?.approvedPrincipal || 0;
  }

  /** Returns the proposed amount based on type of Loan **/
  getProposedAmount(): number {
    if (this.loanDetails?.factorRateEnabled) {
      return this.loanDetails?.factorRateLoanAmount;
    }

    return this.loanDetails.proposedPrincipal;
  }

  setloanSummaryTableData() {
    const reversedPaidLpi = reversedPaidLpiForLoan(this.loanDetails);
    const penaltyOriginalBeforeReversedPaidLpi = this.loanDetails?.multiDisburseLoan
      ? this.getDisbursedTranchePenalties()
      : this.loanDetails.summary.penaltyChargesCharged;
    const totalOriginalBeforeReversedPaidLpi = this.loanDetails?.multiDisburseLoan
      ? this.getTotalOriginalForMultiTranche()
      : this.loanDetails.summary.totalExpectedRepayment;
    // Use summary for Fees row so fee/tax split from backend is shown (e.g. fee 800 + tax 44)
    // and Total Paid equals sum of components (Principal + Interest + Fees + Taxes + Penalties)
    const feesData = {
      feeChargesCharged: this.loanDetails.summary.feeChargesCharged,
      feeChargesPaid: this.loanDetails.summary.feeChargesPaid,
      feeChargesWaived: this.loanDetails.summary.feeChargesWaived,
      feeChargesWrittenOff: this.loanDetails.summary.feeChargesWrittenOff,
      feeChargesOutstanding: this.loanDetails.summary.feeChargesOutstanding,
      feeChargesOverdue: this.loanDetails.summary.feeChargesOverdue
    };

    // For multi-tranche loans, use only the disbursed amount as the principal
    const principalOriginal: string = String(this.getTotalDisbursedPrincipal());

    // For multi-tranche loans, calculate principal outstanding based on disbursed amount
    const principalOutstanding = this.loanDetails?.multiDisburseLoan
      ? this.getPrincipalOutstandingForMultiTranche()
      : this.loanDetails.summary.principalOutstanding;

    this.loanSummaryTableData = [
      {
        property: this.isReceivableLineOfCredit() ? 'Disbursal Amount' : 'Principal',
        original: principalOriginal,
        adjustment: this.loanDetails.summary.principalAdjustments || 0,
        paid: this.loanDetails.summary.principalPaid,
        waived: this.loanDetails.summary.principalWaived || 0,
        writtenOff: this.loanDetails.summary.principalWrittenOff,
        outstanding: String(principalOutstanding),
        overdue: this.loanDetails.summary.principalOverdue
      },
      {
        property: 'Interest',
        original: String(
          this.loanDetails?.multiDisburseLoan
            ? this.getDisbursedTrancheInterest()
            : this.loanDetails.summary.interestCharged
        ),
        adjustment: '0',
        paid: this.loanDetails.summary.interestPaid,
        waived: this.loanDetails.summary.interestWaived,
        writtenOff: this.loanDetails.summary.interestWrittenOff,
        outstanding: String(this.getAdjustedInterestOutstanding()),
        overdue: this.loanDetails.summary.interestOverdue
      },
      {
        property: 'Fees',
        original: feesData.feeChargesCharged,
        adjustment: '0',
        paid: feesData.feeChargesPaid,
        waived: feesData.feeChargesWaived,
        writtenOff: feesData.feeChargesWrittenOff,
        outstanding: feesData.feeChargesOutstanding,
        overdue: feesData.feeChargesOverdue
      },
      {
        property: 'Taxes',
        original: String(
          this.loanDetails?.multiDisburseLoan
            ? this.getDisbursedTrancheTaxes()
            : this.loanDetails.summary.taxChargesCharged
        ),
        adjustment: '0',
        paid: this.loanDetails.summary.taxChargesPaid,
        waived: this.loanDetails.summary.taxChargesWaived,
        writtenOff: this.loanDetails.summary.taxChargesWrittenOff,
        outstanding: this.loanDetails.summary.taxChargesOutstanding,
        overdue: this.loanDetails.summary.taxChargesOverdue
      },
      {
        property: 'Penalties',
        original: String(subtractReversedPaidLpi(penaltyOriginalBeforeReversedPaidLpi, reversedPaidLpi)),
        adjustment: '0',
        paid: subtractReversedPaidLpi(this.loanDetails.summary.penaltyChargesPaid, reversedPaidLpi),
        waived: this.loanDetails.summary.penaltyChargesWaived,
        writtenOff: this.loanDetails.summary.penaltyChargesWrittenOff,
        outstanding: this.loanDetails.summary.penaltyChargesOutstanding,
        overdue: this.loanDetails.summary.penaltyChargesOverdue,
        reversedPaidLpi
      },
      {
        property: 'Total',
        original: String(subtractReversedPaidLpi(totalOriginalBeforeReversedPaidLpi, reversedPaidLpi)),
        adjustment: this.loanDetails.summary.principalAdjustments || 0,
        paid: subtractReversedPaidLpi(this.loanDetails.summary.totalRepayment, reversedPaidLpi),
        waived: this.loanDetails.summary.totalWaived,
        writtenOff: this.loanDetails.summary.totalWrittenOff,
        outstanding: String(
          this.loanDetails?.multiDisburseLoan
            ? this.getTotalOutstandingForMultiTranche()
            : this.getAdjustedTotalOutstanding()
        ),
        overdue: this.loanDetails.summary.totalOverdue,
        reversedPaidLpi,
        paidBeforeReversedPaidLpi: this.loanDetails.summary.totalRepayment
      }
    ];
    const foreclosureDetails = getForeclosureUnearnedInterestDetails(this.loanDetails);
    const unearnedInterestDueToForeclosure = foreclosureDetails?.unearnedInterest ?? 0;
    if (unearnedInterestDueToForeclosure > 0) {
      const interestRowIndex = this.loanSummaryTableData.findIndex((row) => row.property === 'Interest');
      const insertIndex = interestRowIndex >= 0 ? interestRowIndex + 1 : this.loanSummaryTableData.length;
      this.loanSummaryTableData.splice(insertIndex, 0, {
        property: 'Unearned Interest (Foreclosure)',
        original: String(unearnedInterestDueToForeclosure),
        adjustment: '0',
        paid: '0',
        waived: String(unearnedInterestDueToForeclosure),
        writtenOff: '0',
        outstanding: '0',
        overdue: '0'
      });
    }
    if (this.loanDetails.factorRateEnabled) {
      this.loanSummaryTableData = this.loanSummaryTableData.filter((item) => item.property !== 'Interest');
    }
    this.dataSource = new MatTableDataSource(this.loanSummaryTableData);
  }

  setloanDetailsTableData() {
    this.loanDetailsTableData = [
      {
        key: 'Disbursement Date'
      },
      {
        key: 'Loan Purpose'
      },
      {
        key: 'Loan Officer'
      },
      {
        key: 'Currency'
      },
      {
        key: 'External Id'
      },
      {
        key: 'Invoice Amount',
        value: this.loanDetails?.additionalProperties?.invoiceAmount
      },
      {
        key: 'Disapproved Amount',
        value: this.loanDetails?.additionalProperties?.disapprovedAmount
      },
      {
        key: 'Proposed Amount',
        value: this.getProposedAmount()
      },
      {
        key: 'Approved Amount',
        value: this.getApprovedAmount()
      },
      {
        key: this.loanDetails.factorRateEnabled ? 'Total Repayment Amount' : 'Disburse Amount',
        value: this.getDisbursedAmount()
      },
      {
        key: 'Net Disbursed Amount',
        value: this.netDisbursedAmount
      }
    ];
    if (this.loanDetails?.factorRateEnabled) {
      this.loanDetailsTableData.push({
        key: 'Penalty Grace Period',
        value: this.loanDetails?.penaltyGracePeriod
      });
      this.loanDetailsTableData.push({
        key: 'Short Disbursal',
        value:
          this.loanDetails?.isShortDisbursal !== undefined ? (this.loanDetails.isShortDisbursal ? 'Yes' : 'No') : 'Yes'
      });
      this.loanDetailsTableData = this.loanDetailsTableData.filter((item) => item.key !== 'Disapproved Amount');
      this.loanDetailsTableData = this.loanDetailsTableData.filter((item) => item.key !== 'Invoice Amount');
    }
    this.detailsDataSource = new MatTableDataSource(this.loanDetailsTableData);
  }

  setloanNonDetailsTableData() {
    this.loanDetailsTableData = [
      {
        key: 'Disbursement Date'
      },
      {
        key: 'Currency'
      },
      {
        key: 'Loan Officer'
      },
      {
        key: 'External Id'
      },
      {
        key: 'Net Disbursed Amount',
        value: this.netDisbursedAmount
      }
    ];
    this.detailsDataSource = new MatTableDataSource(this.loanDetailsTableData);
  }

  showApprovedAmountBasedOnStatus() {
    // Always show approved amount, but it will be 0.00 for pending approval loans
    // Only hide for withdrawn or rejected loans
    if (this.status === 'Withdrawn by applicant' || this.status === 'Rejected') {
      return false;
    }
    return true;
  }

  showDisbursedAmountBasedOnStatus = function () {
    // Always show disbursed amount, but it will be 0.00 for pending approval and approved loans
    // Only hide for withdrawn or rejected loans
    if (this.status === 'Withdrawn by applicant' || this.status === 'Rejected') {
      return false;
    }
    return true;
  };

  /** Adjust interest outstanding for LOC (receivable or payable) by subtracting overpaid amount, never below zero */
  private getAdjustedInterestOutstanding(): number {
    if (!this.loanDetails?.summary) {
      return 0;
    }
    const interestOutstanding = this.loanDetails.summary.interestOutstanding || 0;
    const overPaid = this.loanDetails.totalOverpaid || this.loanDetails.overPaidAmount || 0;
    if (overPaid > 0 && this.isAnyLineOfCredit()) {
      const adjusted = interestOutstanding - overPaid;
      return adjusted < 0 ? 0 : adjusted;
    }
    return interestOutstanding;
  }

  /** Adjust total outstanding for LOC (receivable or payable) similar to interest */
  private getAdjustedTotalOutstanding(): number {
    if (!this.loanDetails?.summary) {
      return 0;
    }
    const totalOutstanding = this.loanDetails.summary.totalOutstanding || 0;
    const overPaid = this.loanDetails.totalOverpaid || this.loanDetails.overPaidAmount || 0;
    if (overPaid > 0 && this.isAnyLineOfCredit()) {
      const adjusted = totalOutstanding - overPaid;
      return adjusted < 0 ? 0 : adjusted;
    }
    return totalOutstanding;
  }

  /** Any LOC (receivable or payable) */
  private isAnyLineOfCredit(): boolean {
    const info = this.loanDetails;
    if (!info) {
      return false;
    }
    const hasLocId = !!(info.lineOfCreditId || info.additionalProperties?.lineOfCreditId);
    if (!hasLocId) {
      return false;
    }
    const locType = info.locType || info.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE' || locType === 'PAYABLE';
  }

  /** Any LOC (receivable) */
  private isReceivableLineOfCredit(): boolean {
    const info = this.loanDetails;
    if (!info) {
      return false;
    }
    const hasLocId = !!(info.lineOfCreditId || info.additionalProperties?.lineOfCreditId);
    if (!hasLocId) {
      return false;
    }
    const locType = info.locType || info.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE';
  }

  /**
   * Checks if two date arrays are equal
   * Date format: [year, month, day]
   */
  private areDateArraysEqual(date1: number[] | undefined | null, date2: number[] | undefined | null): boolean {
    if (!date1 || !date2 || date1.length !== 3 || date2.length !== 3) {
      return false;
    }
    return date1[0] === date2[0] && date1[1] === date2[1] && date1[2] === date2[2];
  }

  /**
   * Checks if a disbursement period has actually been disbursed
   * by matching with disbursementDetails that have an actualDisbursementDate
   * Falls back to checking feeChargesPaid if disbursementDetails not available
   */
  private isDisbursementPeriodDisbursed(period: any): boolean {
    if (!period.status || period.status !== 'DISBURSEMENT') {
      return false;
    }

    if (!this.loanDetails) {
      return false;
    }

    // Primary check: Use disbursementDetails if available
    if (this.loanDetails.disbursementDetails && Array.isArray(this.loanDetails.disbursementDetails)) {
      const periodDueDate = period.dueDate;
      const periodPrincipal = period.principalDisbursed || 0;

      // Find matching disbursementDetail
      const matchingDisbursement = this.loanDetails.disbursementDetails.find((disb: any) => {
        const disbExpectedDate = disb.expectedDisbursementDate;
        const disbPrincipal = disb.principal || 0;

        // Compare dates
        const datesMatch = this.areDateArraysEqual(disbExpectedDate, periodDueDate);

        // Compare principal amounts (with small tolerance for floating point)
        const principalMatch = Math.abs(disbPrincipal - periodPrincipal) < 0.01;

        return datesMatch && principalMatch;
      });

      // If found and has actualDisbursementDate, it's been disbursed
      if (matchingDisbursement) {
        return !!matchingDisbursement.actualDisbursementDate;
      }
    }

    // Fallback: Check if fees were paid (indicates disbursement occurred)
    // If feeChargesPaid > 0, it's likely been disbursed
    if (period.feeChargesPaid && period.feeChargesPaid > 0) {
      return true;
    }

    return false;
  }

  /**
   * Calculates the total disbursed principal amount for multi-tranche loans
   * Returns the sum of principal amounts from disbursementDetails that have been actually disbursed
   * Uses repaymentSchedule.totalPrincipalDisbursed if available (calculated by backend), otherwise calculates from disbursementDetails
   */
  private getTotalDisbursedPrincipal(): number {
    // If not a multi-disbursal loan, return the standard principalDisbursed value
    if (!this.loanDetails?.multiDisburseLoan) {
      return this.loanDetails?.summary?.principalDisbursed || 0;
    }

    // For multi-disbursal loans, prefer repaymentSchedule.totalPrincipalDisbursed (calculated by backend)
    // This is more reliable as it's based on actual period data
    // Accept 0 as a valid value (e.g., loan with zero principal disbursed initially)
    if (this.loanDetails?.repaymentSchedule?.totalPrincipalDisbursed != null) {
      return this.loanDetails.repaymentSchedule.totalPrincipalDisbursed;
    }

    // Fallback: calculate from disbursementDetails if repaymentSchedule total is not available
    if (!this.loanDetails?.disbursementDetails || !Array.isArray(this.loanDetails.disbursementDetails)) {
      return this.loanDetails?.summary?.principalDisbursed || 0;
    }

    // Sum principal amounts only for disbursements that have been actually disbursed
    let totalDisbursed = 0;
    this.loanDetails.disbursementDetails.forEach((disbursement: any) => {
      // Only count disbursements that have an actualDisbursementDate
      // Check for null/undefined (not truthiness) to allow zero-principal disbursements
      if (disbursement.actualDisbursementDate && disbursement.principal != null) {
        totalDisbursed += disbursement.principal * 1;
      }
    });

    return totalDisbursed;
  }

  /**
   * Calculates principal outstanding for multi-tranche loans
   * Returns: disbursed principal - paid - waived - written off
   */
  private getPrincipalOutstandingForMultiTranche(): number {
    if (!this.loanDetails?.multiDisburseLoan || !this.loanDetails?.summary) {
      return this.loanDetails?.summary?.principalOutstanding || 0;
    }

    const disbursedPrincipal = this.getTotalDisbursedPrincipal();
    const paid = this.loanDetails.summary.principalPaid || 0;
    const waived = this.loanDetails.summary.principalWaived || 0;
    const writtenOff = this.loanDetails.summary.principalWrittenOff || 0;

    const outstanding = disbursedPrincipal - paid - waived - writtenOff;
    return Math.max(0, outstanding); // Ensure non-negative
  }

  /**
   * Calculates interest charged for multi-tranche loans based only on disbursed tranches
   * Uses repaymentSchedule.totalInterestCharged (calculated by backend) which is based on disbursed principal
   * This is more reliable than manually summing periods since the backend handles all edge cases
   */
  private getDisbursedTrancheInterest(): number {
    if (!this.loanDetails?.multiDisburseLoan) {
      return this.loanDetails?.summary?.interestCharged || 0;
    }

    // For multi-tranche loans, use repaymentSchedule.totalInterestCharged
    // The backend calculates this based on actual disbursed principal, so it's accurate
    // Accept 0 as a valid value (e.g., loan with zero interest charged)
    if (this.loanDetails?.repaymentSchedule?.totalInterestCharged != null) {
      return this.loanDetails.repaymentSchedule.totalInterestCharged;
    }

    // Fallback to summary if repaymentSchedule total is not available
    return this.loanDetails?.summary?.interestCharged || 0;
  }

  /**
   * Calculates tax charges for multi-tranche loans based only on disbursed tranches
   * Uses original values (taxChargesOriginalDue) when available, falling back to current values (taxChargesDue)
   */
  private getDisbursedTrancheTaxes(): number {
    if (!this.loanDetails?.multiDisburseLoan || !this.loanDetails?.repaymentSchedule?.periods) {
      return this.loanDetails?.summary?.taxChargesCharged || 0;
    }

    let totalTaxes = 0;
    this.loanDetails.repaymentSchedule.periods.forEach((period: any) => {
      if (this.isDisbursementPeriodDisbursed(period)) {
        // Use original value when available, fall back to current value
        totalTaxes += period.taxChargesOriginalDue || period.taxChargesDue || 0;
      }
    });

    // When schedule has no tax in disbursement periods (e.g. VAT at disbursement not in period breakdown),
    // use summary.taxChargesCharged so backend-provided VAT is displayed
    return totalTaxes > 0 ? totalTaxes : this.loanDetails?.summary?.taxChargesCharged || 0;
  }

  /**
   * Calculates penalty charges for multi-tranche loans based only on disbursed tranches
   * Uses original values (penaltyChargesOriginalDue) when available, falling back to current values (penaltyChargesDue)
   * Note: For consistency with fees and taxes, only includes penalties from disbursement periods that have been disbursed
   */
  private getDisbursedTranchePenalties(): number {
    if (!this.loanDetails?.multiDisburseLoan || !this.loanDetails?.repaymentSchedule?.periods) {
      return this.loanDetails?.summary?.penaltyChargesCharged || 0;
    }

    let totalPenalties = 0;
    this.loanDetails.repaymentSchedule.periods.forEach((period: any) => {
      // For consistency with getDisbursedTrancheFees() and getDisbursedTrancheTaxes(),
      // only include penalties from disbursement periods that have been actually disbursed
      if (this.isDisbursementPeriodDisbursed(period)) {
        // Use original value when available, fall back to current value
        totalPenalties += period.penaltyChargesOriginalDue || period.penaltyChargesDue || 0;
      }
    });

    return totalPenalties;
  }

  /**
   * Calculates total original for multi-tranche loans
   * Returns: disbursed principal + interest + fees + taxes + penalties (all based on disbursed tranches only)
   */
  private getTotalOriginalForMultiTranche(): number {
    if (!this.loanDetails?.multiDisburseLoan || !this.loanDetails?.summary) {
      return this.loanDetails?.summary?.totalExpectedRepayment || 0;
    }

    const disbursedPrincipal = this.getTotalDisbursedPrincipal();
    const interest = this.getDisbursedTrancheInterest();
    // Use summary for fee/tax so Total Original matches row sum (no double-count when backend splits fee vs VAT)
    const fees = this.loanDetails.summary.feeChargesCharged || 0;
    const taxes = this.loanDetails.summary.taxChargesCharged || 0;
    const penalties = this.loanDetails.summary.penaltyChargesCharged || 0;

    return disbursedPrincipal + interest + fees + taxes + penalties;
  }

  /**
   * Calculates total outstanding for multi-tranche loans
   * Returns: sum of all outstanding amounts (principal + interest + fees + taxes + penalties)
   * For LOC loans, applies overpayment adjustment to the total outstanding
   */
  private getTotalOutstandingForMultiTranche(): number {
    if (!this.loanDetails?.multiDisburseLoan || !this.loanDetails?.summary) {
      return this.getAdjustedTotalOutstanding();
    }

    const principalOutstanding = this.getPrincipalOutstandingForMultiTranche();
    // Use unadjusted interest outstanding, we'll apply overpayment to total
    const interestOutstanding = this.loanDetails.summary.interestOutstanding || 0;
    const feesOutstanding = this.loanDetails.summary.feeChargesOutstanding || 0;
    const taxesOutstanding = this.loanDetails.summary.taxChargesOutstanding || 0;
    const penaltiesOutstanding = this.loanDetails.summary.penaltyChargesOutstanding || 0;

    let totalOutstanding =
      principalOutstanding + interestOutstanding + feesOutstanding + taxesOutstanding + penaltiesOutstanding;

    // Apply overpayment adjustment for LOC loans (similar to getAdjustedTotalOutstanding)
    const overPaid = this.loanDetails.totalOverpaid || this.loanDetails.overPaidAmount || 0;
    if (overPaid > 0 && this.isAnyLineOfCredit()) {
      totalOutstanding = totalOutstanding - overPaid;
    }

    return Math.max(0, totalOutstanding); // Ensure non-negative
  }

  /**
   * Calculates fees for multi-disbursal loans based only on disbursed tranches
   * Returns an object with feeChargesCharged, feeChargesPaid, feeChargesOutstanding, feeChargesWaived, feeChargesWrittenOff, feeChargesOverdue
   */
  private getDisbursedTrancheFees(): {
    feeChargesCharged: number;
    feeChargesPaid: number;
    feeChargesOutstanding: number;
    feeChargesWaived: number;
    feeChargesWrittenOff: number;
    feeChargesOverdue: number;
  } {
    const result = {
      feeChargesCharged: 0,
      feeChargesPaid: 0,
      feeChargesOutstanding: 0,
      feeChargesWaived: 0,
      feeChargesWrittenOff: 0,
      feeChargesOverdue: 0
    };

    // Only process if it's a multi-disbursal loan with repayment schedule
    if (!this.loanDetails?.multiDisburseLoan || !this.loanDetails?.repaymentSchedule?.periods) {
      return result;
    }

    const periods = this.loanDetails.repaymentSchedule.periods;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Iterate through periods and sum fees only for disbursed tranches
    periods.forEach((period: any) => {
      if (this.isDisbursementPeriodDisbursed(period)) {
        // Use original value when available, fall back to current value (for "Original" column consistency)
        result.feeChargesCharged += period.feeChargesOriginalDue || period.feeChargesDue || 0;
        result.feeChargesPaid += period.feeChargesPaid || 0;
        result.feeChargesOutstanding += period.feeChargesOutstanding || 0;
        result.feeChargesWaived += period.feeChargesWaived || 0;
        result.feeChargesWrittenOff += period.feeChargesWrittenOff || 0;

        // Calculate overdue: if period has outstanding fees and due date has passed
        if (period.feeChargesOutstanding && period.feeChargesOutstanding > 0 && period.dueDate) {
          const dueDate = new Date(period.dueDate[0], period.dueDate[1] - 1, period.dueDate[2]);
          dueDate.setHours(0, 0, 0, 0);
          if (dueDate < today) {
            result.feeChargesOverdue += period.feeChargesOutstanding || 0;
          }
        }
      }
    });

    return result;
  }
}
