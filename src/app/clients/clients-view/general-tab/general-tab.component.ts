/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { SelectionModel } from '@angular/cdk/collections';
import { MatDialog } from '@angular/material/dialog';

/** Custom Services. */
import { ClientsService, BulkLoanDisbursementResponse } from 'app/clients/clients.service';
import {
  BulkDisburseDialogComponent,
  BulkDisburseDialogData
} from '../view-loc-details/active-loans-tab/bulk-disburse-dialog/bulk-disburse-dialog.component';
import {
  BulkDisburseResultsDialogComponent,
  BulkDisburseResultsDialogData
} from '../view-loc-details/active-loans-tab/bulk-disburse-results-dialog/bulk-disburse-results-dialog.component';
import { BulkDisburseLoadingDialogComponent } from '../view-loc-details/active-loans-tab/bulk-disburse-loading-dialog/bulk-disburse-loading-dialog.component';

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

  /**
   * @param {ActivatedRoute} route Activated Route
   * @param {ClientsService} clientService Clients Service
   * @param {Router} router Router
   * @param {MatDialog} dialog Material Dialog
   */
  constructor(
    private route: ActivatedRoute,
    private clientService: ClientsService,
    private router: Router,
    private dialog: MatDialog
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

  // Add this method
  toggleRow(element: any, event: Event): void {
    event.stopPropagation();
    this.expandedElement = this.expandedElement === element ? null : element;
  }

  toggleLOCRow(element: any, event: Event): void {
    event.stopPropagation();
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
        const consumedAmount = loc.consumedAmount || 0;
        const utilization = maximumAmount > 0 ? Math.round((consumedAmount / maximumAmount) * 100) : 0;
        // For legacy fallback when loans not provided, derive from loanAccounts
        const associatedLoans =
          Array.isArray(loansFromPayload) && loansFromPayload.length
            ? loansFromPayload.map((l) => ({
                id: l.id,
                accountNo: l.accountNo,
                productName: l.productName,
                originalLoan: l.originalLoan || l.principal,
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
          availableBalance: loc.availableBalance,
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
