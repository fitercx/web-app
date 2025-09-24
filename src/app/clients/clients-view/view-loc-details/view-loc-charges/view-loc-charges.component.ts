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
    'dueDate',
    'amount',
    'amountPaid',
    'amountWaived',
    'amountOutstanding',
    'status',
    'actions'
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
    this.loadLocStatus();
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

  loadLocStatus(): void {
    const locId = this.route.parent?.snapshot.paramMap.get('locId');
    const clientId = this.route.parent?.parent?.snapshot.paramMap.get('clientId');

    if (clientId && locId) {
      this.clientsService.getClientCreditLine(clientId, locId).subscribe((locData: any) => {
        this.locStatus = locData.status;
        this.locCurrency = locData?.currency || '';
      });
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

  canDeleteCharge(): boolean {
    return this.locStatus === 'SUBMITTED' || this.locStatus === 'DRAFT';
  }

  deleteCharge(chargeId: number): void {
    if (confirm('Are you sure you want to delete this charge?')) {
      const locId = this.route.parent?.snapshot.paramMap.get('locId');
      const clientId = this.route.parent?.parent?.snapshot.paramMap.get('clientId');

      if (clientId && locId) {
        this.clientsService.deleteLocCharge(clientId, locId, chargeId).subscribe(
          () => {
            this.fetchCharges(0, this.pageSize);
          },
          (error) => {
            console.error('Error deleting charge:', error);
          }
        );
      }
    }
  }

  parseDate(dateArray: any): Date | null {
    if (Array.isArray(dateArray) && dateArray.length >= 3) {
      return new Date(dateArray[0], dateArray[1] - 1, dateArray[2]);
    }
    return dateArray ? new Date(dateArray) : null;
  }
}
