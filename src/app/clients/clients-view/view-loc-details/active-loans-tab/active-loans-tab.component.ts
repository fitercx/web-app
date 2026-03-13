import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientsService } from 'app/clients/clients.service';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'mifosx-active-loans-tab',
  templateUrl: './active-loans-tab.component.html',
  styleUrls: ['./active-loans-tab.component.scss'],
  animations: []
})
export class ActiveLoansTabComponent implements OnInit {
  displayedColumns: string[] = [
    'Account No',
    'Invoice Number',
    'Supplier/Buyer Name',
    'Disbursed Amount',
    'Outstanding Balance',
    'Amount Paid',
    'Refund Amount',
    'Actions'
  ];
  loanAccounts: MatTableDataSource<any>;
  totalRecords = 0;
  locCurrency: string = '';
  private locData: any;
  private extrasById: Map<number, any> = new Map<number, any>();

  @ViewChild(MatPaginator) paginator: MatPaginator;

  private locId: number;
  clientId: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientsService: ClientsService
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
        }
      });
  }

  private normalizeLoanItem(item: any, extra?: any): any {
    const out = { ...item };
    const ap = out.additionalProperties || {};

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
    } else {
      out.originalLoan = out.originalLoan ?? out.principal;
      out.invoiceNumber = out.invoiceNumber ?? ap.invoiceNumber ?? ap.invoiceNo;
      out.supplierBuyerName = out.supplierBuyerName ?? ap.supplierBuyerName;
      out.totalOverPaidDerived =
        out.totalOverPaidDerived !== undefined ? out.totalOverPaidDerived : out.summary?.totalOverpayment;
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
}
