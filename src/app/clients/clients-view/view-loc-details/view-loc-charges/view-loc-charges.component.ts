import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ClientsService } from '../../../clients.service';

@Component({
  selector: 'mifosx-view-loc-charges',
  templateUrl: './view-loc-charges.component.html',
  styleUrls: ['./view-loc-charges.component.scss']
})
export class ViewLocChargesComponent implements OnInit {
  dataSource: MatTableDataSource<any>;
  displayedColumns: string[] = [
    'chargeDefinitionId',
    'amount',
    'amountPaid',
    'amountWaived',
    'amountOutstanding',
    'status'
  ];
  totalRecords = 0;
  pageSize = 20;
  locStatus: string = '';
  locCurrency: string = '';
  currentPage = 0;
  charges: any[] = [];

  @ViewChild(MatPaginator) paginator: MatPaginator;

  constructor(
    private route: ActivatedRoute,
    private clientsService: ClientsService
  ) {}

  ngOnInit(): void {
    this.fetchCharges(0, this.pageSize);
    this.loadLocStatusFromResolver();
  }

  fetchCharges(offset: number, limit: number): void {
    const locId = this.route.parent?.snapshot.paramMap.get('locId');
    const clientId = this.route.parent?.parent?.snapshot.paramMap.get('clientId');

    if (clientId && locId) {
      this.clientsService.getLocCharges(clientId, locId).subscribe((data: any) => {
        this.charges = data.content || data;
        this.dataSource = new MatTableDataSource(this.charges);
        this.totalRecords = this.charges.length;
      });
    }
  }

  loadLocStatusFromResolver(): void {
    // Get LOC data from parent component's resolver instead of making another API call
    const locData = this.route.parent?.snapshot.data['locData'];
    if (locData) {
      this.locStatus = locData.status?.code || locData.status?.value || locData.status;
      this.locCurrency = locData.currency || '';
    }
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    // Update paginator data source
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.dataSource.data = this.charges.slice(startIndex, endIndex);
  }

  getChargeStatus(charge: any): string {
    if (charge.paid) return 'PAID';
    if (charge.waived) return 'WAIVED';
    if (charge.active) return 'ACTIVE';
    return 'INACTIVE';
  }
}
