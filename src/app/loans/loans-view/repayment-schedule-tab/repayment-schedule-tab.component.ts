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
      if (!(inputFormControl.value.indexOf('.') > 1)) {
        return true;
      }
      return false;
    } else if (charCode > 31 && (charCode < 48 || charCode > 57)) {
      return false;
    }
    return true;
  }

  isLineOfCreditReceivable(): boolean {
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

  /** LOC payable type */
  isLineOfCreditPayable(): boolean {
    const loanInfo = this.loanData || this.loanDetailsData;
    if (!loanInfo) {
      return false;
    }
    const hasLineOfCredit = !!(loanInfo.lineOfCreditId || loanInfo.additionalProperties?.lineOfCreditId);
    if (!hasLineOfCredit) {
      return false;
    }
    const locType = loanInfo.locType || loanInfo.additionalProperties?.locProductType;
    return locType === 'PAYABLE';
  }

  /** Any LOC (receivable or payable) */
  private isAnyLineOfCredit(): boolean {
    return this.isLineOfCreditReceivable() || this.isLineOfCreditPayable();
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

  getDisbursedAmount(item: any): number {
    // Use loanData (for creation flow) or loanDetailsData (for view flow)
    const loanInfo = this.loanData || this.loanDetailsData;

    // If netDisbursalAmount is available in loan details, use it
    if (loanInfo && loanInfo.netDisbursalAmount !== undefined && loanInfo.netDisbursalAmount !== null) {
      return loanInfo.netDisbursalAmount;
    }

    return 0;
  }

  getRefundAmount(item: any): number {
    // Use loanData (for creation flow) or loanDetailsData (for view flow)
    if (item.status === 'DISBURSEMENT') {
      return;
    }

    const loanInfo = this.loanData || this.loanDetailsData;
    if (loanInfo && loanInfo.totalOverpaid !== undefined && loanInfo.totalOverpaid !== null) {
      return loanInfo.totalOverpaid;
    }
    return 0;
  }

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

  getDisplayStatus(item: any): string {
    // Only apply custom status logic for LOC Receivable loans in pre-disbursement state
    if (this.isLineOfCreditReceivable() && this.isLoanPreDisbursement()) {
      // Check if this is the disbursement period
      if (this.isDisbursementPeriod(item)) {
        return 'PENDING DISBURSEMENT';
      } else {
        return 'SCHEDULED';
      }
    }

    // For all other cases, return the original status
    return item.status;
  }

  /** Determines if outstanding amount should be shown for a period */
  shouldShowOutstanding(item: RepaymentSchedulePeriod): boolean {
    if (!item) {
      return false;
    }
    // If installment marked complete treat as paid -> hide
    if (item.complete) {
      return false;
    }
    // If backend already reports zero outstanding, hide
    if (item.totalOutstandingForPeriod === 0) {
      return false;
    }
    return true;
  }

  /** Whether loan is overpaid (status or overPaidAmount > 0) */
  isLoanOverpaid(): boolean {
    const loanInfo = this.loanData || this.loanDetailsData;
    if (!loanInfo) {
      return false;
    }
    // Only treat overpaid for LOC types
    if (this.isAnyLineOfCredit() && loanInfo.overPaidAmount && loanInfo.overPaidAmount > 0) {
      return true;
    }
    return false;
  }

  /**
   * Returns total outstanding amount to display in footer of Principal O/S / PreDisbursal Amount column.
   * Logic:
   *  - Safely handle missing schedule details.
   *  - For overpaid loans (LOC types) if outstanding becomes negative, display 0.
   *  - For LOC Receivable loans in pre‑disbursement state, try to show netDisbursalAmount if available.
   *  - Fallback to schedule.totalOutstanding.
   */
  getDisplayedTotalOutstanding(): number {
    const schedule = this.repaymentScheduleDetails;
    if (!schedule) {
      return 0;
    }
    const outstanding = typeof schedule.totalOutstanding === 'number' ? schedule.totalOutstanding : 0;

    // Overpaid loans: hide if negative
    if (this.isLoanOverpaid() && outstanding <= 0) {
      return null;
    }

    // LOC Receivable pre-disbursement: show netDisbursalAmount if available and > 0, else hide
    if (this.isLineOfCreditReceivable() && this.isLoanPreDisbursement()) {
      const loanInfo = this.loanData || this.loanDetailsData;
      if (loanInfo && typeof loanInfo.netDisbursalAmount === 'number' && loanInfo.netDisbursalAmount > 0) {
        return loanInfo.netDisbursalAmount;
      }
      return null;
    }

    // Regular case: show positive outstanding only
    return outstanding > 0 ? outstanding : null;
  }
}
