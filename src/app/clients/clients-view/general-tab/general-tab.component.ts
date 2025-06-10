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
}
