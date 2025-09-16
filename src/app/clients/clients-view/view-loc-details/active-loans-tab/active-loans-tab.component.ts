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

  @ViewChild(MatPaginator) paginator: MatPaginator;

  private locId: number;
  private clientId: number;

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
    this.getLoans();
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
        '../../',
        'loans-accounts',
        loanId,
        'transfer-funds',
        'make-account-transfer'
      ],
      {
        relativeTo: this.route,
        queryParams: queryParams
      }
    );
  }
}
