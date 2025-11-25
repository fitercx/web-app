/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { animate, state, style, transition, trigger } from '@angular/animations';

/** Custom Services. */
import { ClientsService } from 'app/clients/clients.service';

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
    'Available Balance',
    'Type',
    'Outstanding/Utilization',
    'Actions',
    'expand'
  ];

  locLoanColumns: string[] = [
    'Account No',
    'Invoice Number',
    'Supplier/Buyer Name',
    'Loan Product',
    'Disbursed Amount',
    'Outstanding Balance',
    'Amount Paid',
    'Refund Amount',
    'Actions',
    'expand'
  ];

  /** Columns actually displayed for inner LOC loans depending on toggle (hide Refund/Actions for closed loans view) */
  get displayedLocLoanColumns(): string[] {
    if (this.showClosedLOCLoans) {
      return this.locLoanColumns.filter((c) => c !== 'Refund Amount' && c !== 'Actions');
    }
    return this.locLoanColumns;
  }

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
   */
  constructor(
    private route: ActivatedRoute,
    private clientService: ClientsService,
    private router: Router
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
    const queryParams: any = { lineOfCreditId: loc.id };
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
}
