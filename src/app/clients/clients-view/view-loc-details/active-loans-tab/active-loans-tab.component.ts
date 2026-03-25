import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientsService, BulkLoanDisbursementResponse } from 'app/clients/clients.service';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { SelectionModel } from '@angular/cdk/collections';
import { MatDialog } from '@angular/material/dialog';
import {
  BulkDisburseDialogComponent,
  BulkDisburseDialogData
} from './bulk-disburse-dialog/bulk-disburse-dialog.component';
import {
  BulkDisburseResultsDialogComponent,
  BulkDisburseResultsDialogData
} from './bulk-disburse-results-dialog/bulk-disburse-results-dialog.component';
import { BulkDisburseLoadingDialogComponent } from './bulk-disburse-loading-dialog/bulk-disburse-loading-dialog.component';

@Component({
  selector: 'mifosx-active-loans-tab',
  templateUrl: './active-loans-tab.component.html',
  styleUrls: ['./active-loans-tab.component.scss'],
  animations: []
})
export class ActiveLoansTabComponent implements OnInit {
  /** Base columns without select */
  private baseColumns: string[] = [
    'Account No',
    'Invoice Number',
    'Supplier/Buyer Name',
    'Disbursed Amount',
    'Outstanding Balance',
    'Amount Paid',
    'Refund Amount',
    'Actions'
  ];

  /** Displayed columns - dynamically includes 'select' when bulk mode is active */
  get displayedColumns(): string[] {
    if (this.isBulkDisburseMode) {
      return [
        'select',
        ...this.baseColumns
      ];
    }
    return this.baseColumns;
  }

  loanAccounts: MatTableDataSource<any>;
  totalRecords = 0;
  locCurrency: string = '';
  private locData: any;
  private extrasById: Map<number, any> = new Map<number, any>();

  /** Selection model for bulk operations */
  selection = new SelectionModel<any>(true, []);

  /** Whether bulk disburse mode is active */
  isBulkDisburseMode = false;

  /** Whether bulk disburse is in progress */
  isBulkDisburseInProgress = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;

  private locId: number;
  clientId: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientsService: ClientsService,
    private dialog: MatDialog
  ) {
    this.clientId = this.route.parent.snapshot.params['clientId'];
    this.locId = this.route.parent.snapshot.params['locId'];
  }

  ngOnInit(): void {
    this.loanAccounts = new MatTableDataSource([]);
    this.loadLocContextFromResolver();
    this.getLoans();
  }

  private loadLocContextFromResolver(): void {
    // Cache LOC resolver data and build extras map once
    this.locData = this.route.parent.snapshot.data['locData'] || {};
    if (this.locData) {
      this.locCurrency = this.locData.currency || '';
      const resolverLoans: any[] = Array.isArray(this.locData.activeLoansList)
        ? this.locData.activeLoansList
        : Array.isArray(this.locData.activeLoans)
          ? this.locData.activeLoans
          : Array.isArray((this.locData as any).loans)
            ? (this.locData as any).loans
            : [];
      this.extrasById = new Map<number, any>(
        resolverLoans.map((l: any) => [
          l.id,
          l
        ])
      );
    }
  }

  getLoans() {
    const offset = this.paginator ? this.paginator.pageIndex * this.paginator.pageSize : 0;
    const limit = this.paginator ? this.paginator.pageSize : 10;
    this.clientsService
      .getLoans(this.clientId.toString(), this.locId.toString(), offset, limit)
      .subscribe((data: any) => {
        if (data.pageItems) {
          // Merge extra LOC-specific fields from resolver data when available
          const merged = data.pageItems.map((item: any) => this.normalizeLoanItem(item, this.extrasById.get(item.id)));

          this.loanAccounts.data = merged;
          this.totalRecords = data.totalFilteredRecords;

          // Clear selection when data changes
          this.selection.clear();

          // Auto-exit bulk mode if no more selectable loans remain
          if (this.isBulkDisburseMode && this.getSelectableLoans().length === 0) {
            this.isBulkDisburseMode = false;
          }
        }
      });
  }

  private normalizeLoanItem(item: any, extra?: any): any {
    const out = { ...item };
    const ap = out.additionalProperties || {};
    const extraAp = extra?.additionalProperties || {};

    if (extra) {
      out.invoiceNumber =
        out.invoiceNumber ?? extra.invoiceNumber ?? extra.invoiceNo ?? ap.invoiceNumber ?? ap.invoiceNo;
      out.supplierBuyerName = out.supplierBuyerName ?? extra.supplierBuyerName ?? ap.supplierBuyerName;
      out.originalLoan = out.originalLoan ?? extra.originalLoan ?? out.principal;
      const refundSource =
        out.totalOverPaidDerived !== undefined
          ? out.totalOverPaidDerived
          : extra.totalOverPaidDerived !== undefined
            ? extra.totalOverPaidDerived
            : out.summary?.totalOverpayment;
      out.totalOverPaidDerived = refundSource;

      // Copy invoice currency related fields from extra or extraAp
      out.invoiceCurrency =
        out.invoiceCurrency ?? extra.invoiceCurrency ?? extraAp.invoiceCurrency ?? ap.invoiceCurrency;
      out.invoiceAmount = out.invoiceAmount ?? extra.invoiceAmount ?? extraAp.invoiceAmount ?? ap.invoiceAmount;
      out.exchangeRate = out.exchangeRate ?? extra.exchangeRate ?? extraAp.exchangeRate ?? ap.exchangeRate;
      out.markup = out.markup ?? extra.markup ?? extraAp.markup ?? ap.markup;
      out.amountInFacilityCurrency =
        out.amountInFacilityCurrency ??
        extra.amountInFacilityCurrency ??
        extraAp.amountInFacilityCurrency ??
        ap.amountInFacilityCurrency;
      out.approvedReceivableAmount =
        out.approvedReceivableAmount ??
        extra.approvedReceivableAmount ??
        extraAp.approvedReceivableAmount ??
        ap.approvedReceivableAmount;
      out.approvedPayableAmount =
        out.approvedPayableAmount ??
        extra.approvedPayableAmount ??
        extraAp.approvedPayableAmount ??
        ap.approvedPayableAmount;
      out.invoiceAmountInAED =
        out.invoiceAmountInAED ?? extra.invoiceAmountInAED ?? extraAp.invoiceAmountInAED ?? ap.invoiceAmountInAED;
    } else {
      out.originalLoan = out.originalLoan ?? out.principal;
      out.invoiceNumber = out.invoiceNumber ?? ap.invoiceNumber ?? ap.invoiceNo;
      out.supplierBuyerName = out.supplierBuyerName ?? ap.supplierBuyerName;
      out.totalOverPaidDerived =
        out.totalOverPaidDerived !== undefined ? out.totalOverPaidDerived : out.summary?.totalOverpayment;

      // Copy invoice currency related fields from additionalProperties
      out.invoiceCurrency = out.invoiceCurrency ?? ap.invoiceCurrency;
      out.invoiceAmount = out.invoiceAmount ?? ap.invoiceAmount;
      out.exchangeRate = out.exchangeRate ?? ap.exchangeRate;
      out.markup = out.markup ?? ap.markup;
      out.amountInFacilityCurrency = out.amountInFacilityCurrency ?? ap.amountInFacilityCurrency;
      out.approvedReceivableAmount = out.approvedReceivableAmount ?? ap.approvedReceivableAmount;
      out.approvedPayableAmount = out.approvedPayableAmount ?? ap.approvedPayableAmount;
      out.invoiceAmountInAED = out.invoiceAmountInAED ?? ap.invoiceAmountInAED;
    }
    // Common fallbacks
    out.amountPaid = out.amountPaid ?? out.summary?.totalRepayment ?? out.summary?.totalRepaymentDerived;
    out.loanProductName = out.loanProductName ?? out.productName;
    return out;
  }

  routeEdit($event: MouseEvent) {
    $event.stopPropagation();
  }

  routeTransferFund(loanId: any) {
    const queryParams: any = { loanId: loanId, accountType: 'fromloans' };
    this.router.navigate(
      [
        '/clients',
        this.clientId,
        'loans-accounts',
        loanId,
        'transfer-funds',
        'make-account-transfer'
      ],
      {
        queryParams: queryParams
      }
    );
  }

  /**
   * Gets the loan balance from the element, checking multiple possible fields.
   * Returns the total outstanding balance (principal + interest + fees).
   * @param element The loan account element
   * @returns The loan balance amount
   */
  private getLoanBalance(element: any): number {
    return element.loanBalance ?? element.summary?.totalOutstanding ?? element.summary?.principalOutstanding ?? 0;
  }

  /**
   * Calculates the outstanding balance for a loan account.
   * Handles overpaid loans and totalOverPaidDerived adjustments.
   * @param element The loan account element
   * @returns The outstanding balance amount
   */
  getOutstandingBalance(element: any): number {
    // If loan is overpaid, show 0
    if (element.status?.overpaid) {
      return 0;
    }

    const loanBalance = this.getLoanBalance(element);

    // If totalOverPaidDerived exists, subtract it from the balance
    if (element.totalOverPaidDerived !== undefined) {
      return loanBalance - element.totalOverPaidDerived;
    }

    return loanBalance;
  }

  // ============= BULK SELECTION METHODS =============

  /**
   * Check if a loan is selectable for bulk disbursement
   * Only loans in "Approved" status (waitingForDisbursal) are selectable
   * This matches the condition for showing individual disburse button
   */
  isSelectable(loan: any): boolean {
    // Check waitingForDisbursal first (if available)
    if (loan.status?.waitingForDisbursal === true) {
      return true;
    }
    // Fallback: match the existing disburse button condition
    // Approved loans are: not pending approval, not active, not overpaid
    const status = loan.status;
    if (!status) {
      return false;
    }
    return !status.pendingApproval && !status.active && !status.overpaid && !status.closed;
  }

  /**
   * Get all selectable (approved) loans from current data
   */
  getSelectableLoans(): any[] {
    return this.loanAccounts.data.filter((loan) => this.isSelectable(loan));
  }

  /**
   * Whether the number of selected elements matches the total number of selectable rows
   */
  isAllSelected(): boolean {
    const selectableLoans = this.getSelectableLoans();
    const numSelected = this.selection.selected.length;
    return selectableLoans.length > 0 && numSelected === selectableLoans.length;
  }

  /**
   * Whether some but not all selectable rows are selected
   */
  isIndeterminate(): boolean {
    const selectableLoans = this.getSelectableLoans();
    const numSelected = this.selection.selected.length;
    return numSelected > 0 && numSelected < selectableLoans.length;
  }

  /**
   * Selects all selectable rows if they are not all selected; otherwise clear selection
   */
  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.getSelectableLoans().forEach((row) => this.selection.select(row));
    }
  }

  /**
   * The label for the checkbox on the passed row
   */
  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row`;
  }

  /**
   * Toggle selection for a single row
   */
  toggleRowSelection(row: any, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isSelectable(row)) {
      this.selection.toggle(row);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selection.clear();
  }

  /**
   * Get the count of selected approved loans
   */
  getSelectedApprovedLoansCount(): number {
    return this.selection.selected.filter((loan) => this.isSelectable(loan)).length;
  }

  /**
   * Calculate total amount of selected loans
   */
  getSelectedTotalAmount(): number {
    return this.selection.selected.reduce((total, loan) => {
      const amount = loan.principal || loan.approvedPrincipal || loan.originalLoan || 0;
      return total + amount;
    }, 0);
  }

  /**
   * Check if there are any selectable loans in the current data
   */
  hasSelectableLoans(): boolean {
    return this.getSelectableLoans().length > 0;
  }

  /**
   * Toggle bulk disburse mode on/off
   */
  toggleBulkDisburseMode(): void {
    this.isBulkDisburseMode = !this.isBulkDisburseMode;
    // Clear selection when exiting bulk mode
    if (!this.isBulkDisburseMode) {
      this.selection.clear();
    }
  }

  /**
   * Exit bulk disburse mode
   */
  exitBulkDisburseMode(): void {
    this.isBulkDisburseMode = false;
    this.selection.clear();
  }

  // ============= BULK DISBURSE METHODS =============

  /**
   * Open the bulk disburse dialog
   */
  openBulkDisburseDialog(): void {
    const selectedApprovedLoans = this.selection.selected.filter((loan) => this.isSelectable(loan));

    if (selectedApprovedLoans.length === 0) {
      return;
    }

    // Determine LOC type from locData
    const locType = this.locData?.productType || this.locData?.type || '';

    const dialogData: BulkDisburseDialogData = {
      clientId: this.clientId,
      locId: this.locId,
      locCurrency: this.locCurrency,
      locType: locType,
      selectedLoans: selectedApprovedLoans
    };

    const dialogRef = this.dialog.open(BulkDisburseDialogComponent, {
      width: '650px',
      disableClose: true,
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.action === 'disburse') {
        this.executeBulkDisburse(result.payload);
      }
    });
  }

  /**
   * Execute the bulk disbursement API call
   */
  private executeBulkDisburse(payload: any): void {
    this.isBulkDisburseInProgress = true;

    // Show loading dialog
    const loadingDialogRef = this.dialog.open(BulkDisburseLoadingDialogComponent, {
      width: '350px',
      disableClose: true,
      panelClass: 'loading-dialog-panel'
    });

    this.clientsService.bulkDisburseLOCLoans(this.clientId.toString(), this.locId.toString(), payload).subscribe({
      next: (response: BulkLoanDisbursementResponse) => {
        this.isBulkDisburseInProgress = false;
        loadingDialogRef.close();
        this.showBulkDisburseResults(response);
        // Refresh the loans list
        this.getLoans();
      },
      error: (error) => {
        this.isBulkDisburseInProgress = false;
        loadingDialogRef.close();
        console.error('Bulk disbursement failed:', error);
        // Could show an error dialog here
        // For now, refresh to show current state
        this.getLoans();
      }
    });
  }

  /**
   * Show the bulk disbursement results dialog
   */
  private showBulkDisburseResults(response: BulkLoanDisbursementResponse): void {
    const dialogData: BulkDisburseResultsDialogData = {
      response,
      locCurrency: this.locCurrency
    };

    this.dialog.open(BulkDisburseResultsDialogComponent, {
      width: '700px',
      disableClose: false,
      data: dialogData
    });
  }
}
