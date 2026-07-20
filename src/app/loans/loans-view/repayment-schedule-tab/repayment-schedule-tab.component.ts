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
import { ProductsService } from 'app/products/products.service';
import { computeMonthlyAccrualRows } from 'app/loans/accrual-report.util';
import { LoanDownloadType } from 'app/shared/loan-downloads-menu/loan-downloads-menu.component';
import { generateKeyFactStatementPdf } from 'app/shared/key-fact-statement/key-fact-statement-pdf';
import { take } from 'rxjs/operators';

import { jsPDF, jsPDFOptions } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as JSZip from 'jszip';
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
  activeDownloadType: LoanDownloadType | null = null;

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
    private productsService: ProductsService,
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

  downloadLoanDocument(type: LoanDownloadType): void {
    this.activeDownloadType = type;
    try {
      if (type === 'repaymentSchedulePdf') {
        this.exportToPDF();
      } else if (type === 'repaymentScheduleExcel') {
        this.exportToExcel();
      } else if (type === 'accrualReport') {
        this.exportAccrualReport();
      } else if (type === 'keyFactStatement') {
        this.exportKeyFactStatement();
      }
    } finally {
      setTimeout(() => {
        this.activeDownloadType = null;
      }, 300);
    }
  }

  exportToExcel(): void {
    if (!this.repaymentScheduleDetails?.periods?.length || this.isExportingRepaymentScheduleExcel) {
      return;
    }

    this.isExportingRepaymentScheduleExcel = true;
    setTimeout(async () => {
      try {
        const loanDetailsWorksheet = this.buildLoanDetailsWorksheet();
        const repaymentScheduleWorksheet = this.buildRepaymentScheduleWorksheet();
        const workbook: XLSX.WorkBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, loanDetailsWorksheet, 'Loan Details');
        XLSX.utils.book_append_sheet(workbook, repaymentScheduleWorksheet, 'Repayment Schedule');

        const loanId = this.getLoanIdentifier();
        const generationDate = this.formatDateForFileName(this.settingsService.businessDate);
        await this.writeRepaymentScheduleWorkbook(workbook, `RepaymentSchedule_${loanId}_${generationDate}.xlsx`);
      } finally {
        this.isExportingRepaymentScheduleExcel = false;
      }
    });
  }

  private async writeRepaymentScheduleWorkbook(workbook: XLSX.WorkBook, fileName: string): Promise<void> {
    const workbookData = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
      cellDates: true,
      cellStyles: true
    });
    const zip = await JSZip.loadAsync(workbookData);
    const totalRowNumber = this.repaymentScheduleDetails.periods.length + 2;

    await this.applyBoldRowsToWorksheet(zip, 'xl/worksheets/sheet1.xml', [
      1
    ]);
    await this.applyBoldRowsToWorksheet(zip, 'xl/worksheets/sheet2.xml', [
      1,
      totalRowNumber
    ]);

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    this.downloadBlob(blob, fileName);
  }

  private async applyBoldRowsToWorksheet(zip: JSZip, sheetPath: string, rowNumbers: number[]): Promise<void> {
    const worksheetFile = zip.file(sheetPath);
    const stylesFile = zip.file('xl/styles.xml');
    if (!worksheetFile || !stylesFile) {
      return;
    }

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const worksheetDocument = parser.parseFromString(await worksheetFile.async('string'), 'application/xml');
    const rowNumberSet = new Set(rowNumbers.map((rowNumber) => String(rowNumber)));
    const targetCells = Array.from(worksheetDocument.getElementsByTagName('c')).filter((cell) => {
      const cellReference = cell.getAttribute('r') || '';
      const rowNumber = cellReference.replace(/[A-Z]+/g, '');
      return rowNumberSet.has(rowNumber);
    });

    if (!targetCells.length) {
      return;
    }

    const styleIds = Array.from(new Set(targetCells.map((cell) => cell.getAttribute('s') || '0')));
    const boldStyles = this.addBoldCellStyles(await stylesFile.async('string'), styleIds);

    targetCells.forEach((cell) => {
      const styleId = cell.getAttribute('s') || '0';
      cell.setAttribute('s', boldStyles.styleMap[styleId] || styleId);
    });

    zip.file('xl/styles.xml', boldStyles.stylesXml);
    zip.file(sheetPath, serializer.serializeToString(worksheetDocument));
  }

  private addBoldCellStyles(
    stylesXml: string,
    styleIds: string[]
  ): { stylesXml: string; styleMap: { [key: string]: string } } {
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const stylesDocument = parser.parseFromString(stylesXml, 'application/xml');
    const namespace = stylesDocument.documentElement.namespaceURI;
    const fonts = stylesDocument.getElementsByTagName('fonts')[0];
    const cellFormats = stylesDocument.getElementsByTagName('cellXfs')[0];
    const existingFonts = Array.from(fonts.getElementsByTagName('font'));
    const existingFormats = Array.from(cellFormats.getElementsByTagName('xf'));
    const baseFont = existingFonts[0];
    const boldFont = baseFont
      ? (baseFont.cloneNode(true) as Element)
      : stylesDocument.createElementNS(namespace, 'font');

    if (!boldFont.getElementsByTagName('b').length) {
      boldFont.insertBefore(stylesDocument.createElementNS(namespace, 'b'), boldFont.firstChild);
    }

    fonts.appendChild(boldFont);
    const boldFontId = existingFonts.length;
    fonts.setAttribute('count', String(boldFontId + 1));

    const styleMap: { [key: string]: string } = {};
    styleIds.forEach((styleId) => {
      const baseFormat = existingFormats[Number(styleId)] || existingFormats[0];
      const boldFormat = baseFormat
        ? (baseFormat.cloneNode(true) as Element)
        : stylesDocument.createElementNS(namespace, 'xf');
      boldFormat.setAttribute('fontId', String(boldFontId));
      boldFormat.setAttribute('applyFont', '1');
      cellFormats.appendChild(boldFormat);
      styleMap[styleId] = String(existingFormats.length + Object.keys(styleMap).length);
    });

    cellFormats.setAttribute('count', String(existingFormats.length + styleIds.length));
    return { stylesXml: serializer.serializeToString(stylesDocument), styleMap };
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private buildLoanDetailsWorksheet(): XLSX.WorkSheet {
    const loanInfo = this.loanData || this.loanDetailsData || {};
    const metadataRows = this.getRepaymentScheduleMetadataRows(loanInfo);
    const rows = [
      [
        'Field',
        'Value'
      ],
      ...metadataRows
    ];

    const worksheet: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
    worksheet['!cols'] = this.getRepaymentScheduleColumnWidths(rows);

    this.setRowStyle(worksheet, 0, rows[0].length, { bold: true, fill: 'EDEDED' });
    metadataRows.forEach((row, index) => {
      this.setCellStyle(worksheet, index + 1, 0, { bold: true });
      if (row[0] === 'Generated On' || row[0] === 'Disbursement Date' || row[0] === 'Maturity Date') {
        this.setCellFormat(worksheet, index + 1, 1, 'dd mmm yyyy');
      }
      if (row[0] === 'Interest Rate') {
        this.setCellFormat(worksheet, index + 1, 1, '0.00%');
      }
    });

    return worksheet;
  }

  private buildRepaymentScheduleWorksheet(): XLSX.WorkSheet {
    const tableColumns = this.getRepaymentScheduleExportColumns();
    const scheduleRows = this.repaymentScheduleDetails.periods.map((period: any) =>
      tableColumns.map((column) => column.value(period))
    );
    const totalsRow = tableColumns.map((column) => (column.total ? column.total() : ''));

    const rows = [
      tableColumns.map((column) => column.header),
      ...scheduleRows,
      totalsRow
    ];

    const worksheet: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
    worksheet['!cols'] = this.getRepaymentScheduleColumnWidths(rows);

    this.applyRepaymentScheduleExcelFormatting(worksheet, rows.length, tableColumns);
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
        header: 'Days',
        value: (item: any) => item.daysInPeriod,
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
    totalRows: number,
    tableColumns: any[]
  ): void {
    const headerRowIndex = 0;
    const totalRowIndex = totalRows - 1;
    const tableDataStartIndex = 1;
    const moneyFormat = '#,##0.000';

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
    return `${this.getInstallmentAmountLabel()} Amount`;
  }

  private getInstallmentAmountLabel(): 'EMI' | 'EDI' | 'EWI' | 'EAI' {
    if (this.isAnyLineOfCredit() || this.isRbfProduct()) {
      return 'EMI';
    }

    if (this.isLoanFactorRateEnabled()) {
      return 'EDI';
    }

    switch (this.getRepaymentFrequencyTypeId()) {
      case 0:
        return 'EDI';
      case 1:
        return 'EWI';
      case 2:
        return 'EMI';
      case 3:
        return 'EAI';
      default:
        return 'EMI';
    }
  }

  private exportKeyFactStatement(): void {
    const loanId = this.loanDetailsData?.id?.toString();
    if (!loanId) {
      return;
    }

    this.loansService.getLoanKeyFactStatement(loanId).subscribe({
      next: (response: any) => {
        this.generateKfsPdf(response).catch((error) => console.error('Failed to generate KFS:', error));
      },
      error: (error) => console.error('Failed to download KFS:', error)
    });
  }

  private generateKfsPdf(kfs: any): Promise<void> {
    const loan = kfs?.loan ?? {};
    const businessDate = this.dateUtils.formatDate(this.settingsService.businessDate, Dates.DEFAULT_DATEFORMAT);
    return generateKeyFactStatementPdf(kfs, {
      dateOfIssue: businessDate,
      fallbackLoan: this.loanDetailsData,
      fileName: `key-fact-statement-${loan.accountNo ?? this.getLoanIdentifier()}.pdf`
    });
  }

  /**
   * Exports the accrual report using "Generate Loan Monthly Accrual Summations" data from the backend.
   * Falls back to client-side calculation if the API is unavailable.
   */
  exportAccrualReport() {
    this.exportAccrualReportFromSchedule();
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

    this.resolveProductAnnualRate(loanInfo).then((annualRatePercent) => {
      const accrualData = computeMonthlyAccrualRows({
        periods,
        startDate,
        maturityDate,
        businessDate: this.settingsService.businessDate,
        annualRatePercent,
        parseDate: (value: any) => this.dateUtils.parseDate(value),
        formatMonthEnd: (date: Date) => this.dateUtils.formatDate(date, Dates.DEFAULT_DATEFORMAT)
      });
      this.exportAccrualToExcel(accrualData, startDate);
    });
  }

  /**
   * Resolves the loan PRODUCT's annual nominal (reducing-balance) interest rate used to accrue interest.
   * Falls back to the loan-level rate if the product id or product rate is unavailable.
   */
  private resolveProductAnnualRate(loanInfo: any): Promise<number> {
    const fallbackRate = this.toNumber(loanInfo?.annualInterestRate);
    const loanProductId = loanInfo?.loanProductId;
    if (loanProductId == null) {
      console.warn('Accrual report: loanProductId unavailable, using loan-level annualInterestRate');
      return Promise.resolve(fallbackRate);
    }
    return new Promise((resolve) => {
      this.productsService
        .getLoanProduct(String(loanProductId))
        .pipe(take(1))
        .subscribe({
          next: (product: any) => {
            resolve(product?.annualInterestRate != null ? this.toNumber(product.annualInterestRate) : fallbackRate);
          },
          error: () => {
            console.warn('Accrual report: failed to fetch loan product rate, using loan-level annualInterestRate');
            resolve(fallbackRate);
          }
        });
    });
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

    const accrualDataWithTotals = this.addAccrualTotalsRow(accrualData);

    // Create worksheet from data
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(accrualDataWithTotals);

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
    this.writeAccrualWorkbook(wb, fileName, accrualDataWithTotals.length + 1);
  }

  private addAccrualTotalsRow(accrualData: any[]): any[] {
    const interestAccruedTotal = accrualData.reduce((sum, row) => sum + this.toNumber(row['Interest Accrued']), 0);
    const actualInterestAccruedTotal = accrualData.reduce(
      (sum, row) => sum + this.toNumber(row['Actual Interest Accrued']),
      0
    );

    return [
      ...accrualData,
      {
        Index: 'Total',
        'End of Month': '',
        'Opening Principal': '',
        'Closing Principal': '',
        'Interest Accrued': this.formatCurrency(interestAccruedTotal),
        'Actual Interest Accrued': this.formatCurrency(actualInterestAccruedTotal)
      }
    ];
  }

  private async writeAccrualWorkbook(workbook: XLSX.WorkBook, fileName: string, totalRowNumber: number): Promise<void> {
    const workbookData = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
      cellDates: true,
      cellStyles: true
    });
    const zip = await JSZip.loadAsync(workbookData);

    await this.applyBoldRowsToWorksheet(zip, 'xl/worksheets/sheet1.xml', [
      1,
      totalRowNumber
    ]);

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    this.downloadBlob(blob, fileName);
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

  private isRbfProduct(): boolean {
    const loanAccountData = this.loanData || this.loanDetailsData;
    const productName = String(
      loanAccountData?.loanProductName ??
        loanAccountData?.productName ??
        loanAccountData?.product?.name ??
        loanAccountData?.productShortName ??
        loanAccountData?.shortName ??
        ''
    ).toUpperCase();

    return productName === 'RBF' || productName.includes('RBF');
  }

  private getRepaymentFrequencyTypeId(): number {
    const loanAccountData = this.loanData || this.loanDetailsData;
    const repaymentFrequencyType = loanAccountData?.repaymentFrequencyType;
    return repaymentFrequencyType?.id ?? repaymentFrequencyType ?? 5;
  }

  getEmiLabel(): string {
    return `labels.inputs.${this.getInstallmentAmountLabel()} Amount`;
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
        loanId: this.loanDetailsData?.id,
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
        loanId: this.loanDetailsData?.id,
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
