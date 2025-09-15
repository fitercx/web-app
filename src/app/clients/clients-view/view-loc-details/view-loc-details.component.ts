/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';

/** Custom Services */
import { ClientsService } from '../../clients.service';
import { SettingsService } from 'app/settings/settings.service';

/**
 * View LOC Details component.
 */
@Component({
  selector: 'mifosx-view-loc-details',
  templateUrl: './view-loc-details.component.html',
  styleUrls: ['./view-loc-details.component.scss']
})
export class ViewLocDetailsComponent implements OnInit {
  clientId: string;
  locId: string;
  clientName: string = 'John Doe'; // Mocked client name
  locDetails: any;
  activeLoans: any[] = [];
  transactionHistory: any[] = [];
  displayedColumns: string[] = [
    'loanId',
    'disbursedDate',
    'loanAmount',
    'outstanding',
    'nextPayment',
    'status',
    'actions'
  ];
  dateFormat: string = 'yyyy-MM-dd';
  locale: string = 'en';

  /**
   * Utility: accept backend date arrays [YYYY, M, D] or ISO strings and return a Date
   */
  private parseDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    if (Array.isArray(value) && value.length >= 3) {
      // backend uses 1-based months in arrays
      const [
        y,
        m,
        d
      ] = value;
      return new Date(y, (m as number) - 1, d);
    }
    try {
      const dt = new Date(value);
      return isNaN(dt.getTime()) ? null : dt;
    } catch (e) {
      return null;
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private clientsService: ClientsService,
    private settingsService: SettingsService
  ) {
    this.clientId = this.route.parent?.snapshot.paramMap.get('clientId') || '';
    this.locId = this.route.snapshot.paramMap.get('locId') || '';
  }

  ngOnInit() {
    // Prefer fetching real LOC details from backend; fallback to mock if service not available
    try {
      this.dateFormat = this.settingsService.dateFormat || this.dateFormat;
      this.locale = this.settingsService.language?.code || this.settingsService.languageCode || this.locale;
    } catch (e) {
      // ignore
    }

    const resolved = this.route.snapshot.data['locData'] || this.route.parent?.snapshot.data['locData'];
    if (resolved) {
      this.processLocData(resolved);
    } else if (this.clientsService && this.locId) {
      this.clientsService.getClientCreditLine(this.clientId, this.locId).subscribe(
        (data: any) => {
          this.processLocData(data);
        },
        (err) => {
          // fallback to mock if backend returns error
          console.warn('Failed to load LOC from API, using mock', err);
          this.fetchLocDetails(this.locId);
        }
      );
    } else {
      this.fetchLocDetails(this.locId);
    }
  }

  /**
   * Process LOC data from backend
   */
  private processLocData(data: any): void {
    this.locDetails = {
      id: data.id || data.creditLineId || this.locId,
      externalId: data.externalId || data.externalID || null,
      name: data.name || data.productName || data.displayName,
      type: data.productType
        ? data.productType === 'payable'
          ? 'LOC PAYABLE'
          : 'LOC RECEIVABLE'
        : data.productType || 'LOC',
      status: (data.status && (data.status.value || data.status)) || data.activationStatus?.value || 'ACTIVE',
      activationDate: this.parseDate(data.startDate) || this.parseDate(data.activationDate),
      nextReviewDate: this.parseDate(data.interimReviewDate) || this.parseDate(data.nextReviewDate),
      interestRate: data.interestRateOverride || data.interestRate || null,
      creditLimit: data.maximumAmount || data.maxCreditLimit || null,
      availableBalance: data.availableBalance || null,
      outstanding: data.outstanding || data.consumedAmount || null,
      activeLoans: data.activeLoans || 0,
      totalRepaid: data.totalRepaid || null,
      utilization: data.utilization || this.calculateUtilization(data),
      avgUtilization: data.avgUtilization || null,
      performance: data.performance || null,
      charges: data.charges || [],
      currency: data.currency || data.currencyCode || null,
      clientCompanyName: data.clientCompanyName || null,
      clientContactPersonName: data.clientContactPersonName || null,
      clientContactPersonPhone: data.clientContactPersonPhone || null,
      clientContactPersonEmail: data.clientContactPersonEmail || null,
      authorizedSignatoryName: data.authorizedSignatoryName || null,
      authorizedSignatoryPhone: data.authorizedSignatoryPhone || null,
      authorizedSignatoryEmail: data.authorizedSignatoryEmail || null,
      va: data.va || null,
      specialConditions: data.specialConditions || null,
      createdDate: this.parseDate(data.createdDate),
      lastModifiedDate: this.parseDate(data.lastModifiedDate)
    };

    this.activeLoans = data.activeLoansList || [];
    this.transactionHistory = data.transactionHistory || [];

    // Fetch client name if available
    if (data.clientName) {
      this.clientName = data.clientName;
    }
  }

  /**
   * Calculate utilization percentage
   */
  private calculateUtilization(data: any): number {
    if (data.maximumAmount && data.consumedAmount) {
      return Math.round((data.consumedAmount / data.maximumAmount) * 100);
    }
    return 0;
  }

  /**
   * Check if LOC is active
   */
  isActive(): boolean {
    return this.locDetails?.status === 'ACTIVE';
  }

  /**
   * Handle actions from menu
   */
  doAction(action: string): void {
    switch (action) {
      case 'Edit':
        this.router.navigate(['edit'], { relativeTo: this.route });
        break;
      case 'New Drawdown':
        this.router.navigate(['new-drawdown'], { relativeTo: this.route });
        break;
      case 'Deactivate':
        this.confirmAction('Deactivate LOC', 'Are you sure you want to deactivate this line of credit?', () => {
          // Implement deactivation logic
          console.log('Deactivating LOC');
        });
        break;
      case 'Reactivate':
        this.confirmAction('Reactivate LOC', 'Are you sure you want to reactivate this line of credit?', () => {
          // Implement reactivation logic
          console.log('Reactivating LOC');
        });
        break;
      case 'Close':
        this.confirmAction('Close LOC', 'Are you sure you want to close this line of credit?', () => {
          // Implement close logic
          console.log('Closing LOC');
        });
        break;
      case 'Increase Limit':
        // Open dialog for increasing limit
        console.log('Increase Limit');
        break;
      case 'Decrease Limit':
        // Open dialog for decreasing limit
        console.log('Decrease Limit');
        break;
      case 'Add Charge':
        this.router.navigate(['add-charge'], { relativeTo: this.route });
        break;
      case 'View Transactions':
        this.router.navigate(['transactions'], { relativeTo: this.route });
        break;
      case 'Generate Statement':
        // Implement statement generation
        console.log('Generate Statement');
        break;
      case 'Upload Document':
        this.router.navigate(
          [
            'documents',
            'upload'
          ],
          { relativeTo: this.route }
        );
        break;
      default:
        console.log('Action not implemented:', action);
    }
  }

  /**
   * Confirm action dialog
   */
  private confirmAction(title: string, message: string, onConfirm: () => void): void {
    // You would typically use MatDialog here
    if (confirm(message)) {
      onConfirm();
    }
  }

  /**
   * Mock LOC details fetching
   */
  fetchLocDetails(locId: string): void {
    const mockPayable = {
      id: 'CL-2025-0001',
      name: 'Working Capital Line',
      type: 'LOC PAYABLE',
      status: 'ACTIVE',
      activationDate: new Date('2025-01-28'),
      nextReviewDate: new Date('2025-10-01'),
      interestRate: 12.5,
      creditLimit: 100000,
      availableBalance: 70000,
      outstanding: 30000,
      activeLoans: 2,
      totalRepaid: 45000,
      utilization: 30,
      avgUtilization: 25000,
      performance: '100% on-time',
      currency: 'USD',
      clientCompanyName: 'ABC Corporation',
      clientContactPersonName: 'John Smith',
      clientContactPersonPhone: '+1234567890',
      clientContactPersonEmail: 'john.smith@abc.com',
      authorizedSignatoryName: 'Jane Doe',
      authorizedSignatoryPhone: '+0987654321',
      va: 'VA-001234'
    };

    const mockReceivable = {
      id: 'CL-2025-0004',
      name: 'Invoice Factoring Line',
      type: 'LOC RECEIVABLE',
      status: 'ACTIVE',
      activationDate: new Date('2025-02-15'),
      nextReviewDate: new Date('2026-02-15'),
      interestRate: 2.5,
      creditLimit: 50000,
      availableBalance: 30000,
      outstanding: 20000,
      activeLoans: 2,
      totalRepaid: 30000,
      utilization: 40,
      avgUtilization: 15000,
      performance: '95% within terms',
      currency: 'USD',
      clientCompanyName: 'XYZ Industries',
      clientContactPersonName: 'Bob Johnson',
      clientContactPersonPhone: '+1122334455',
      clientContactPersonEmail: 'bob@xyz.com',
      authorizedSignatoryName: 'Alice Brown',
      authorizedSignatoryPhone: '+5544332211',
      va: 'VA-005678'
    };

    const mockActiveLoans = [
      {
        id: 'LN-2025-0145',
        disbursedDate: new Date('2025-06-15'),
        amount: 20000,
        outstanding: 18000,
        nextPayment: new Date('2025-08-01'),
        status: 'Active'
      },
      {
        id: 'LN-2025-0089',
        disbursedDate: new Date('2025-05-02'),
        amount: 15000,
        outstanding: 12000,
        nextPayment: new Date('2025-08-01'),
        status: 'Active'
      }
    ];

    const mockTransactionHistory = [
      {
        type: 'Repayment - Loan #LN-2025-0089',
        date: new Date('2025-07-28T10:30:00'),
        amount: 3000,
        balance: 70000
      },
      {
        type: 'Drawdown - Loan #LN-2025-0145',
        date: new Date('2025-06-15T14:45:00'),
        amount: -20000,
        balance: 67000
      },
      {
        type: 'Repayment - Loan #LN-2025-0089',
        date: new Date('2025-06-01T09:15:00'),
        amount: 3000,
        balance: 87000
      },
      {
        type: 'Interest Charge',
        date: new Date('2025-05-31T23:59:00'),
        amount: -312.5,
        balance: 84000
      }
    ];

    of(locId === '1' ? mockPayable : mockReceivable)
      .pipe(delay(500))
      .subscribe((details) => {
        this.locDetails = details;
        this.activeLoans = mockActiveLoans;
        this.transactionHistory = mockTransactionHistory;
      });
  }

  /**
   * View loan details
   */
  viewLoanDetails(loanId: string): void {
    this.router.navigate([
      '/loans',
      loanId
    ]);
  }

  /**
   * Make payment for a loan
   */
  makePayment(loanId: string): void {
    this.router.navigate([
      '/loans',
      loanId,
      'make-payment'
    ]);
  }
}
