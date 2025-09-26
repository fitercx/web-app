import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ClientsService } from 'app/clients/clients.service';

@Component({
  selector: 'mifosx-transaction-history-tab',
  templateUrl: './transaction-history-tab.component.html',
  styleUrls: ['./transaction-history-tab.component.scss']
})
export class TransactionHistoryTabComponent implements OnInit {
  dataSource: MatTableDataSource<any>;
  displayedColumns: string[] = [
    'transactionDate',
    'transactionType',
    'description',
    'amount',
    'balanceBefore',
    'balanceAfter'
  ];
  totalRecords = 0;
  pageSize = 20;
  locCurrency: string = '';

  @ViewChild(MatPaginator) paginator: MatPaginator;

  constructor(
    private route: ActivatedRoute,
    private clientsService: ClientsService
  ) {}

  ngOnInit(): void {
    this.loadLocCurrencyFromResolver();
    this.fetchTransactions(0, this.pageSize);
  }

  private loadLocCurrencyFromResolver(): void {
    // Get LOC data from parent component's resolver instead of making another API call
    const locData = this.route.parent?.snapshot.data['locData'];
    if (locData) {
      this.locCurrency = locData.currency || '';
    }
  }

  fetchTransactions(offset: number, limit: number): void {
    const locId = this.route.parent?.snapshot.paramMap.get('locId');
    const clientId = this.route.parent?.parent?.snapshot.paramMap.get('clientId');

    if (clientId && locId) {
      this.clientsService.getCreditLineTransactions(clientId, locId, offset, limit).subscribe((data: any) => {
        this.dataSource = new MatTableDataSource(data.content);
        this.totalRecords = data.total;
      });
    }
  }

  onPageChange(event: PageEvent): void {
    this.fetchTransactions(event.pageIndex, event.pageSize);
  }
}
