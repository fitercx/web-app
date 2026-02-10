import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Dates } from 'app/core/utils/dates';
import { RepaymentSchedulePeriod } from 'app/loans/models/loan-account.model';
import { SettingsService } from 'app/settings/settings.service';
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { DatepickerBase } from 'app/shared/form-dialog/formfield/model/datepicker-base';
import { FormfieldBase } from 'app/shared/form-dialog/formfield/model/formfield-base';
import { InputBase } from 'app/shared/form-dialog/formfield/model/input-base';
import { AdjustInstallmentDateDialogComponent } from '../custom-dialogs/adjust-installment-date-dialog/adjust-installment-date-dialog.component';
import { LoansService } from 'app/loans/loans.service';

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

  /** Tolerance threshold for floating-point comparison when matching principal amounts */
  private static readonly PRINCIPAL_COMPARISON_TOLERANCE = 0.01;

  /** Code for loan disbursement transaction type */
  private static readonly LOAN_TRANSACTION_TYPE_DISBURSEMENT = 'loanTransactionType.disbursement';

  /**
   * Retrieves the loans with associations data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   */
  constructor(
    private route: ActivatedRoute,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private dialog: MatDialog,
    private loansService: LoansService,
    private router: Router
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

    // Check if dialog should be opened from query parameter
    this.route.queryParams.subscribe((params) => {
      if (params['openAdjustDialog'] === 'true') {
        setTimeout(() => {
          this.openAdjustInstallmentDateDialog();
          // Remove query parameter after opening dialog
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {},
            replaceUrl: true
          });
        }, 100);
      }
    });
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
  isLoanFactorRateEnabled(): boolean {
    const loanAccountData = this.loanData || this.loanDetailsData;
    if (!loanAccountData) {
      return false;
    }
    return loanAccountData.factorRateEnabled;
  }

  getEmiLabel(): string {
    let repaymentFrequencyTypeId;
    if (this.loanData) {
      repaymentFrequencyTypeId = this.loanData.repaymentFrequencyType ?? 5;
    } else if (this.loanDetailsData) {
      repaymentFrequencyTypeId = this.loanDetailsData?.repaymentFrequencyType?.id ?? 5;
    }
    switch (repaymentFrequencyTypeId) {
      case 0:
        return this.isAnyLineOfCredit() ? 'labels.inputs.EMI Amount' : 'labels.inputs.EDI Amount';
      case 1:
        return 'labels.inputs.EWI Amount';
      case 2:
        return 'labels.inputs.EMI Amount';
      case 3:
        return 'labels.inputs.EAI Amount';
      default:
        return 'labels.inputs.EMI Amount';
    }
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
  private isDisbursementPeriod(item: RepaymentSchedulePeriod): boolean {
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
   * Compares two date arrays in the format [year, month, day]
   * @param date1 First date array
   * @param date2 Second date array
   * @returns true if both dates are valid arrays of length 3 and have the same year, month, and day
   */
  private areDateArraysEqual(date1: number[] | undefined | null, date2: number[] | undefined | null): boolean {
    return (
      !!date1 &&
      !!date2 &&
      date1.length === 3 &&
      date2.length === 3 &&
      date1[0] === date2[0] &&
      date1[1] === date2[1] &&
      date1[2] === date2[2]
    );
  }

  /**
   * Checks if a disbursement period has actually been disbursed
   * by matching with disbursementDetails that have an actualDisbursementDate
   * Falls back to checking transactions or fee charges paid if disbursementDetails not available
   */
  private isDisbursementActualDisbursed(item: RepaymentSchedulePeriod): boolean {
    if (!item.status || item.status !== 'DISBURSEMENT') {
      return false;
    }

    const loanInfo = this.loanData || this.loanDetailsData;
    if (!loanInfo) {
      return false;
    }

    // Primary check: Use disbursementDetails if available
    if (loanInfo.disbursementDetails && Array.isArray(loanInfo.disbursementDetails)) {
      const periodDueDate = item.dueDate;
      const periodPrincipal = item.principalDisbursed || 0;

      // Find matching disbursementDetail
      const matchingDisbursement = loanInfo.disbursementDetails.find((disb: any) => {
        const disbExpectedDate = disb.expectedDisbursementDate;
        const disbPrincipal = disb.principal || 0;

        // Compare dates (format: [year, month, day])
        const datesMatch = this.areDateArraysEqual(disbExpectedDate, periodDueDate);

        // Compare principal amounts (with small tolerance for floating point)
        const principalMatch =
          Math.abs(disbPrincipal - periodPrincipal) < RepaymentScheduleTabComponent.PRINCIPAL_COMPARISON_TOLERANCE;

        return datesMatch && principalMatch;
      });

      // If found and has actualDisbursementDate, it's been disbursed
      if (matchingDisbursement) {
        return !!matchingDisbursement.actualDisbursementDate;
      }
    }

    // Fallback: Check if fees were paid (indicates disbursement occurred)
    // If feeChargesPaid > 0, it's likely been disbursed
    if (item.feeChargesPaid && item.feeChargesPaid > 0) {
      return true;
    }

    // Fallback: Check transactions for disbursement on this date
    if (loanInfo.transactions && Array.isArray(loanInfo.transactions)) {
      const periodDueDate = item.dueDate;
      const periodPrincipal = item.principalDisbursed || 0;

      const matchingTransaction = loanInfo.transactions.find((trans: any) => {
        const transDate = trans.date;
        const transAmount = trans.amount || 0;

        // Compare dates
        const datesMatch = this.areDateArraysEqual(transDate, periodDueDate);

        // Check if it's a disbursement transaction
        const isDisbursement =
          trans.type &&
          (trans.type.disbursement === true ||
            trans.type.code === RepaymentScheduleTabComponent.LOAN_TRANSACTION_TYPE_DISBURSEMENT);

        // Compare amounts (with tolerance)
        const amountMatch =
          Math.abs(transAmount - periodPrincipal) < RepaymentScheduleTabComponent.PRINCIPAL_COMPARISON_TOLERANCE;

        return datesMatch && isDisbursement && amountMatch;
      });

      return !!matchingTransaction;
    }

    // Default: assume not disbursed if we can't determine
    return false;
  }

  getDisplayStatus(item: RepaymentSchedulePeriod): string {
    // Only apply custom status logic for LOC Receivable loans in pre-disbursement state
    if (this.isLineOfCreditReceivable() && this.isLoanPreDisbursement()) {
      // Check if this is the disbursement period
      if (this.isDisbursementPeriod(item)) {
        return 'PENDING DISBURSEMENT';
      } else {
        return 'SCHEDULED';
      }
    }

    // For DISBURSEMENT status, check if it has actually been disbursed
    if (item.status === 'DISBURSEMENT') {
      if (!this.isDisbursementActualDisbursed(item)) {
        return 'AWAITING DISBURSEMENT';
      }
      return item.status;
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

  /**
   * Allocates summary tax amount across actually disbursed periods.
   * Backend does not provide tax per schedule period for disbursement rows (taxCharges* are 0),
   * but it does provide a split at summary level (feeChargesCharged + taxChargesCharged)
   * and the combined amount in schedule feeChargesDue for each disbursement period.
   *
   * Strategy:
   * - Consider only DISBURSEMENT periods that have actually been disbursed.
   * - Let totalCombined = sum(feeChargesDue) for those periods.
   * - Let totalTax = summary.taxChargesCharged.
   * - Allocate tax proportionally: periodTax = feeChargesDue * (totalTax / totalCombined).
   *
   * This keeps:
   * - Sum of allocated tax equal to summary tax.
   * - Per‑row fee + tax equal to original schedule feeChargesDue.
   * - No tax shown for future (not‑yet‑disbursed) tranches.
   */
  private getAllocatedTaxForDisbursementPeriod(item: any): number {
    const summary = this.loanDetailsData?.summary;
    const schedule = this.repaymentScheduleDetails;

    if (!summary || !schedule || item.status !== 'DISBURSEMENT') {
      return 0;
    }

    const totalTax: number = summary.taxChargesCharged ?? 0;
    if (!totalTax || totalTax <= 0) {
      return 0;
    }

    const periods: any[] = Array.isArray(schedule.periods) ? schedule.periods : [];

    // Only include periods that are both DISBURSEMENT and actually disbursed
    const disbursedDisbursementPeriods = periods.filter(
      (p) => p.status === 'DISBURSEMENT' && this.isDisbursementActualDisbursed(p)
    );

    if (!disbursedDisbursementPeriods.length) {
      return 0;
    }

    const totalCombinedFees = disbursedDisbursementPeriods.reduce((sum, p) => {
      const fee = p.feeChargesDue ?? 0;
      return sum + (typeof fee === 'number' ? fee : 0);
    }, 0);

    if (!totalCombinedFees || totalCombinedFees <= 0) {
      return 0;
    }

    // Only allocate tax to periods that have actually been disbursed
    if (!this.isDisbursementActualDisbursed(item)) {
      return 0;
    }

    const itemFee = item.feeChargesDue ?? 0;
    if (!itemFee || itemFee <= 0) {
      return 0;
    }

    return (itemFee * totalTax) / totalCombinedFees;
  }

  /**
   * When backend summary has fee/tax split (e.g. fee 800 + tax 44) but schedule has combined fee (844) and tax 0,
   * returns the fee to display for this period so schedule matches General tab while keeping:
   *   feeDisplayed + taxDisplayed = original schedule feeChargesDue (for disbursed tranches)
   */
  getDisplayFeeForPeriod(item: any): number {
    const summary = this.loanDetailsData?.summary;
    if (!summary || item.status !== 'DISBURSEMENT' || !(item.feeChargesDue > 0)) {
      return item.feeChargesDue ?? 0;
    }

    // If backend already sends per‑period tax, trust it and derive fee as feeDue - taxDue.
    const scheduleTax = item.taxChargesDue ?? 0;
    if (scheduleTax > 0) {
      return (item.feeChargesDue ?? 0) - scheduleTax;
    }

    // Otherwise, allocate tax for actually disbursed periods and subtract from combined fee
    const allocatedTax = this.getAllocatedTaxForDisbursementPeriod(item);
    if (allocatedTax > 0) {
      return (item.feeChargesDue ?? 0) - allocatedTax;
    }

    return item.feeChargesDue ?? 0;
  }

  /**
   * When backend summary has fee/tax split but schedule has tax 0, returns the tax to display for this period.
   */
  getDisplayTaxForPeriod(item: any): number {
    const summary = this.loanDetailsData?.summary;
    // If no summary or not a disbursement row, just show schedule tax as‑is.
    if (!summary || item.status !== 'DISBURSEMENT') {
      return item.taxChargesDue ?? 0;
    }

    // If backend already provides a non‑zero tax per period, trust it.
    if (item.taxChargesDue && item.taxChargesDue > 0) {
      return item.taxChargesDue;
    }

    // Otherwise, derive allocated tax for actually disbursed tranches.
    const allocatedTax = this.getAllocatedTaxForDisbursementPeriod(item);
    if (allocatedTax > 0) {
      return allocatedTax;
    }

    return item.taxChargesDue ?? 0;
  }

  /**
   * Total fees to display in schedule footer. Uses summary when backend splits fee/tax and schedule does not.
   */
  getDisplayTotalFees(): number {
    const schedule = this.repaymentScheduleDetails;
    const summary = this.loanDetailsData?.summary;
    if (!schedule) {
      return 0;
    }
    if (summary?.taxChargesCharged > 0 && (schedule.totalTaxChargesCharged ?? 0) === 0) {
      return summary.feeChargesCharged ?? schedule.totalFeeChargesCharged ?? 0;
    }
    return schedule.totalFeeChargesCharged ?? 0;
  }

  /**
   * Total taxes to display in schedule footer. Uses summary when backend has tax and schedule shows 0.
   */
  getDisplayTotalTaxes(): number {
    const schedule = this.repaymentScheduleDetails;
    const summary = this.loanDetailsData?.summary;
    if (!schedule) {
      return 0;
    }
    if (summary?.taxChargesCharged != null && summary.taxChargesCharged > 0) {
      return summary.taxChargesCharged;
    }
    return schedule.totalTaxChargesCharged ?? 0;
  }

  /**
   * Opens dialog to adjust installment date
   * @param {any} installment Installment
   */
  adjustInstallmentDate(installment: any) {
    if (!installment.period || installment.period === 0) {
      return; // Don't allow adjusting disbursement row
    }
    const installmentData = {
      ...installment,
      hasOverdueCharges: this.isInstallmentBlockedByOverdueCharges(installment)
    };

    const dialogRef = this.dialog.open(AdjustInstallmentDateDialogComponent, {
      width: '500px',
      data: {
        installmentNumber: installmentData.period,
        currentDueDate: installmentData.dueDate,
        emiAmount: installmentData.totalDueForPeriod,
        currencyCode: this.currencyCode,
        disbursementDate: this.loanDetailsData?.timeline?.actualDisbursementDate,
        adjustableInstallments: [installmentData]
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;
        const payload = {
          installmentNumber: installment.period,
          newDueDate: this.dateUtils.formatDate(result.newDueDate, dateFormat),
          adjustmentDate: this.dateUtils.formatDate(this.settingsService.businessDate, dateFormat),
          dateFormat,
          locale
        };

        this.loansService.adjustInstallmentDate(this.loanDetailsData.id, payload).subscribe({
          next: () => {
            this.reload();
          },
          error: (error) => {
            console.error('Error adjusting installment date:', error);
          }
        });
      }
    });
  }

  /**
   * Checks if installment can be adjusted
   * @param {any} installment Installment
   * @returns {boolean}
   */
  canAdjustInstallment(installment: any): boolean {
    if (!installment.period || installment.period === 0) {
      return false; // Disbursement row
    }
    if (installment.complete || installment.obligationsMetOnDate) {
      return false; // Already paid
    }
    if (this.loanDetailsData?.status?.value !== 'Active') {
      return false; // Loan not active
    }
    return true;
  }

  /**
   * Checks if any installment can be adjusted
   * @returns {boolean}
   */
  canAdjustAnyInstallment(): boolean {
    if (!this.repaymentScheduleDetails || !this.repaymentScheduleDetails.periods) {
      return false;
    }
    if (this.loanDetailsData?.status?.value !== 'Active') {
      return false;
    }
    return this.getAdjustableInstallments().some((period: any) => !period.hasOverdueCharges);
  }

  /**
   * Gets list of installments that can be adjusted
   * @returns {any[]}
   */
  getAdjustableInstallments(): any[] {
    if (!this.repaymentScheduleDetails || !this.repaymentScheduleDetails.periods) {
      return [];
    }
    return this.repaymentScheduleDetails.periods
      .filter((period: any) => this.canAdjustInstallment(period))
      .map((period: any) => ({
        ...period,
        hasOverdueCharges: this.isInstallmentBlockedByOverdueCharges(period)
      }));
  }

  hasOverdueInstallmentsForAdjustment(): boolean {
    return this.getAdjustableInstallments().some((period: any) => period.hasOverdueCharges);
  }

  private isInstallmentBlockedByOverdueCharges(installment: any): boolean {
    // Block adjustment if Overdue Interest > 0.0
    const overdueInterest = Number(installment.totalOverdue ?? 0);
    return overdueInterest > 0.0;
  }

  /**
   * Opens the adjust installment date dialog
   */
  openAdjustInstallmentDateDialog() {
    const adjustableInstallments = this.getAdjustableInstallments();

    const dialogRef = this.dialog.open(AdjustInstallmentDateDialogComponent, {
      width: '500px',
      data: {
        adjustableInstallments: adjustableInstallments,
        currencyCode: this.currencyCode,
        disbursementDate: this.loanDetailsData?.timeline?.actualDisbursementDate
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;
        const payload = {
          installmentNumber: result.installmentNumber,
          newDueDate: this.dateUtils.formatDate(result.newDueDate, dateFormat),
          adjustmentDate: this.dateUtils.formatDate(this.settingsService.businessDate, dateFormat),
          dateFormat,
          locale
        };

        this.loansService.adjustInstallmentDate(this.loanDetailsData.id, payload).subscribe({
          next: () => {
            this.reload();
          },
          error: (error) => {
            console.error('Error adjusting installment date:', error);
          }
        });
      }
    });
  }

  /**
   * Reloads the page to refresh data
   */
  private reload() {
    if (!this.loanDetailsData || !this.loanDetailsData.clientId) {
      // Fallback: reload current route if clientId is not available
      window.location.reload();
      return;
    }
    const clientId = this.loanDetailsData.clientId;
    const url: string = this.router.url;
    this.router
      .navigateByUrl(`/clients/${clientId}/loans-accounts`, { skipLocationChange: true })
      .then(() => this.router.navigate([url]));
  }
}
