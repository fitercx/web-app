import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { Dates } from 'app/core/utils/dates';
import { RepaymentSchedulePeriod } from 'app/loans/models/loan-account.model';
import { SettingsService } from 'app/settings/settings.service';
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { DatepickerBase } from 'app/shared/form-dialog/formfield/model/datepicker-base';
import { FormfieldBase } from 'app/shared/form-dialog/formfield/model/formfield-base';
import { InputBase } from 'app/shared/form-dialog/formfield/model/input-base';

import { jsPDF, jsPDFOptions } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'mifosx-repayment-schedule-tab',
  templateUrl: './repayment-schedule-tab.component.html',
  styleUrls: ['./repayment-schedule-tab.component.scss']
})
export class RepaymentScheduleTabComponent implements OnInit, OnChanges {
  /** Currency Code */
  @Input() currencyCode: string;
  /** Loan Repayment Schedule to be Edited */
  @Input() forEditing = false;
  /** Loan Repayment Schedule Details Data */
  @Input() repaymentScheduleDetails: any = null;
  /** Loan Data (used for creation flow) */
  @Input() loanData: any = null;
  loanDetailsDataRepaymentSchedule: any = [];

  editCache: { [key: string]: any } = {};
  listOfData: any[] = [];

  repaymentSchedulePeriods: RepaymentSchedulePeriod[] = [];

  totalRepaymentExpected: number = 0;

  /** Stores if there is any waived amount */
  isWaived: boolean;
  /** Loan details data from parent */
  loanDetailsData: any;
  /** Base columns for regular loans */
  baseDisplayedColumns: string[] = [
    'number',
    'days',
    'balanceOfLoan',
    'date',
    'emiAmount',
    'principalDue',
    'interest',
    'fees',
    'taxes',
    'penalties',
    'waived',
    'status',
    'check',
    'paiddate',
    'due',
    'paid',
    'inadvance',
    'late',
    'outstanding'
  ];
  /** Base columns for editable schedule table */
  baseDisplayedColumnsEdit: string[] = [
    'number',
    'date',
    'balanceOfLoan',
    'emiAmount',
    'principalDue',
    'interest',
    'fees',
    'due',
    'actions'
  ];
  /** Columns to be displayed in original schedule table. */
  displayedColumns: string[] = [];
  /** Columns to be displayed in editable schedule table. */
  displayedColumnsEdit: string[] = [];

  /** Form functions event */
  @Output() editPeriod = new EventEmitter();

  businessDate: Date = new Date();

  /**
   * Retrieves the loans with associations data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   */
  constructor(
    private route: ActivatedRoute,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private dialog: MatDialog
  ) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      if (data.loanDetailsData) {
        this.currencyCode = data.loanDetailsData.currency.code;
        this.loanDetailsData = data.loanDetailsData;
      }
      this.loanDetailsDataRepaymentSchedule = data.loanDetailsData ? data.loanDetailsData.repaymentSchedule : [];
    });
    this.businessDate = this.settingsService.businessDate;
  }

  ngOnInit() {
    if (this.repaymentScheduleDetails == null) {
      this.repaymentScheduleDetails = this.loanDetailsDataRepaymentSchedule;
    }
    this.isWaived = this.repaymentScheduleDetails.totalWaived > 0;
    this.updateDisplayedColumns();
    this.updateEditCache();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.totalRepaymentExpected = 0;
    this.listOfData.forEach((item) => {
      this.totalRepaymentExpected = this.totalRepaymentExpected + item.totalDueForPeriod;
    });

    // Update displayed columns if loanData changes
    if (changes['loanData']) {
      this.updateDisplayedColumns();
    }
  }

  installmentStyle(installment: RepaymentSchedulePeriod): string {
    if (installment.complete) {
      return 'paid';
    }
    const isCurrent: string = this.isCurrent(installment);
    if (isCurrent !== '') {
      return isCurrent;
    }
    if (installment.isAdditional) {
      return 'additional';
    } else if (installment.downPaymentPeriod) {
      return 'downpayment';
    }
    return '';
  }

  isCurrent(installment: RepaymentSchedulePeriod): string {
    if (!installment.fromDate) {
      return '';
    } else {
      const fromDate = this.dateUtils.parseDate(installment.fromDate);
      const dueDate = this.dateUtils.parseDate(installment.dueDate);
      if (fromDate <= this.businessDate && this.businessDate < dueDate) {
        return 'current';
      }
      if (this.businessDate > dueDate) {
        return 'overdued';
      }
    }
    return '';
  }

  exportToPDF() {
    const businessDate = this.dateUtils.formatDate(this.settingsService.businessDate, Dates.DEFAULT_DATEFORMAT);
    const fileName = `repaymentschedule-${businessDate}.pdf`;

    const options: jsPDFOptions = {
      orientation: 'l',
      unit: 'in',
      format: 'letter',
      precision: 2,
      compress: true,
      putOnlyUsedFonts: true
    };
    const pdf = new jsPDF(options);

    autoTable(pdf, {
      html: '#repaymentSchedule',
      bodyStyles: { lineColor: [
          0,
          0,
          0
        ] },
      styles: {
        fontSize: 8,
        cellWidth: 'auto',
        halign: 'center'
      }
    });
    pdf.save(fileName);
  }

  editInstallment(period: RepaymentSchedulePeriod): void {
    this.editCache[period.period].edit = true;
    const formfields: FormfieldBase[] = [
      new DatepickerBase({
        controlName: 'dueDate',
        label: 'Due Date',
        value: this.dateUtils.parseDate(period.dueDate),
        type: 'date',
        required: true
      }),
      new InputBase({
        controlName: 'principalDue',
        label: 'Amount',
        value: period.principalDue,
        type: 'number',
        required: true
      })

    ];

    const data = {
      title: 'Period',
      formfields: formfields
    };
    const addDialogRef = this.dialog.open(FormDialogComponent, { data, width: '50rem' });
    addDialogRef.afterClosed().subscribe((response: any) => {
      if (response.data) {
      }
    });
  }

  cancelEdit(id: string): void {
    const index = this.listOfData.findIndex((item) => item.id === id);
    this.editCache[id] = {
      data: { ...this.listOfData[index] },
      edit: false
    };
  }

  saveEdit(period: string): void {
    const index = this.listOfData.findIndex((item) => item.period === period);
    Object.assign(this.listOfData[index], this.editCache[period].data);
    this.editCache[period].edit = false;
    this.editPeriod.emit(period);
  }

  updateEditCache(): void {
    if (this.repaymentScheduleDetails != null) {
      this.listOfData = this.repaymentScheduleDetails.periods;
      this.totalRepaymentExpected = 0;
      this.listOfData.forEach((item) => {
        this.editCache[item.period] = {
          edit: false,
          data: { ...item }
        };
        this.totalRepaymentExpected = this.totalRepaymentExpected + item.totalDueForPeriod;
      });
    }
  }

  numberOnly(inputFormControl: any, event: any): boolean {
    const charCode = event.which ? event.which : event.keyCode;
    if (charCode === 46) {
      if (!(inputFormControl.value.indexOf('.') > -1)) {
        return true;
      }
      return false;
    } else if (charCode > 31 && (charCode < 48 || charCode > 57)) {
      return false;
    }
    return true;
  }

  /**
   * Checks if the loan is a line of credit of receivable type
   */
  private isLineOfCreditReceivable(): boolean {
    // Use loanData (for creation flow) or loanDetailsData (for view flow)
    const loanInfo = this.loanData || this.loanDetailsData;

    if (!loanInfo) {
      return false;
    }

    // Check if loan has a line of credit ID (indicating it's a LOC loan)
    const hasLineOfCredit = !!(loanInfo.lineOfCreditId || loanInfo.additionalProperties?.lineOfCreditId);

    if (!hasLineOfCredit) {
      return false;
    }

    // Check if it's of receivable type
    // For creation flow, check locType field
    // For view flow, check locProductType field
    const locType = loanInfo.locType || loanInfo.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE';
  }

  /**
   * Checks if the loan has factor rate enabled
   */
  private isLoanFactorRateEnabled(): boolean {
    const loanAccountData = this.loanData || this.loanDetailsData;
    if (!loanAccountData) {
      return false;
    }
    return loanAccountData.factorRateEnabled;
  }

  /**
   * Updates the displayed columns based on loan type
   */
  private updateDisplayedColumns(): void {
    if (this.isLineOfCreditReceivable()) {
      // For LOC Receivable: remove principal-related columns but keep emiAmount
      const columnsToRemove = [
        'principalDue',
        'due'
      ];

      // Start with base columns and remove unwanted ones
      this.displayedColumns = [...this.baseDisplayedColumns].filter((col) => !columnsToRemove.includes(col));
      this.displayedColumnsEdit = [...this.baseDisplayedColumnsEdit].filter((col) => !columnsToRemove.includes(col));

      // Add LOC-specific columns at the end of the schedule
      this.displayedColumns.push('disbursedAmount', 'refundAmount');
      this.displayedColumnsEdit.push('disbursedAmount', 'refundAmount');
    } else if (this.isLoanFactorRateEnabled()) {
      const columnsToRemove = ['interest'];
      this.displayedColumns = [...this.baseDisplayedColumns].filter((col) => !columnsToRemove.includes(col));
      this.displayedColumnsEdit = [...this.baseDisplayedColumnsEdit].filter((col) => !columnsToRemove.includes(col));
    } else {
      // For regular loans: use base columns as-is
      this.displayedColumns = [...this.baseDisplayedColumns];
      this.displayedColumnsEdit = [...this.baseDisplayedColumnsEdit];
    }
  }

  /**
   * Calculates the disbursed amount for LOC receivable loans
   * Returns 0 for pre-disbursement state (creation/pending/approved)
   * For disbursed loans on the loan view screen, uses the netDisbursalAmount field
   */
  getDisbursedAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      return 0;
    }

    // For pre-disbursement state, always show 0
    if (this.isLoanPreDisbursement()) {
      return 0;
    }

    // For disbursed loans, use netDisbursalAmount from loan details if available
    if (!item.principalDisbursed) {
      return 0;
    }

    // Use loanData (for creation flow) or loanDetailsData (for view flow)
    const loanInfo = this.loanData || this.loanDetailsData;

    // If netDisbursalAmount is available in loan details, use it
    if (loanInfo && loanInfo.netDisbursalAmount !== undefined && loanInfo.netDisbursalAmount !== null) {
      return loanInfo.netDisbursalAmount;
    }

    // Fallback: calculate disbursed amount if netDisbursalAmount is not available
    const principal = item.principalDisbursed || 0;
    const totalInterest = this.repaymentScheduleDetails?.totalInterestCharged || 0;
    const totalFees = this.repaymentScheduleDetails?.totalFeeChargesCharged || 0;
    return Math.max(0, principal - totalInterest - totalFees);
  }

  /**
   * Gets the outstanding amount to display for LOC receivable loans
   * For pre-disbursement state on disbursement period, shows the total of interest + fees
   * For pre-disbursement state on schedule rows, shows 0
   * For disbursed state, shows the actual outstanding amount
   */
  getOutstandingAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      return item.totalOutstandingForPeriod || 0;
    }

    // For pre-disbursement state
    if (this.isLoanPreDisbursement()) {
      // On the disbursement period, show total interest + fees as outstanding
      if (this.isDisbursementPeriod(item)) {
        const totalInterest = this.repaymentScheduleDetails?.totalInterestCharged || 0;
        const totalFees = this.repaymentScheduleDetails?.totalFeeChargesCharged || 0;
        return totalInterest + totalFees;
      }
      // For all schedule rows (non-disbursement periods), show 0
      return 0;
    }

    // For disbursed loans, show the actual outstanding amount
    return item.totalOutstandingForPeriod || 0;
  }

  /**
   * Calculates the refund amount for overpayments in LOC receivable loans
   */
  getRefundAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      return 0;
    }
    return item.principalOutstanding || 0;
  }

  /**
   * Determines if the schedule period is the disbursement period
   * A disbursement period is identified by having a principalDisbursed value
   */
  private isDisbursementPeriod(item: any): boolean {
    // Check if it's explicitly marked as a disbursement period
    if (item.principalDisbursed && item.principalDisbursed > 0) {
      return true;
    }

    // For pre-disbursement/creation flow, the disbursement period is typically:
    // - Period 0, OR
    // - The first period in the array without a principalDue (it's the disbursement line)
    if (item.period === 0) {
      return true;
    }

    // Additional check: if period is 1 and there's no principalDue, it might be the disbursement
    if (item.period === 1 && (!item.principalDue || item.principalDue === 0)) {
      return true;
    }

    return false;
  }

  /**
   * Checks if the loan is in a pre-disbursement state (pending approval or approved but not disbursed)
   * Also returns true for loan creation flow (when no status exists yet)
   */
  private isLoanPreDisbursement(): boolean {
    const loanInfo = this.loanData || this.loanDetailsData;

    // In creation flow, loanData exists but has no status - treat as pre-disbursement
    if (this.loanData && !this.loanData.status) {
      return true;
    }

    if (!loanInfo || !loanInfo.status) {
      return false;
    }

    // Check if loan is in pending approval or approved (waiting for disbursal) status
    return loanInfo.status.pendingApproval || loanInfo.status.waitingForDisbursal;
  }

  /**
   * Gets the display status for a schedule period
   * For LOC Receivable loans in pending/approved status:
   * - Disbursement period shows "PENDING DISBURSEMENT"
   * - Other periods show "SCHEDULED"
   * For all other cases, returns the original item status
   */
  getDisplayStatus(item: any): string {
    // Only apply custom status logic for LOC Receivable loans in pre-disbursement state
    if (this.isLineOfCreditReceivable() && this.isLoanPreDisbursement()) {
      // Check if this is the disbursement period
      if (this.isDisbursementPeriod(item)) {
        return 'PENDING DISBURSAL';
      } else {
        return 'SCHEDULED';
      }
    }

    // For all other cases, return the original status
    return item.status;
  }

  /**
   * Gets the interest amount to display for a schedule period
   * For LOC Receivable loans:
   * - Shows the TOTAL interest from the schedule on the disbursement period
   * - Returns 0 for all other periods (installment schedules)
   * For regular loans: shows the actual interest per period
   */
  getInterestAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      return item.interestOriginalDue || 0;
    }

    // For LOC Receivable, show total interest on the disbursement period
    if (this.isDisbursementPeriod(item)) {
      // Return the total interest charged for the entire loan
      return this.repaymentScheduleDetails?.totalInterestCharged || 0;
    }

    // For all other periods (installment schedules), return 0
    return 0;
  }

  /**
   * Gets the fees amount to display for a schedule period
   * For LOC Receivable loans:
   * - Shows the TOTAL fees from the schedule on the disbursement period
   * - Returns 0 for all other periods (installment schedules)
   * For regular loans: shows the actual fees per period
   */
  getFeesAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      return item.feeChargesDue || 0;
    }

    // For LOC Receivable, show total fees on the disbursement period
    if (this.isDisbursementPeriod(item)) {
      // Return the total fee charges for the entire loan
      return this.repaymentScheduleDetails?.totalFeeChargesCharged || 0;
    }

    // For all other periods (installment schedules), return 0
    return 0;
  }

  getEmiAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      // Regular loans: principal + interest
      return (item.principalDue || 0) + (item.interestOriginalDue || 0);
    }

    // For LOC Receivable: EMI is not shown on disbursement period
    if (this.isDisbursementPeriod(item)) {
      return 0;
    }

    // For installment periods: show only principal (interest and fees are 0)
    return item.principalDue || 0;
  }
}
