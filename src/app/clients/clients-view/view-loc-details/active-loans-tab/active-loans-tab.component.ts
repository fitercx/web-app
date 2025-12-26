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
    'Loan Account',
    'Loan Amount',
    'Outstanding Balance',
    'Amount Paid',
    'Actions'
  ];
  loanAccounts: MatTableDataSource<any>;
  totalRecords = 0;
  locCurrency: string = '';

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
    this.loadLocCurrencyFromResolver();
    this.getLoans();
  }

  private loadLocCurrencyFromResolver(): void {
    // Get LOC data from parent component's resolver instead of making another API call
    const locData = this.route.parent.snapshot.data['locData'];
    if (locData) {
      this.locCurrency = locData.currency || '';
    }
  }

  getLoans() {
    const offset = this.paginator ? this.paginator.pageIndex * this.paginator.pageSize : 0;
    const limit = this.paginator ? this.paginator.pageSize : 10;
    this.clientsService
      .getLoans(this.clientId.toString(), this.locId.toString(), offset, limit)
      .subscribe((data: any) => {
        if (data.pageItems) {
          this.loanAccounts.data = data.pageItems;
          this.totalRecords = data.totalFilteredRecords;
        }
      });
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
