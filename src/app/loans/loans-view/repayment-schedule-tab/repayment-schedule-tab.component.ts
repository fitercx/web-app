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
import { AccrualReportPeriod, LoansService } from 'app/loans/loans.service';

import { jsPDF, jsPDFOptions } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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
  isExportingRepaymentScheduleExcel = false;

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

  exportToExcel(): void {
    if (!this.repaymentScheduleDetails?.periods?.length || this.isExportingRepaymentScheduleExcel) {
      return;
    }

    this.isExportingRepaymentScheduleExcel = true;
    setTimeout(() => {
      try {
        const worksheet = this.buildRepaymentScheduleWorksheet();
        const workbook: XLSX.WorkBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Repayment Schedule');

        const loanId = this.getLoanIdentifier();
        const generationDate = this.formatDateForFileName(this.settingsService.businessDate);
        XLSX.writeFile(workbook, `RepaymentSchedule_${loanId}_${generationDate}.xlsx`, { cellDates: true });
      } finally {
        this.isExportingRepaymentScheduleExcel = false;
      }
    });
  }

  private buildRepaymentScheduleWorksheet(): XLSX.WorkSheet {
    const loanInfo = this.loanData || this.loanDetailsData || {};
    const tableColumns = this.getRepaymentScheduleExportColumns();
    const metadataRows = this.getRepaymentScheduleMetadataRows(loanInfo);
    const tableStartRow = metadataRows.length + 2;
    const tableHeaderRow = tableStartRow + 1;
    const scheduleRows = this.repaymentScheduleDetails.periods.map((period: any) =>
      tableColumns.map((column) => column.value(period))
    );
    const totalsRow = tableColumns.map((column) => (column.total ? column.total() : ''));

    const rows = [
      ['Repayment Schedule'],
      ...metadataRows,
      [],
      tableColumns.map((column) => column.header),
      ...scheduleRows,
      totalsRow
    ];

    const worksheet: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
    worksheet['!cols'] = this.getRepaymentScheduleColumnWidths(rows);

    this.applyRepaymentScheduleExcelFormatting(worksheet, metadataRows, tableHeaderRow, rows.length, tableColumns);
    return worksheet;
  }

  private getRepaymentScheduleMetadataRows(loanInfo: any): any[][] {
    const metadataRows: any[][] = [
      [
        'Loan ID',
        this.getLoanIdentifier()
      ],
      [
        'Account No',
        loanInfo.accountNo ?? ''
      ],
      [
        'Customer',
        loanInfo.clientName || loanInfo.group?.name || ''
      ],
      [
        'Product',
        loanInfo.loanProductName ?? ''
      ],
      [
        'Status',
        loanInfo.status?.value ?? ''
      ],
      [
        'Currency',
        this.currencyCode ?? loanInfo.currency?.code ?? this.repaymentScheduleDetails?.currency?.code ?? ''
      ],
      [
        'Generated On',
        this.toExcelDate(this.settingsService.businessDate)]

    ];

    if (loanInfo.timeline?.actualDisbursementDate) {
      metadataRows.push([
        'Disbursement Date',
        this.toExcelDate(loanInfo.timeline.actualDisbursementDate)]);
    }
    if (loanInfo.timeline?.expectedMaturityDate) {
      metadataRows.push([
        'Maturity Date',
        this.toExcelDate(loanInfo.timeline.expectedMaturityDate)]);
    }
    if (loanInfo.annualInterestRate != null) {
      metadataRows.push([
        'Interest Rate',
        this.toPercentage(loanInfo.annualInterestRate)]);
    } else if (loanInfo.interestRatePerPeriod != null) {
      metadataRows.push([
        'Interest Rate',
        this.toPercentage(loanInfo.interestRatePerPeriod)]);
    }

    return metadataRows;
  }

  private getRepaymentScheduleExportColumns(): any[] {
    return this.displayedColumns
      .filter((column) => column !== 'check')
      .map((column) => this.getRepaymentScheduleExportColumn(column))
      .filter((column) => !!column);
  }

  private getRepaymentScheduleExportColumn(column: string): any {
    const moneyFormat = '#,##0.000';
    const numberFormat = '0';
    const dateFormat = 'dd mmm yyyy';
    const emiTotal = () =>
      this.isLineOfCreditReceivable()
        ? this.toNumber(this.repaymentScheduleDetails.totalPrincipalExpected) +
          this.toNumber(this.repaymentScheduleDetails.totalInterestCharged) +
          this.getDisplayTotalFees() +
          this.getDisplayTotalTaxes()
        : this.toNumber(this.repaymentScheduleDetails.totalPrincipalExpected) +
          this.toNumber(this.repaymentScheduleDetails.totalInterestCharged);

    const columns: any = {
      number: { header: '#', value: (item: any) => item.period ?? '', format: numberFormat },
      days: {
        header: this.getPlainIntervalLabel(),
        value: (item: any) => this.getIntervalValue(item),
        total: () => 'Total',
        format: numberFormat
      },
      balanceOfLoan: {
        header: this.isLineOfCreditReceivable() ? 'PreDisbursal Amount' : 'Principal O/S',
        value: (item: any) => this.toNumber(item.principalLoanBalanceOutstanding),
        total: () => this.getDisplayedTotalOutstanding(),
        format: moneyFormat
      },
      date: { header: 'Due Date', value: (item: any) => this.toExcelDate(item.dueDate), format: dateFormat },
      emiAmount: {
        header: this.getPlainEmiLabel(),
        value: (item: any) =>
          this.isLineOfCreditReceivable() || this.isLoanFactorRateEnabled()
            ? this.toNumber(item.principalDue) +
              this.toNumber(item.interestOriginalDue) +
              this.getDisplayFeeForPeriod(item) +
              this.getDisplayTaxForPeriod(item)
            : this.toNumber(item.principalDue) + this.toNumber(item.interestOriginalDue),
        total: emiTotal,
        format: moneyFormat
      },
      principalDue: {
        header: 'Principal Due',
        value: (item: any) => this.toNumber(item.principalDue),
        total: () => this.toNumber(this.repaymentScheduleDetails.totalPrincipalExpected),
        format: moneyFormat
      },
      interest: {
        header: this.isLineOfCreditReceivable() ? 'Expected Interest' : 'Interest',
        value: (item: any) => this.toNumber(item.interestOriginalDue),
        total: () => this.toNumber(this.repaymentScheduleDetails.totalInterestCharged),
        format: moneyFormat
      },
      fees: {
        header: 'Fees',
        value: (item: any) =>
          item.feeChargesReversed && item.feeChargesReversed > 0
            ? this.toNumber(item.feeChargesReversed)
            : this.getDisplayFeeForPeriod(item),
        total: () => this.getDisplayTotalFees(),
        format: moneyFormat
      },
      taxes: {
        header: 'Taxes',
        value: (item: any) => this.getDisplayTaxForPeriod(item),
        total: () => this.getDisplayTotalTaxes(),
        format: moneyFormat
      },
      penalties: {
        header: 'Overdue Interest',
        value: (item: any) =>
          item.reversedPenaltyChargesDue && item.reversedPenaltyChargesDue > 0
            ? this.toNumber(item.reversedPenaltyChargesDue)
            : this.toNumber(item.penaltyChargesDue),
        total: () => this.toNumber(this.repaymentScheduleDetails.totalPenaltyChargesCharged),
        format: moneyFormat
      },
      waived: {
        header: 'Waived Amount',
        value: (item: any) => (this.isWaived ? this.toNumber(item.totalWaivedForPeriod) : ''),
        total: () => (this.isWaived ? this.toNumber(this.repaymentScheduleDetails.totalWaived) : ''),
        format: moneyFormat
      },
      status: {
        header: 'Status',
        value: (item: any) =>
          item.interestOriginalDue === 0 && item.principalDue === 0
            ? 'GRACE_PERIOD_APPLIED'
            : this.getDisplayStatus(item)
      },
      paiddate: {
        header: 'Paid Date',
        value: (item: any) =>
          item.interestOriginalDue === 0 && item.principalDue === 0 ? '' : this.toExcelDate(item.obligationsMetOnDate),
        format: dateFormat
      },
      due: {
        header: 'Due Payment',
        value: (item: any) => this.toNumber(item.totalDueForPeriod),
        total: () => this.toNumber(this.repaymentScheduleDetails.totalRepaymentExpected),
        format: moneyFormat
      },
      paid: {
        header: 'Amount Paid',
        value: (item: any) => this.toNumber(item.totalPaidForPeriod),
        total: () => this.toNumber(this.repaymentScheduleDetails.totalRepayment),
        format: moneyFormat
      },
      inadvance: {
        header: 'Advance Paid',
        value: (item: any) => this.toNumber(item.totalPaidInAdvanceForPeriod),
        total: () => this.toNumber(this.repaymentScheduleDetails.totalPaidInAdvance),
        format: moneyFormat
      },
      late: {
        header: 'Late Paid',
        value: (item: any) => this.toNumber(item.totalPaidLateForPeriod),
        total: () => this.toNumber(this.repaymentScheduleDetails.totalPaidLate),
        format: moneyFormat
      },
      outstanding: {
        header: 'Outstanding Amount',
        value: (item: any) =>
          !this.isLoanOverpaid() && this.shouldShowOutstanding(item)
            ? this.toNumber(item.totalOutstandingForPeriod)
            : '',
        format: moneyFormat
      },
      disbursedAmount: {
        header: 'Disbursed Amount',
        value: (item: any) => this.getDisbursedAmount(item),
        format: moneyFormat
      },
      refundAmount: {
        header: 'Refund Amount',
        value: (item: any) => {
          const refundAmount = this.getRefundAmount(item);
          return refundAmount > 0 ? refundAmount : '';
        },
        format: moneyFormat
      }
    };

    return columns[column];
  }

  private applyRepaymentScheduleExcelFormatting(
    worksheet: XLSX.WorkSheet,
    metadataRows: any[][],
    tableHeaderRow: number,
    totalRows: number,
    tableColumns: any[]
  ): void {
    const headerRowIndex = tableHeaderRow - 1;
    const totalRowIndex = totalRows - 1;
    const tableDataStartIndex = tableHeaderRow;
    const moneyFormat = '#,##0.000';
    const dateFormat = 'dd mmm yyyy';

    this.setRowStyle(worksheet, 0, tableColumns.length, { bold: true, fill: 'D9EAF7' });
    metadataRows.forEach((row, index) => {
      this.setCellStyle(worksheet, index + 1, 0, { bold: true });
      if (row[0] === 'Generated On' || row[0] === 'Disbursement Date' || row[0] === 'Maturity Date') {
        this.setCellFormat(worksheet, index + 1, 1, dateFormat);
      }
      if (row[0] === 'Interest Rate') {
        this.setCellFormat(worksheet, index + 1, 1, '0.00%');
      }
    });
    this.setRowStyle(worksheet, headerRowIndex, tableColumns.length, { bold: true, fill: 'EDEDED' });
    this.setRowStyle(worksheet, totalRowIndex, tableColumns.length, { bold: true, fill: 'F5F5F5' });

    tableColumns.forEach((column, columnIndex) => {
      for (let rowIndex = tableDataStartIndex; rowIndex < totalRows; rowIndex++) {
        this.setCellFormat(worksheet, rowIndex, columnIndex, column.format);
      }
      if (column.total && !column.format) {
        this.setCellFormat(worksheet, totalRowIndex, columnIndex, moneyFormat);
      }
    });
  }

  private setRowStyle(worksheet: XLSX.WorkSheet, rowIndex: number, columnCount: number, style: any): void {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      this.setCellStyle(worksheet, rowIndex, columnIndex, style);
    }
  }

  private setCellStyle(worksheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number, style: any): void {
    const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    if (!worksheet[cellAddress]) {
      worksheet[cellAddress] = { t: 's', v: '' };
    }
    worksheet[cellAddress].s = {
      font: style.bold ? { bold: true } : undefined,
      fill: style.fill ? { fgColor: { rgb: style.fill } } : undefined
    };
  }

  private setCellFormat(worksheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number, format?: string): void {
    if (!format) {
      return;
    }
    const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].z = format;
    }
  }

  private getRepaymentScheduleColumnWidths(rows: any[][]): any[] {
    const columnCount = Math.max(...rows.map((row) => row.length));
    return Array.from({ length: columnCount }, (_, columnIndex) => {
      const width = rows.reduce((maxWidth, row) => {
        const value = row[columnIndex];
        if (value instanceof Date) {
          return Math.max(maxWidth, 12);
        }
        return Math.max(maxWidth, String(value ?? '').length + 2);
      }, 10);
      return { wch: Math.min(Math.max(width, 10), 28) };
    });
  }

  private getLoanIdentifier(): string {
    const loanInfo = this.loanData || this.loanDetailsData || {};
    return String(loanInfo.id ?? loanInfo.accountNo ?? 'loan').replace(/[^A-Za-z0-9_-]/g, '');
  }

  private formatDateForFileName(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private toExcelDate(value: any): Date | '' {
    if (!value) {
      return '';
    }
    if (value instanceof Date) {
      return value;
    }
    if (Array.isArray(value) && value.length >= 3) {
      return new Date(value[0], value[1] - 1, value[2]);
    }
    return this.dateUtils.parseDate(value);
  }

  private toNumber(value: any): number {
    const numericValue = Number(value ?? 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private toPercentage(value: any): number {
    const numericValue = this.toNumber(value);
    return Math.abs(numericValue) > 1 ? numericValue / 100 : numericValue;
  }

  private getPlainEmiLabel(): string {
    const repaymentFrequencyTypeId = this.getRepaymentFrequencyTypeId();
    switch (repaymentFrequencyTypeId) {
      case 0:
        return this.isAnyLineOfCredit() ? 'EMI Amount' : 'EDI Amount';
      case 1:
        return 'EWI Amount';
      case 2:
        return 'EMI Amount';
      case 3:
        return 'EAI Amount';
      default:
        return 'EMI Amount';
    }
  }

  private getPlainIntervalLabel(): string {
    switch (this.getRepaymentFrequencyTypeId()) {
      case 1:
        return 'Weeks';
      case 2:
        return 'Months';
      default:
        return 'Days';
    }
  }

  /**
   * Exports the accrual report using "Generate Loan Monthly Accrual Summations" data from the backend.
   * Falls back to client-side calculation if the API is unavailable.
   */
  exportAccrualReport() {
    const loanId = this.loanDetailsData?.id ?? this.loanData?.id;
    if (loanId) {
      this.loansService.getAccrualReport(String(loanId)).subscribe({
        next: (response) => {
          const periods = response?.periods ?? [];
          if (periods.length > 0) {
            const accrualData = periods.map((p: AccrualReportPeriod) => ({
              Index: p.index,
              'End of Month': p.endOfMonth,
              'Opening Principal': this.formatCurrency(Number(p.openingPrincipal)),
              'Closing Principal': this.formatCurrency(Number(p.closingPrincipal)),
              'Interest Accrued': this.formatCurrency(Number(p.interestAccrued)),
              'Actual Interest Accrued':
                p.actualInterestAccrued != null ? this.formatCurrency(Number(p.actualInterestAccrued)) : ''
            }));
            this.exportAccrualToExcel(accrualData, new Date());
          } else {
            this.exportAccrualReportFromSchedule();
          }
        },
        error: () => this.exportAccrualReportFromSchedule()
      });
    } else {
      this.exportAccrualReportFromSchedule();
    }
  }

  /**
   * Fallback: generates accrual data from repayment schedule and exports to Excel.
   */
  private exportAccrualReportFromSchedule() {
    if (
      !this.repaymentScheduleDetails ||
      !this.repaymentScheduleDetails.periods ||
      this.repaymentScheduleDetails.periods.length === 0
    ) {
      return;
    }

    const periods = this.repaymentScheduleDetails.periods;
    const loanInfo = this.loanData || this.loanDetailsData;

    let startDate: Date;
    if (loanInfo?.timeline?.actualDisbursementDate) {
      startDate = this.dateUtils.parseDate(loanInfo.timeline.actualDisbursementDate);
    } else if (periods[0]?.fromDate) {
      startDate = this.dateUtils.parseDate(periods[0].fromDate);
    } else if (periods[0]?.dueDate) {
      startDate = this.dateUtils.parseDate(periods[0].dueDate);
    } else {
      console.error('Cannot determine loan start date');
      return;
    }

    const lastPeriod = periods[periods.length - 1];
    const maturityDate = this.dateUtils.parseDate(lastPeriod.dueDate);
    const accrualData = this.generateAccrualData(periods, startDate, maturityDate);
    this.exportAccrualToExcel(accrualData, startDate);
  }

  /**
   * Returns the number of days between two dates (inclusive of both dates).
   */
  private getDaysBetween(from: Date, to: Date): number {
    const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const toTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
    return Math.round((toTime - fromTime) / (24 * 60 * 60 * 1000)) + 1;
  }

  /**
   * Gets the start date of a schedule period (day after previous due, or fromDate, or loan start).
   */
  private getPeriodStartDate(
    period: RepaymentSchedulePeriod,
    periodIndex: number,
    periods: RepaymentSchedulePeriod[],
    startDate: Date
  ): Date {
    if (period.fromDate) {
      return this.dateUtils.parseDate(period.fromDate);
    }
    if (periodIndex > 0 && periods[periodIndex - 1].dueDate) {
      const prevDue = this.dateUtils.parseDate(periods[periodIndex - 1].dueDate);
      const next = new Date(prevDue);
      next.setDate(next.getDate() + 1);
      return next;
    }
    return new Date(startDate);
  }

  /**
   * Calculates day-weighted interest accrued in a date range from a single period.
   * Returns (overlapDays / periodDays) * periodInterest.
   */
  private getDayWeightedInterestForRange(
    periodStart: Date,
    periodDue: Date,
    periodDays: number,
    periodInterest: number,
    rangeStart: Date,
    rangeEnd: Date
  ): number {
    const overlapStart = periodStart > rangeStart ? periodStart : rangeStart;
    const overlapEnd = periodDue < rangeEnd ? periodDue : rangeEnd;
    if (overlapStart > overlapEnd) {
      return 0;
    }
    const overlapDays = this.getDaysBetween(overlapStart, overlapEnd);
    if (periodDays <= 0) {
      return 0;
    }
    return (overlapDays / periodDays) * periodInterest;
  }

  /**
   * Generates monthly accrual data from repayment schedule periods.
   * Accrual is calculated month-wise on the basis of number of days: each period's interest
   * is allocated to calendar months in proportion to how many days of that period fall in each month.
   */
  private generateAccrualData(periods: RepaymentSchedulePeriod[], startDate: Date, maturityDate: Date): any[] {
    const accrualRows: any[] = [];
    const currentDate = this.settingsService.businessDate;
    let index = 1;

    let initialPrincipal = 0;
    const firstDisbursementPeriod = periods.find((p) => p.principalDisbursed && p.principalDisbursed > 0);
    if (firstDisbursementPeriod) {
      initialPrincipal = firstDisbursementPeriod.principalDisbursed;
    } else if (periods.length > 0) {
      initialPrincipal = (periods[0].principalLoanBalanceOutstanding || 0) + (periods[0].principalDue || 0);
    }
    let previousPrincipalBalance = initialPrincipal;

    let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const finalMonth = new Date(maturityDate.getFullYear(), maturityDate.getMonth(), 1);

    while (currentMonth <= finalMonth) {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();

      let monthEndDate: Date;
      if (year === maturityDate.getFullYear() && month === maturityDate.getMonth()) {
        monthEndDate = new Date(maturityDate);
      } else {
        monthEndDate = new Date(year, month + 1, 0);
      }

      let monthStartDate: Date;
      if (year === startDate.getFullYear() && month === startDate.getMonth()) {
        monthStartDate = new Date(startDate);
      } else {
        monthStartDate = new Date(year, month, 1);
      }

      // Opening principal
      let openingPrincipal = previousPrincipalBalance;
      const periodsBeforeMonth = periods.filter((p) => {
        if (!p.dueDate) return false;
        return this.dateUtils.parseDate(p.dueDate) < monthStartDate;
      });
      if (periodsBeforeMonth.length > 0) {
        const lastBefore = periodsBeforeMonth[periodsBeforeMonth.length - 1];
        openingPrincipal = lastBefore.principalLoanBalanceOutstanding ?? 0;
        if (lastBefore.principalDisbursed) {
          openingPrincipal = lastBefore.principalDisbursed;
        }
      } else if (year === startDate.getFullYear() && month === startDate.getMonth()) {
        openingPrincipal = initialPrincipal;
      }

      // Interest accrued this month: day-weighted by overlap of each period with this month
      let interestAccrued = 0;
      periods.forEach((period, periodIndex) => {
        if (!period.dueDate || (period.interestOriginalDue ?? 0) === 0) {
          return;
        }
        const periodDue = this.dateUtils.parseDate(period.dueDate);
        const periodStart = this.getPeriodStartDate(period, periodIndex, periods, startDate);
        if (periodDue < monthStartDate || periodStart > monthEndDate) {
          return;
        }
        const periodDays = period.daysInPeriod ?? Math.max(1, this.getDaysBetween(periodStart, periodDue));
        interestAccrued += this.getDayWeightedInterestForRange(
          periodStart,
          periodDue,
          periodDays,
          period.interestOriginalDue ?? 0,
          monthStartDate,
          monthEndDate
        );
      });

      // Closing principal
      let closingPrincipal = openingPrincipal;
      const periodsUpToMonthEnd = periods.filter(
        (p) => p.dueDate && this.dateUtils.parseDate(p.dueDate) <= monthEndDate
      );
      if (periodsUpToMonthEnd.length > 0) {
        closingPrincipal = periodsUpToMonthEnd[periodsUpToMonthEnd.length - 1].principalLoanBalanceOutstanding ?? 0;
      }
      if (year === maturityDate.getFullYear() && month === maturityDate.getMonth()) {
        closingPrincipal = 0;
      }

      // Actual interest accrued: for past months = full month (same as Interest Accrued); for current month = accrual up to business date; future = blank
      let actualInterestAccrued: number | null;
      if (monthEndDate < currentDate) {
        actualInterestAccrued = interestAccrued;
      } else if (currentDate >= monthStartDate && currentDate <= monthEndDate) {
        actualInterestAccrued = 0;
        const effectiveEnd = currentDate;
        periods.forEach((period, periodIndex) => {
          if (!period.dueDate || (period.interestOriginalDue ?? 0) === 0) return;
          const periodDue = this.dateUtils.parseDate(period.dueDate);
          const periodStart = this.getPeriodStartDate(period, periodIndex, periods, startDate);
          if (periodDue < monthStartDate || periodStart > effectiveEnd) return;
          const periodDays = period.daysInPeriod ?? Math.max(1, this.getDaysBetween(periodStart, periodDue));
          actualInterestAccrued += this.getDayWeightedInterestForRange(
            periodStart,
            periodDue,
            periodDays,
            period.interestOriginalDue ?? 0,
            monthStartDate,
            effectiveEnd
          );
        });
      } else {
        actualInterestAccrued = null;
      }

      const monthEndDateStr = this.dateUtils.formatDate(monthEndDate, Dates.DEFAULT_DATEFORMAT);

      accrualRows.push({
        Index: index,
        'End of Month': monthEndDateStr,
        'Opening Principal': this.formatCurrency(openingPrincipal),
        'Closing Principal': this.formatCurrency(closingPrincipal),
        'Interest Accrued': this.formatCurrency(interestAccrued),
        'Actual Interest Accrued': actualInterestAccrued !== null ? this.formatCurrency(actualInterestAccrued) : ''
      });

      previousPrincipalBalance = closingPrincipal;
      currentMonth = new Date(year, month + 1, 1);
      index++;
    }

    return accrualRows;
  }

  /**
   * Formats a number as currency string
   */
  private formatCurrency(value: number): string {
    if (value === null || value === undefined) {
      return '0.00';
    }
    return value.toFixed(2);
  }

  /**
   * Exports accrual data to Excel file
   */
  private exportAccrualToExcel(accrualData: any[], startDate: Date) {
    if (!accrualData || accrualData.length === 0) {
      return;
    }

    // Create worksheet from data
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(accrualData);

    // Set column widths
    const colWidths = [
      { wch: 8 }, // Index
      { wch: 15 }, // End of Month
      { wch: 18 }, // Opening Principal
      { wch: 18 }, // Closing Principal
      { wch: 18 }, // Interest Accrued
      { wch: 22 } // Actual Interest Accrued

    ];
    ws['!cols'] = colWidths;

    // Create workbook and add worksheet
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Accrual Report');

    // Generate filename
    const businessDate = this.dateUtils.formatDate(this.settingsService.businessDate, Dates.DEFAULT_DATEFORMAT);
    const loanId = this.loanDetailsData?.id || this.loanData?.id || 'loan';
    const fileName = `Accrual-Report-${loanId}-${businessDate}.xlsx`;

    // Save file
    XLSX.writeFile(wb, fileName);
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

  private getRepaymentFrequencyTypeId(): number {
    const loanAccountData = this.loanData || this.loanDetailsData;
    const repaymentFrequencyType = loanAccountData?.repaymentFrequencyType;
    return repaymentFrequencyType?.id ?? repaymentFrequencyType ?? 5;
  }

  getEmiLabel(): string {
    const repaymentFrequencyTypeId = this.getRepaymentFrequencyTypeId();
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

  getIntervalLabel(): string {
    switch (this.getRepaymentFrequencyTypeId()) {
      case 1:
        return 'labels.inputs.Weeks';
      case 2:
        return 'labels.inputs.Months';
      default:
        return 'labels.inputs.Days';
    }
  }

  getIntervalValue(item: any): number | string {
    switch (this.getRepaymentFrequencyTypeId()) {
      case 1:
        return item.daysInPeriod != null ? Math.max(1, Math.round(item.daysInPeriod / 7)) : '';
      case 2:
        return this.getMonthsInPeriod(item);
      default:
        return item.daysInPeriod;
    }
  }

  private getMonthsInPeriod(item: any): number | string {
    if (!item?.fromDate || !item?.dueDate) {
      return item?.daysInPeriod ?? '';
    }

    const fromDate = this.dateUtils.parseDate(item.fromDate);
    const dueDate = this.dateUtils.parseDate(item.dueDate);
    const months = (dueDate.getFullYear() - fromDate.getFullYear()) * 12 + dueDate.getMonth() - fromDate.getMonth();

    if (months > 0 && (dueDate.getDate() >= fromDate.getDate() || this.isEndOfMonth(fromDate, dueDate))) {
      return months;
    }

    return Math.max(1, months);
  }

  private isEndOfMonth(fromDate: Date, dueDate: Date): boolean {
    return this.isLastDayOfMonth(fromDate) && this.isLastDayOfMonth(dueDate);
  }

  private isLastDayOfMonth(date: Date): boolean {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === date.getDate();
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
        const payload: any = {
          installmentNumber: installment.period,
          newDueDate: this.dateUtils.formatDate(result.newDueDate, dateFormat),
          adjustmentDate: this.dateUtils.formatDate(this.settingsService.businessDate, dateFormat),
          dateFormat,
          locale,
          adjustWithInterestRecalculation: !!result.adjustWithInterestRecalculation
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
    // Block adjustment only if there are actual overdue charges (fees, penalties)
    // This matches the backend validation logic which checks for outstanding charges
    // Note: We check fees and penalties; tax charges are validated on the backend
    const feeChargesOutstanding = Number(installment.feeChargesOutstanding ?? 0);
    const penaltyChargesOutstanding = Number(installment.penaltyChargesOutstanding ?? 0);
    return feeChargesOutstanding > 0 || penaltyChargesOutstanding > 0;
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
        const payload: any = {
          installmentNumber: result.installmentNumber,
          newDueDate: this.dateUtils.formatDate(result.newDueDate, dateFormat),
          adjustmentDate: this.dateUtils.formatDate(this.settingsService.businessDate, dateFormat),
          dateFormat,
          locale,
          adjustWithInterestRecalculation: !!result.adjustWithInterestRecalculation
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
