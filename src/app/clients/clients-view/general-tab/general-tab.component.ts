/** Angular Imports */
import { ChangeDetectorRef, Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { SelectionModel } from '@angular/cdk/collections';
import { MatDialog } from '@angular/material/dialog';
import { jsPDF, jsPDFOptions } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/** Custom Services. */
import { ClientsService, BulkLoanDisbursementResponse } from 'app/clients/clients.service';
import { LoansService } from 'app/loans/loans.service';
import { ProductsService } from 'app/products/products.service';
import { computeMonthlyAccrualRows } from 'app/loans/accrual-report.util';
import { Dates } from 'app/core/utils/dates';
import { SettingsService } from 'app/settings/settings.service';
import { LoanDownloadType } from 'app/shared/loan-downloads-menu/loan-downloads-menu.component';
import { generateKeyFactStatementPdf } from 'app/shared/key-fact-statement/key-fact-statement-pdf';
import { take } from 'rxjs/operators';
import {
  BulkDisburseDialogComponent,
  BulkDisburseDialogData
} from '../view-loc-details/active-loans-tab/bulk-disburse-dialog/bulk-disburse-dialog.component';
import {
  BulkDisburseResultsDialogComponent,
  BulkDisburseResultsDialogData
} from '../view-loc-details/active-loans-tab/bulk-disburse-results-dialog/bulk-disburse-results-dialog.component';
import { BulkDisburseLoadingDialogComponent } from '../view-loc-details/active-loans-tab/bulk-disburse-loading-dialog/bulk-disburse-loading-dialog.component';
import { TransferFromSavingsDialogComponent } from './transfer-from-savings-dialog/transfer-from-savings-dialog.component';

/**
 * General Tab component.
 */
@Component({
  selector: 'mifosx-general-tab',
  templateUrl: './general-tab.component.html',
  styleUrls: ['./general-tab.component.scss'],
  animations: [
    trigger('detailExpand', [
      state(
        'collapsed',
        style({
          height: '0px',
          minHeight: '0',
          padding: '0',
          overflow: 'hidden'
        })
      ),
      state(
        'expanded',
        style({
          height: '*',
          padding: '*',
          overflow: 'visible'
        })
      ),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ])

  ]
})
export class GeneralTabComponent {
  /** Open Loan Accounts Columns */
  openLoansColumns: string[] = [
    'Account No',
    'Loan Account',
    'Loan Amount',
    'Outstanding Balance',
    'Amount Paid',
    'Next Instalment Date',
    'Actions',
    'expand'
  ];
  /** Closed Loan Accounts Columns */
  closedLoansColumns: string[] = [
    'Account No',
    'Loan Account',
    'Loan Amount',
    'Outstanding Balance',
    'Amount Paid',
    'Closed Date',
    'expand'
  ];
  /** Open Savings Accounts Columns */
  openSavingsColumns: string[] = [
    'Account No',
    'Saving Account',
    'Associated Loan ID',
    'Last Active',
    'Balance',
    'Actions'
  ];
  /** Closed Savings Accounts Columns */
  closedSavingsColumns: string[] = [
    'Account No',
    'Saving Account',
    'Associated Loan ID',
    'Closed Date'
  ];
  /** Open Shares Accounts Columns */
  openSharesColumns: string[] = [
    'Account No',
    'Share Account',
    'Approved Shares',
    'Pending For Approval Shares',
    'Actions'
  ];
  /** Closed Shares Accounts Columns */
  closedSharesColumns: string[] = [
    'Account No',
    'Share Account',
    'Approved Shares',
    'Pending For Approval Shares',
    'Closed Date'
  ];
  /** Upcoming Charges Columns */
  upcomingChargesColumns: string[] = [
    'Name',
    'Due as of',
    'Due',
    'Paid',
    'Waived',
    'Outstanding',
    'Actions'
  ];
  /** Collaterals Column */
  collateralsColumns: string[] = [
    'ID',
    'Name',
    'Quantity',
    'Total Value',
    'Total Collateral Value'
  ];

  /** Lines of Credit Columns */
  locColumns: string[] = [
    'External Id',
    'Credit Limit',
    'Blocked Amount',
    'Available Balance',
    'Type',
    'Outstanding/Utilization',
    'Actions',
    'expand'
  ];

  /** Base columns for inner LOC loans (without select) */
  private baseLocLoanColumns: string[] = [
    'Account No',
    'Invoice Number',
    'Supplier/Buyer Name',
    'Disbursed Amount',
    'Outstanding Balance',
    'Amount Paid',
    'Refund Amount',
    'Actions',
    'expand'
  ];

  /** Alias for colspan calculations in template */
  get locLoanColumns(): string[] {
    return this.baseLocLoanColumns;
  }

  /** Columns actually displayed for inner LOC loans depending on toggle and bulk mode */
  getDisplayedLocLoanColumns(locId: number): string[] {
    const isBulkMode = this.locBulkDisburseMode.get(locId) || false;

    if (this.showClosedLOCLoans) {
      return this.baseLocLoanColumns.filter((c) => c !== 'Refund Amount' && c !== 'Actions');
    }

    if (isBulkMode) {
      return [
        'select',
        ...this.baseLocLoanColumns
      ];
    }

    return this.baseLocLoanColumns;
  }

  /** Selection models per LOC for bulk disbursement */
  locLoanSelections: Map<number, SelectionModel<any>> = new Map();

  /** Bulk disburse mode per LOC */
  locBulkDisburseMode: Map<number, boolean> = new Map();

  /** Client Account Data */
  clientAccountData: any;
  /** Loan Accounts Data */
  loanAccounts: any;
  /** Savings Accounts Data */
  savingAccounts: any;
  /** Shares Accounts Data */
  shareAccounts: any;
  /** Upcoming Charges Data */
  upcomingCharges: any;
  /** Client Summary Data */
  clientSummary: any;
  /** Collaterals Data */
  collaterals: any;
  /** Lines of Credit Data */
  linesOfCredit: any[] = []; // displayed subset
  private allLinesOfCredit: any[] = []; // full list including closed
  showClosedLOCs = false; // toggle flag for viewing closed LOCs only
  // Toggle flag for viewing closed loans inside a LOC detail
  showClosedLOCLoans = false;

  /** Show Closed Loan Accounts */
  showClosedLoanAccounts = false;
  /** Show Closed Saving Accounts */
  showClosedSavingAccounts = false;
  /** Show Closed Share Accounts */
  showClosedShareAccounts = false;
  /** Show Closed Reccuring Deposits Accounts */
  showClosedRecurringAccounts = false;
  /** Show Closed Fixed Deposits Accounts */
  showClosedFixedAccounts = false;

  /** Client Id */
  clientid: any;

  expandedElement: any | null = null;
  expandedLOCElement: any | null = null;
  expandedLOCLoanElement: any | null = null; // expanded loan inside a LOC

  /** Today's date for RBF progress timeline */
  today: Date = new Date();

  /** In-flight guard for expand-time loan hydration (schedule + interest). */
  private loanExpandHydrationInFlight = new Set<number>();
  private activeLoanDownloads = new Map<number, LoanDownloadType>();

  /**
   * @param {ActivatedRoute} route Activated Route
   * @param {ClientsService} clientService Clients Service
   * @param {Router} router Router
   * @param {MatDialog} dialog Material Dialog
   * @param {LoansService} loansService Loans API (interest fields on full loan)
   * @param {ChangeDetectorRef} cdr Change detector
   */
  constructor(
    private route: ActivatedRoute,
    private clientService: ClientsService,
    private router: Router,
    private dialog: MatDialog,
    private loansService: LoansService,
    private productsService: ProductsService,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private cdr: ChangeDetectorRef
  ) {
    this.route.data.subscribe(
      (data: { clientAccountsData: any; clientChargesData: any; clientSummary: any; clientCollateralData: any }) => {
        this.clientAccountData = data.clientAccountsData;
        this.savingAccounts = data.clientAccountsData.savingsAccounts;
        this.loanAccounts = data.clientAccountsData.loanAccounts;
        this.shareAccounts = data.clientAccountsData.shareAccounts;
        this.upcomingCharges = data.clientChargesData.pageItems;
        this.collaterals = data.clientCollateralData;
        this.clientSummary = data.clientSummary ? data.clientSummary[0] : [];
        this.clientid = this.route.parent.snapshot.params['clientId'];
        // Lines of Credit list now resolved (may be undefined if resolver omitted)
        const resolvedLocList = (data as any).clientLocList || [];
        if (resolvedLocList && Array.isArray(resolvedLocList) && resolvedLocList.length) {
          this.allLinesOfCredit = this.mapCreditLinesToTableFormat(resolvedLocList);
          this.applyLOCFilter();
        } else {
          // fallback to runtime fetch if resolver returned empty
          this.fetchLinesOfCredit();
        }
      }
    );
  }

  /**
   * Toggles Loan Accounts Overview
   */
  toggleLoanAccountsOverview() {
    this.showClosedLoanAccounts = !this.showClosedLoanAccounts;
  }

  /**
   * Toggles Loan Accounts Overview
   */
  toggleSavingAccountsOverview() {
    this.showClosedSavingAccounts = !this.showClosedSavingAccounts;
  }

  /**
   * Toggles Loan Accounts Overview
   */
  toggleShareAccountsOverview() {
    this.showClosedShareAccounts = !this.showClosedShareAccounts;
  }

  /**
   * Toggles Reccuring Accounts Overview
   */
  toggleRecurringAccountsOverview() {
    this.showClosedRecurringAccounts = !this.showClosedRecurringAccounts;
  }

  /**
   * Toggles Fixed Accounts Overview
   */
  toggleFixedAccountsOverview() {
    this.showClosedFixedAccounts = !this.showClosedFixedAccounts;
  }

  /**
   * Waive Charge.
   * @param chargeId Selected Charge Id.
   * @param clientId Selected Client Id.
   */
  waiveCharge(chargeId: string, clientId: string) {
    const charge = { clientId: clientId.toString(), resourceType: chargeId };
    this.clientService.waiveClientCharge(charge).subscribe(() => {
      this.getChargeData(clientId);
    });
  }

  /**
   * Get Charge Data.
   * @param clientId Selected Client Id.
   */
  getChargeData(clientId: string) {
    this.clientService.getClientChargesData(clientId).subscribe((data: any) => {
      this.upcomingCharges = data.pageItems;
    });
  }

  /**
   * Stops the propagation to view pages.
   * @param $event Mouse Event
   */
  routeEdit($event: MouseEvent) {
    $event.stopPropagation();
  }

  isPresent(value: any): boolean {
    return value !== null && value !== undefined;
  }

  isBlank(value: any): boolean {
    return value === null || value === undefined;
  }

  openTransferFromSavingsDialog(loan: any, event: MouseEvent): void {
    this.routeEdit(event);

    const dialogRef = this.dialog.open(TransferFromSavingsDialogComponent, {
      width: '42rem',
      maxWidth: '95vw',
      disableClose: false,
      data: {
        loan,
        clientId: this.clientid
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.submitted) {
        this.refreshClientLoanAndSavingsAccounts();
        this.refreshLOCData();
      }
    });
  }

  /**
   * @param {any} loanId Loan Id
   */
  routeTransferFund(loanId: any) {
    const queryParams: any = { loanId: loanId, accountType: 'fromloans' };
    this.router.navigate(
      [
        '../',
        'loans-accounts',
        loanId,
        'transfer-funds',
        'make-account-transfer'
      ],
      { relativeTo: this.route, queryParams: queryParams }
    );
  }

  getActiveLoanDownloadType(loan: any): LoanDownloadType | null {
    return this.activeLoanDownloads.get(Number(loan?.id)) || null;
  }

  downloadLoanDocument(loan: any, type: LoanDownloadType): void {
    if (!loan?.id || this.getActiveLoanDownloadType(loan)) {
      return;
    }

    const loanId = Number(loan.id);
    this.activeLoanDownloads.set(loanId, type);
    this.cdr.markForCheck();

    const downloadTask =
      type === 'keyFactStatement'
        ? this.exportLoanKeyFactStatement(loan)
        : this.ensureLoanScheduleForDownload(loan).then((loanDetails) => {
            if (type === 'repaymentSchedulePdf') {
              this.exportLoanRepaymentSchedulePdf(loanDetails);
            } else if (type === 'repaymentScheduleExcel') {
              this.exportLoanRepaymentScheduleExcel(loanDetails);
            } else if (type === 'accrualReport') {
              return this.exportLoanAccrualReport(loanDetails);
            }
            return undefined;
          });

    downloadTask
      .catch((error) => {
        console.error(`Failed to download ${type}:`, error);
      })
      .finally(() => {
        this.activeLoanDownloads.delete(loanId);
        this.cdr.markForCheck();
      });
  }

  private ensureLoanScheduleForDownload(loan: any): Promise<any> {
    if (loan?.repaymentSchedule?.periods?.length) {
      return Promise.resolve(loan);
    }

    return new Promise((resolve, reject) => {
      this.loansService
        .getLoanAccountResource(String(loan.id), 'repaymentSchedule')
        .pipe(take(1))
        .subscribe({
          next: (loanDetails: any) => {
            loan.repaymentSchedule = loanDetails?.repaymentSchedule;
            loan.currency = loan.currency || loanDetails?.currency;
            loan.timeline = loan.timeline || loanDetails?.timeline;
            loan.productName = loan.productName || loanDetails?.loanProductName;
            resolve({ ...loanDetails, ...loan, repaymentSchedule: loan.repaymentSchedule });
          },
          error: reject
        });
    });
  }

  private exportLoanRepaymentSchedulePdf(loan: any): void {
    const periods = this.getDownloadPeriods(loan);
    if (!periods.length) {
      return;
    }

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
    const columns = this.getRepaymentScheduleExportColumns();

    autoTable(pdf, {
      head: [columns.map((column) => column.header)],
      body: periods.map((period: any) => columns.map((column) => column.value(period))),
      foot: [columns.map((column) => (column.total ? column.total(loan) : ''))],
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

  private exportLoanRepaymentScheduleExcel(loan: any): void {
    const periods = this.getDownloadPeriods(loan);
    if (!periods.length) {
      return;
    }

    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    const columns = this.getRepaymentScheduleExportColumns();
    const loanInfoRows = [
      [
        'Field',
        'Value'
      ],
      [
        'Loan Account Number',
        loan.accountNo || ''
      ],
      [
        'Loan Product',
        loan.productName || loan.loanProductName || ''
      ],
      [
        'Generated On',
        this.dateUtils.formatDate(this.settingsService.businessDate, Dates.DEFAULT_DATEFORMAT)]

    ];
    const scheduleRows = [
      columns.map((column) => column.header),
      ...periods.map((period: any) => columns.map((column) => column.value(period))),
      columns.map((column) => (column.total ? column.total(loan) : ''))
    ];

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(loanInfoRows), 'Loan Details');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(scheduleRows), 'Repayment Schedule');

    const loanId = loan.id || loan.accountNo || 'loan';
    const generationDate = this.formatDateForDownloadFile(this.settingsService.businessDate);
    XLSX.writeFile(workbook, `RepaymentSchedule_${loanId}_${generationDate}.xlsx`, { cellDates: true });
  }

  private async exportLoanAccrualReport(loan: any): Promise<void> {
    const periods = this.getDownloadPeriods(loan);
    if (!periods.length) {
      return;
    }

    const startDate = loan?.timeline?.actualDisbursementDate
      ? this.dateUtils.parseDate(loan.timeline.actualDisbursementDate)
      : this.dateUtils.parseDate(periods[0].fromDate || periods[0].dueDate);
    const maturityDate = this.dateUtils.parseDate(periods[periods.length - 1].dueDate);

    const annualRatePercent = await this.resolveProductAnnualRate(loan);
    const rows = computeMonthlyAccrualRows({
      periods,
      startDate,
      maturityDate,
      businessDate: this.settingsService.businessDate,
      annualRatePercent,
      parseDate: (value: any) => this.dateUtils.parseDate(value),
      formatMonthEnd: (date: Date) => this.dateUtils.formatDate(date, Dates.DEFAULT_DATEFORMAT)
    });
    if (!rows.length) {
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(this.addAccrualTotalsRow(rows));
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 }];
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Accrual Report');
    const businessDate = this.dateUtils.formatDate(this.settingsService.businessDate, Dates.DEFAULT_DATEFORMAT);
    XLSX.writeFile(workbook, `Accrual-Report-${loan.id || 'loan'}-${businessDate}.xlsx`, { cellDates: true });
  }

  /**
   * Resolves the loan PRODUCT's annual nominal (reducing-balance) interest rate used to accrue interest.
   * Falls back to the loan-level rate if the product id or product rate is unavailable.
   */
  private resolveProductAnnualRate(loan: any): Promise<number> {
    const fallbackRate = this.asNumber(loan?.annualInterestRate);
    const loanProductId = loan?.loanProductId;
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
            resolve(product?.annualInterestRate != null ? this.asNumber(product.annualInterestRate) : fallbackRate);
          },
          error: () => {
            console.warn('Accrual report: failed to fetch loan product rate, using loan-level annualInterestRate');
            resolve(fallbackRate);
          }
        });
    });
  }

  private exportLoanKeyFactStatement(loan: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loansService
        .getLoanKeyFactStatement(String(loan.id))
        .pipe(take(1))
        .subscribe({
          next: async (response: any) => {
            try {
              await this.generateLoanKeyFactStatementPdf(response, loan);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          error: reject
        });
    });
  }

  private generateLoanKeyFactStatementPdf(kfs: any, fallbackLoan: any): Promise<void> {
    const loan = kfs?.loan ?? {};
    const businessDate = this.dateUtils.formatDate(this.settingsService.businessDate, Dates.DEFAULT_DATEFORMAT);
    return generateKeyFactStatementPdf(kfs, {
      dateOfIssue: businessDate,
      fallbackLoan,
      fileName: `key-fact-statement-${loan.accountNo ?? fallbackLoan?.accountNo ?? loan.id ?? 'loan'}.pdf`
    });
  }

  private getRepaymentScheduleExportColumns(): any[] {
    return [
      { header: '#', value: (period: any) => period.period || '' },
      { header: 'Due Date', value: (period: any) => this.formatDownloadDate(period.dueDate) },
      { header: 'Principal Due', value: (period: any) => this.asNumber(period.principalDue) },
      { header: 'Interest', value: (period: any) => this.asNumber(period.interestOriginalDue ?? period.interestDue) },
      { header: 'Fees', value: (period: any) => this.asNumber(period.feeChargesDue) },
      { header: 'Penalties', value: (period: any) => this.asNumber(period.penaltyChargesDue) },
      { header: 'Due', value: (period: any) => this.asNumber(period.totalDueForPeriod) },
      { header: 'Paid', value: (period: any) => this.asNumber(period.totalPaidForPeriod) },
      { header: 'Outstanding', value: (period: any) => this.asNumber(period.totalOutstandingForPeriod) }
    ];
  }

  private getDownloadPeriods(loan: any): any[] {
    return Array.isArray(loan?.repaymentSchedule?.periods) ? loan.repaymentSchedule.periods : [];
  }

  private addAccrualTotalsRow(accrualData: any[]): any[] {
    return [
      ...accrualData,
      {
        Index: 'Total',
        'End of Month': '',
        'Opening Principal': '',
        'Closing Principal': '',
        'Interest Accrued': accrualData
          .reduce((sum, row) => sum + this.asNumber(row['Interest Accrued']), 0)
          .toFixed(2),
        'Actual Interest Accrued': accrualData
          .reduce((sum, row) => sum + this.asNumber(row['Actual Interest Accrued']), 0)
          .toFixed(2)
      }
    ];
  }

  private formatDownloadDate(value: any): string {
    return value ? this.dateUtils.formatDate(this.dateUtils.parseDate(value), Dates.DEFAULT_DATEFORMAT) : '';
  }

  private formatDateForDownloadFile(date: Date): string {
    return this.dateUtils.formatDate(date, Dates.DEFAULT_DATEFORMAT).replace(/\s+/g, '-');
  }

  private asNumber(value: any): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  viewAccountsLabel(closed: boolean): string {
    if (closed) {
      return 'labels.buttons.View Active Accounts';
    } else {
      return 'labels.buttons.View Closed Accounts';
    }
  }

  trackById(index: number, item: any): any {
    return item.id || item.accountNo || item.collateralId || index;
  }

  toggleRow(element: any, event: Event): void {
    event.stopPropagation();
    const collapsing = this.expandedElement === element;
    this.expandedElement = collapsing ? null : element;
    if (!collapsing && this.expandedElement) {
      this.hydrateLoanExpandFromApiIfNeeded(this.expandedElement);
    }
  }

  /**
   * Merge repayment schedule + nominal interest + interest type from GET /loans/{id} once per expand (client /accounts is incomplete).
   */
  private hydrateLoanExpandFromApiIfNeeded(element: any): void {
    if (!element?.id) {
      return;
    }
    if (element._loanExpandHydrated) {
      return;
    }

    const loanId = Number(element.id);
    if (this.loanExpandHydrationInFlight.has(loanId)) {
      return;
    }
    this.loanExpandHydrationInFlight.add(loanId);

    this.loansService
      .getLoanGeneralTabExpandData(String(loanId))
      .pipe(take(1))
      .subscribe({
        next: (data: any) => {
          this.loanExpandHydrationInFlight.delete(loanId);
          if (data?.annualInterestRate != null) {
            element.annualInterestRate = data.annualInterestRate;
          }
          if (data?.interestRatePerPeriod != null && element.interestRatePerPeriod == null) {
            element.interestRatePerPeriod = data.interestRatePerPeriod;
          }
          if (data?.interestType != null) {
            element.interestType = data.interestType;
          }
          if (data?.numberOfRepayments != null) {
            element.numberOfRepayments = data.numberOfRepayments;
          }
          if (data?.loanProductId != null) {
            element.loanProductId = data.loanProductId;
          }
          if (data?.repaymentSchedule != null) {
            element.repaymentSchedule = data.repaymentSchedule;
          }
          element._loanExpandHydrated = true;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loanExpandHydrationInFlight.delete(loanId);
        }
      });
  }

  toggleLOCRow(element: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.expandedLOCElement = this.expandedLOCElement === element ? null : element;
  }

  fetchLinesOfCredit(): void {
    this.clientService.getClientCreditLines(this.clientid).subscribe(
      (creditLines: any[]) => {
        this.allLinesOfCredit = this.mapCreditLinesToTableFormat(creditLines || []);
        this.applyLOCFilter();
      },
      (error) => {
        console.error('Error fetching lines of credit:', error);
        this.allLinesOfCredit = [];
        this.linesOfCredit = [];
      }
    );
  }

  private refreshClientLoanAndSavingsAccounts(): void {
    this.clientService.getClientAccountData(this.clientid).subscribe((data: any) => {
      this.clientAccountData = data;
      this.savingAccounts = data.savingsAccounts;
      this.loanAccounts = data.loanAccounts;
      this.shareAccounts = data.shareAccounts;
    });
  }

  mapCreditLinesToTableFormat(raw: any[]): any[] {
    return raw
      .map((item) => {
        // Support both legacy shape (fields at root) and new shape { lineOfCredit, loans }
        const loc = item?.lineOfCredit ? item.lineOfCredit : item;
        const loansFromPayload = item?.loans; // already associated loans if provided
        if (!loc) {
          return null;
        }
        const maximumAmount = loc.maximumAmount || 0;
        const blockedAmount = loc.blockedAmount || 0;
        // For legacy fallback when loans not provided, derive from loanAccounts
        const associatedLoans =
          Array.isArray(loansFromPayload) && loansFromPayload.length
            ? loansFromPayload.map((l) => ({
                id: l.id,
                accountNo: l.accountNo,
                productName: l.productName,
                originalLoan: l.originalLoan || l.principal,
                principalOutstanding: l.principalOutstanding ?? l.additionalProperties?.principalOutstanding ?? null,
                numberOfRepayments: l.numberOfRepayments,
                loanBalance: l.loanBalance,
                amountPaid: l.amountPaid,
                inArrears: l.inArrears,
                status: l.status,
                additionalProperties: l.additionalProperties,
                timeline: l.timeline,
                // Preserve LOC-specific loan fields from API
                invoiceNumber: l.invoiceNumber,
                supplierBuyerName: l.supplierBuyerName,
                totalOverPaidDerived: l.totalOverPaidDerived
              }))
            : this.getLoansForLOC(loc.id);

        // Limit, utilisation and available balance are authoritative from the backend LOC summary and are NOT
        // recomputed on the client. The previous payable re-derivation summed a per-loan `principalOutstanding`
        // field that the API does not send, so it always evaluated to 0 — forcing utilisation to 0% and the
        // available balance to the full credit limit even while drawdowns were outstanding.
        const consumedAmount = loc.consumedAmount ?? 0;
        const availableBalance = loc.availableBalance ?? 0;
        const utilization = loc.utilizationPercentage ?? 0;

        // Normalize status: backend supplies loc.status {id, code, value} where code expected as status.active|inactive|suspended|closed
        const rawStatus = loc.status || loc.activationStatus || {};
        const normalizedStatusCode = typeof rawStatus === 'string' ? rawStatus : (rawStatus.code || '').toLowerCase();
        const normalizedValue =
          typeof rawStatus === 'string' ? rawStatus : rawStatus.value || rawStatus.code || 'Inactive';
        // fallback mapping if backend used legacy numeric ids
        const legacyId = typeof rawStatus === 'object' ? rawStatus.id : undefined;
        let inferredCode = normalizedStatusCode;
        if (!inferredCode && legacyId) {
          switch (legacyId) {
            case 200:
              inferredCode = 'status.active';
              break;
            case 300:
              inferredCode = 'status.inactive';
              break;
            case 400:
              inferredCode = 'status.suspended';
              break;
            case 500:
              inferredCode = 'status.closed';
              break;
            default:
              inferredCode = 'status.inactive';
          }
        }
        if (!inferredCode) {
          // try to infer from value text
          const lowerVal = (normalizedValue || '').toLowerCase();
          if (lowerVal.includes('active')) inferredCode = 'status.active';
          else if (lowerVal.includes('suspend')) inferredCode = 'status.suspended';
          else if (lowerVal.includes('close')) inferredCode = 'status.closed';
          else inferredCode = 'status.inactive';
        }
        const displayValue = normalizedValue;

        return {
          id: loc.id,
          externalId: loc.externalId || loc.name || loc.accountNumber || `LOC-${loc.id}`,
          name: loc.name,
          accountNo: loc.accountNumber || loc.externalId || `LOC-${loc.id}`,
          creditLimit: maximumAmount,
          blockedAmount,
          availableBalance,
          outstanding: consumedAmount,
          type:
            (loc.productType || '').toLowerCase() === 'payable' || loc.productType === 'PAYABLE'
              ? 'Payable'
              : 'Receivable',
          utilization,
          // status / activationStatus backward compatibility
          status: displayValue,
          statusCode: inferredCode,
          currency: loc.currency,
          clientCompanyName: loc.clientCompanyName,
          clientContactPersonName: loc.clientContactPersonName,
          clientContactPersonPhone: loc.clientContactPersonPhone,
          clientContactPersonEmail: loc.clientContactPersonEmail,
          authorizedSignatoryName: loc.authorizedSignatoryName,
          authorizedSignatoryPhone: loc.authorizedSignatoryPhone,
          authorizedSignatoryEmail: loc.authorizedSignatoryEmail,
          va: loc.va,
          specialConditions: loc.specialConditions,
          // Preserve an immutable copy of original loans for filtering toggles
          originalLoans: associatedLoans,
          loans: associatedLoans
        };
      })
      .filter((x) => !!x);
  }

  getLoansForLOC(locId: number): any[] {
    // Filter loan accounts that belong to this LOC
    // This assumes loans have a creditLineId or similar field
    // Adjust based on your actual data structure
    if (!this.loanAccounts) {
      return [];
    }

    return this.loanAccounts
      .filter((loan: any) => loan.creditLineId === locId || loan.locId === locId)
      .map((loan: any) => ({
        id: loan.id,
        accountNo: loan.accountNo,
        productName: loan.productName,
        originalLoan: loan.originalLoan || loan.principal,
        numberOfRepayments: loan.numberOfRepayments,
        loanBalance: loan.loanBalance,
        amountPaid: loan.amountPaid,
        inArrears: loan.inArrears,
        status: loan.status,
        additionalProperties: loan.additionalProperties,
        timeline: loan.timeline,
        invoiceNumber: loan.invoiceNumber,
        supplierBuyerName: loan.supplierBuyerName,
        totalOverPaidDerived: loan.totalOverPaidDerived
      }));
  }

  navigateToLOC(locId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.router.navigate(
      [
        '../',
        'loc',
        locId
      ],
      { relativeTo: this.route }
    );
  }

  toggleLOCInnerLoanRow(loan: any, event: Event): void {
    event.stopPropagation();
    this.expandedLOCLoanElement = this.expandedLOCLoanElement === loan ? null : loan;
  }

  navigateToLoan(loanId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.router.navigate(
      [
        '../',
        'loans-accounts',
        loanId,
        'general'
      ],
      { relativeTo: this.route }
    );
  }

  /**
   * Starts a new drawdown by navigating to loan account creation, passing the LOC id.
   * Adds query params so the loan creation form can pre-select and lock the credit line.
   */
  startNewDrawdown(loc: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const queryParams: any = {
      lineOfCreditId: loc.id,
      lineOfCreditType: loc.type
    };

    this.router.navigate(
      [
        '../',
        'loans-accounts',
        'create'
      ],
      { relativeTo: this.route, queryParams }
    );
  }

  /** Toggle between active (non-closed) and closed LOCs */
  toggleClosedLOCs(): void {
    this.showClosedLOCs = !this.showClosedLOCs;
    this.applyLOCFilter();
  }

  /** Toggle between active and closed loans inside Line of Credit expanded rows */
  toggleClosedLOCLoans(): void {
    this.showClosedLOCLoans = !this.showClosedLOCLoans;
    this.applyLOCLoansFilter();
  }

  /** Apply current LOC filter based on showClosedLOCs flag */
  private applyLOCFilter(): void {
    if (this.showClosedLOCs) {
      this.linesOfCredit = this.allLinesOfCredit.filter((loc) => loc.statusCode === 'status.closed');
    } else {
      this.linesOfCredit = this.allLinesOfCredit.filter((loc) => loc.statusCode !== 'status.closed');
    }
    // After LOC filtering also re-apply loan level filtering
    this.applyLOCLoansFilter();
  }

  /** Apply filtering of loans inside each LOC based on showClosedLOCLoans flag */
  private applyLOCLoansFilter(): void {
    this.linesOfCredit.forEach((loc) => {
      const sourceLoc = this.allLinesOfCredit.find((l) => l.id === loc.id) || loc;
      const originalLoans = sourceLoc.originalLoans || sourceLoc.loans || [];
      const filtered = originalLoans.filter((loan: any) =>
        this.showClosedLOCLoans ? this.isLoanClosed(loan) : !this.isLoanClosed(loan)
      );
      loc.loans = filtered;
    });
    // If currently expanded loan row became filtered out, clear it so UI doesn't collapse unexpectedly
    if (
      this.expandedLOCLoanElement &&
      !this.linesOfCredit.some((loc) => loc.loans.includes(this.expandedLOCLoanElement))
    ) {
      this.expandedLOCLoanElement = null;
    }
  }

  /** Returns true if the loan product is RBF */
  isRBFLoan(element: any): boolean {
    return (element?.productName || '').toUpperCase() === 'RBF';
  }

  /** Returns repayment percentage (0-100) for a loan */
  getRBFRepaymentPercent(element: any): number {
    const total = element?.originalLoan || 0;
    const paid = element?.amountPaid || 0;
    if (!total) return 0;
    return Math.min(Math.round((paid / total) * 10000) / 100, 100);
  }

  /** Returns EMI-count repayment progress for the RBF expanded loan row. */
  getRBFRepaymentInstallmentProgressLabel(element: any): string {
    return `${this.getRBFPaidInstallmentCount(element)}/${this.getRBFTotalInstallmentCount(element)} paid`;
  }

  /** Fully settled EMI count. Partial payments do not increment this count. */
  private getRBFPaidInstallmentCount(element: any): number {
    const periods = this.getRepaymentScheduleInstallmentPeriods(element);
    if (periods.length > 0) {
      return periods.filter((period: any) => this.isRepaymentScheduleInstallmentFullySettled(period)).length;
    }

    const summaryPaidCount = element?.additionalProperties?.paidInstalmentCount;
    return this.toNonNegativeWholeNumber(summaryPaidCount);
  }

  /** Scheduled EMI count, using the schedule when loaded and loan tenure as fallback. */
  private getRBFTotalInstallmentCount(element: any): number {
    const periods = this.getRepaymentScheduleInstallmentPeriods(element);
    if (periods.length > 0) {
      return periods.length;
    }

    return this.toNonNegativeWholeNumber(
      element?.numberOfRepayments ?? element?.additionalProperties?.totalInstalmentCount
    );
  }

  private getRepaymentScheduleInstallmentPeriods(element: any): any[] {
    const periods = element?.repaymentSchedule?.periods;
    if (!Array.isArray(periods)) {
      return [];
    }

    return periods.filter((period: any) => {
      if (
        !period ||
        period.downPaymentPeriod ||
        period.isAdditional ||
        this.isRepaymentScheduleDisbursementRow(period)
      ) {
        return false;
      }
      const periodNumber = Number(period.period);
      if (!periodNumber || periodNumber < 1) {
        return false;
      }
      const dueAmount = Number(period.totalDueForPeriod ?? this.sumPrincipalInterestFeesForPeriod(period) ?? 0);
      return dueAmount > 0;
    });
  }

  private isRepaymentScheduleInstallmentFullySettled(period: any): boolean {
    if (period?.complete === true || period?.obligationsMetOnDate) {
      return true;
    }

    const dueAmount = Number(period?.totalDueForPeriod ?? this.sumPrincipalInterestFeesForPeriod(period) ?? 0);
    const paidAmount = Number(period?.totalPaidForPeriod ?? 0);
    return dueAmount > 0 && paidAmount >= dueAmount;
  }

  private toNonNegativeWholeNumber(value: any): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
      return 0;
    }
    return Math.floor(numberValue);
  }

  /** Determine if a loan is closed based on status code (reuse existing logic from AccountsFilterPipe) */
  private isLoanClosed(loan: any): boolean {
    if (!loan?.status?.code) return false;
    return (
      loan.status.code === 'loanStatusType.closed.written.off' ||
      loan.status.code === 'loanStatusType.closed.obligations.met' ||
      loan.status.code === 'loanStatusType.closed.reschedule.outstanding.amount' ||
      loan.status.code === 'loanStatusType.withdrawn.by.client' ||
      loan.status.code === 'loanStatusType.rejected'
    );
  }

  getApprovedAmount(loan: any, lineOfCredit: any): number {
    const productType = lineOfCredit?.type?.toUpperCase() ?? '';
    return productType === 'RECEIVABLE'
      ? loan?.additionalProperties?.approvedReceivableAmount
      : loan?.additionalProperties?.approvedPayableAmount;
  }

  /** Resolve interest rate from common backend field variants */
  getLoanInterestRate(element: any): number | null {
    const candidate =
      element?.annualInterestRate ??
      element?.additionalProperties?.annualInterestRate ??
      element?.nominalAnnualInterestRate ??
      element?.nominalInterestRatePerPeriod ??
      element?.interestRatePerPeriod;

    return candidate != null && !Number.isNaN(Number(candidate)) ? Number(candidate) : null;
  }

  /**
   * Next EMI aligned with repayment schedule tab (EMI Amount / Due Payment column uses totalDueForPeriod).
   * Skips disbursement / fee-at-disbursement rows (often ~fee total e.g. 2110 vs real EMI ~17586).
   */
  getNextEMIWithoutCharges(element: any): number | null {
    const periods = element?.repaymentSchedule?.periods;
    if (Array.isArray(periods) && periods.length > 0) {
      const nextPeriod = this.pickNextRepaymentScheduleInstallmentPeriod(periods);
      if (nextPeriod) {
        const td =
          nextPeriod.totalDueForPeriod ?? nextPeriod.emiAmount ?? this.sumPrincipalInterestFeesForPeriod(nextPeriod);
        if (td != null && !Number.isNaN(Number(td))) {
          const n = Number(td);
          if (n > 0) {
            return n;
          }
        }
      }
      // Schedule present but no instalment resolved — do not fall back to client-summary EMI (often fee/disbursement-derived).
      return null;
    }

    const fromSummary = element?.additionalProperties?.effectiveInstallmentAmount;
    if (fromSummary != null && !Number.isNaN(Number(fromSummary))) {
      const n = Number(fromSummary);
      if (n > 0) {
        return n;
      }
    }

    const fixedEmi = element?.fixedEmiAmount;
    if (fixedEmi != null && !Number.isNaN(Number(fixedEmi)) && Number(fixedEmi) > 0) {
      return Number(fixedEmi);
    }

    return null;
  }

  /**
   * Disbursement row / tranche fee row — not a recurring EMI (matches repayment-schedule-tab disbursement logic).
   */
  private isRepaymentScheduleDisbursementRow(p: any): boolean {
    if (!p) {
      return true;
    }
    const st = String(p.status ?? '').toUpperCase();
    if (st === 'DISBURSEMENT') {
      return true;
    }
    const periodNum = Number(p.period);
    if (periodNum === 0) {
      return true;
    }
    const principalDisbursed = Number(p.principalDisbursed ?? 0);
    if (principalDisbursed > 0) {
      return true;
    }
    return false;
  }

  /**
   * Next real instalment: exclude disbursement rows; prefer SCHEDULED; then earliest incomplete by period #.
   */
  private pickNextRepaymentScheduleInstallmentPeriod(periods: any[]): any | null {
    const candidates = periods.filter((p: any) => {
      if (!p || p.complete || p.downPaymentPeriod) {
        return false;
      }
      if (this.isRepaymentScheduleDisbursementRow(p)) {
        return false;
      }
      return true;
    });
    if (!candidates.length) {
      return null;
    }
    const scheduled = candidates.find((p: any) => String(p.status ?? '').toUpperCase() === 'SCHEDULED');
    if (scheduled) {
      return scheduled;
    }
    return [...candidates].sort((a: any, b: any) => (Number(a.period) || 0) - (Number(b.period) || 0))[0];
  }

  private sumPrincipalInterestFeesForPeriod(p: any): number | null {
    const principal = Number(p.principalDue ?? 0);
    const interest = Number(p.interestDue ?? 0);
    const fees = Number(p.feeChargesDue ?? 0) + Number(p.penaltyChargesDue ?? 0) + Number(p.taxChargesDue ?? 0);
    const sum = principal + interest + fees;
    return sum > 0 ? sum : null;
  }

  // ========== Bulk Disbursement Selection Methods ==========

  /** Get or create selection model for a specific LOC */
  getSelectionForLOC(locId: number): SelectionModel<any> {
    if (!this.locLoanSelections.has(locId)) {
      this.locLoanSelections.set(locId, new SelectionModel<any>(true, []));
    }
    return this.locLoanSelections.get(locId)!;
  }

  /** Check if a loan is selectable (approved and waiting for disbursal) */
  isLoanSelectable(loan: any): boolean {
    if (!loan?.status) return false;
    const status = loan.status;
    // A loan is selectable if it's approved and waiting for disbursal
    // Exclude pending approval, active (already disbursed), overpaid, closed statuses
    return (
      status.waitingForDisbursal === true ||
      (!status.pendingApproval && !status.active && !status.overpaid && !status.closed && status.approved)
    );
  }

  /** Check if all selectable loans in a LOC are selected */
  isAllSelectedForLOC(loc: any): boolean {
    const selection = this.getSelectionForLOC(loc.id);
    const selectableLoans = (loc.loans || []).filter((loan: any) => this.isLoanSelectable(loan));
    return selectableLoans.length > 0 && selectableLoans.every((loan: any) => selection.isSelected(loan));
  }

  /** Check if some (but not all) selectable loans are selected */
  isSomeSelectedForLOC(loc: any): boolean {
    const selection = this.getSelectionForLOC(loc.id);
    const selectableLoans = (loc.loans || []).filter((loan: any) => this.isLoanSelectable(loan));
    const selectedCount = selectableLoans.filter((loan: any) => selection.isSelected(loan)).length;
    return selectedCount > 0 && selectedCount < selectableLoans.length;
  }

  /** Toggle all selectable loans selection for a LOC */
  masterToggleForLOC(loc: any): void {
    const selection = this.getSelectionForLOC(loc.id);
    const selectableLoans = (loc.loans || []).filter((loan: any) => this.isLoanSelectable(loan));
    if (this.isAllSelectedForLOC(loc)) {
      selection.clear();
    } else {
      selectableLoans.forEach((loan: any) => selection.select(loan));
    }
  }

  /** Toggle individual loan selection */
  toggleLoanSelection(loc: any, loan: any): void {
    const selection = this.getSelectionForLOC(loc.id);
    selection.toggle(loan);
  }

  /** Check if a loan is selected */
  isLoanSelected(loc: any, loan: any): boolean {
    const selection = this.getSelectionForLOC(loc.id);
    return selection.isSelected(loan);
  }

  /** Check if a LOC has any selectable loans */
  hasSelectableLoansForLOC(loc: any): boolean {
    return (loc.loans || []).some((loan: any) => this.isLoanSelectable(loan));
  }

  /** Get count of selected loans for a LOC */
  getSelectedCountForLOC(loc: any): number {
    const selection = this.getSelectionForLOC(loc.id);
    return selection.selected.length;
  }

  /** Check if bulk disburse mode is active for a LOC */
  isBulkModeActiveForLOC(locId: number): boolean {
    return this.locBulkDisburseMode.get(locId) || false;
  }

  /** Toggle bulk disburse mode for a LOC */
  toggleBulkDisburseModeForLOC(loc: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const currentMode = this.locBulkDisburseMode.get(loc.id) || false;
    this.locBulkDisburseMode.set(loc.id, !currentMode);

    // Clear selection when exiting bulk mode
    if (currentMode) {
      const selection = this.getSelectionForLOC(loc.id);
      selection.clear();
    }
  }

  /** Open bulk disburse dialog for a LOC */
  openBulkDisburseDialogForLOC(loc: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    const selection = this.getSelectionForLOC(loc.id);
    const selectedLoans = selection.selected;

    if (selectedLoans.length === 0) {
      return;
    }

    const dialogData: BulkDisburseDialogData = {
      clientId: this.clientid,
      locId: loc.id,
      locCurrency: loc.currency?.code || 'USD',
      locType: loc.type, // 'Receivable' or 'Payable'
      selectedLoans: selectedLoans
    };

    const dialogRef = this.dialog.open(BulkDisburseDialogComponent, {
      width: '700px',
      data: dialogData,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.action === 'disburse' && result?.payload) {
        // Execute the bulk disbursement
        this.executeBulkDisburseForLOC(loc, result.payload, selection);
      }
    });
  }

  /**
   * Execute bulk disbursement for a LOC and show results
   */
  private executeBulkDisburseForLOC(loc: any, payload: any, selection: SelectionModel<any>): void {
    // Show loading dialog
    const loadingDialogRef = this.dialog.open(BulkDisburseLoadingDialogComponent, {
      width: '350px',
      disableClose: true,
      panelClass: 'loading-dialog-panel'
    });

    this.clientService.bulkDisburseLOCLoans(this.clientid.toString(), loc.id.toString(), payload).subscribe({
      next: (response: BulkLoanDisbursementResponse) => {
        loadingDialogRef.close();

        // Show results dialog
        const resultsData: BulkDisburseResultsDialogData = {
          response: response,
          locCurrency: loc.currency?.code || 'AED'
        };

        this.dialog.open(BulkDisburseResultsDialogComponent, {
          width: '700px',
          data: resultsData
        });

        // Clear selection
        selection.clear();

        // Exit bulk mode for this LOC
        this.locBulkDisburseMode.set(loc.id, false);

        // Refresh LOC data to get updated loan statuses
        this.refreshLOCData();
      },
      error: (error) => {
        loadingDialogRef.close();
        console.error('Bulk disbursement failed:', error);
        // Refresh to show current state
        this.refreshLOCData();
      }
    });
  }

  /** Refresh LOC data after bulk disbursement */
  private refreshLOCData(): void {
    this.clientService.getClientCreditLines(this.clientid).subscribe(
      (creditLines: any[]) => {
        this.allLinesOfCredit = this.mapCreditLinesToTableFormat(creditLines || []);
        this.applyLOCFilter();
        // Clear all selections and bulk mode states after refresh
        this.locLoanSelections.clear();
        this.locBulkDisburseMode.clear();
      },
      (error) => {
        console.error('Error refreshing lines of credit:', error);
      }
    );
  }
}
