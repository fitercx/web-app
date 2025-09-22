/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

/** Custom Services */
import { ClientsService } from '../../clients.service';
import { SettingsService } from 'app/settings/settings.service';

/** Custom Components */
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';

/** Form Field Models */
import { DatepickerBase } from 'app/shared/form-dialog/formfield/model/datepicker-base';
import { InputBase } from 'app/shared/form-dialog/formfield/model/input-base';

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

  // Chart properties
  circumference = 2 * Math.PI * 15.9155; // ~100
  strokeDashoffset = this.circumference;

  /**
   * Extract approved buyers from various possible data structures
   */
  private extractApprovedBuyers(data: any): string[] {
    // Handle various possible field names and structures
    const possibleFields = [
      'approvedBuyersList',
      'approved_buyers_list',
      'approvedBuyers',
      'approved_buyers',
      'buyersList',
      'buyers_list',
      'buyers'
    ];

    for (const field of possibleFields) {
      const value = data[field];
      if (Array.isArray(value)) {
        // If it's already an array of strings, return it
        if (value.every((item) => typeof item === 'string')) {
          return value;
        }
        // If it's an array of objects, extract names
        if (value.every((item) => typeof item === 'object' && item !== null)) {
          return value
            .map(
              (buyer) =>
                buyer.name ||
                buyer.buyerName ||
                buyer.buyer_name ||
                buyer.companyName ||
                buyer.company_name ||
                buyer.displayName ||
                buyer.display_name ||
                String(buyer)
            )
            .filter(Boolean);
        }
      }
      // Handle comma-separated string
      if (typeof value === 'string' && value.trim()) {
        return value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    return [];
  }

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
        (err) => {}
      );
    } else {
    }
  }

  /**
   * Process LOC data from backend
   */
  private processLocData(data: any): void {
    // Debug utilization calculation
    const backendUtilization = data.utilization;
    const calculatedUtilization = this.calculateUtilization(data);

    const rawStatus = (data && data.status && (data.status.code || data.status.value)) || data?.status;
    const normalizedStatus = this.normalizeStatus(rawStatus);

    this.locDetails = {
      id: data.id,
      externalId: data.externalId,
      name: data.name,
      type: data.productType === 'PAYABLE' ? 'LOC PAYABLE' : 'LOC RECEIVABLE',
      status: normalizedStatus,
      activationDate: this.parseDate(data.startDate),
      nextReviewDate: this.parseDate(data.interimReviewDate),
      interestRate: data.interestRateOverride,
      annualInterestRate: data.annualInterestRate,
      creditLimit: data.maximumAmount,
      approvedCreditFacilityAmount: data.approvedCreditFacilityAmount,
      availableBalance: data.availableBalance,
      outstanding: data.outstanding,
      tenorDays: data.tenorDays,
      activeLoans: data.activeLoans,
      totalRepaid: data.totalRepaid,
      utilization: this.calculateUtilization(data),
      avgUtilization: data.avgUtilization,
      performance: data.performance,
      charges: Array.isArray(data.charges) ? data.charges : [],
      currency: data.currency,

      // Approved Buyers - handle multiple possible field names and structures
      approvedBuyersList: this.extractApprovedBuyers(data),

      // Settlement Account fields
      settlementSavingsAccountId: data.settlementSavingsAccountId,
      settlementSavingsAccountNo: data.settlementSavingsAccountNo,
      settlementSavingsAccountBalance: data.settlementSavingsAccountBalance,

      // Client/Company details
      clientCompanyName: data.clientCompanyName,
      clientContactPersonName: data.clientContactPersonName,
      clientContactPersonPhone: data.clientContactPersonPhone,
      clientContactPersonEmail: data.clientContactPersonEmail,

      // Authorized Signatory details
      authorizedSignatoryName: data.authorizedSignatoryName,
      authorizedSignatoryPhone: data.authorizedSignatoryPhone,
      authorizedSignatoryEmail: data.authorizedSignatoryEmail,

      // Other fields
      va: data.va,
      specialConditions: data.specialConditions,

      // Client information from nested client object
      clientId: data.clientId,
      clientName: data.client?.displayName,
      clientAccountNo: data.client?.accountNo,
      clientExternalId: data.client?.externalId,
      clientStatus: data.client?.status?.value,
      officeName: data.client?.officeName,

      // Audit fields
      createdDate: this.parseDate(data.createdDate),
      lastModifiedDate: this.parseDate(data.lastModifiedDate),
      createdByUsername: data.createdByUsername,
      lastModifiedByUsername: data.lastModifiedByUsername
    };

    this.activeLoans = data.activeLoansList || [];
    this.transactionHistory = data.transactionHistory || [];

    // Update chart based on utilization
    this.updateChart();

    // Fetch client name if available
    if (this.locDetails.clientName) {
      this.clientName = this.locDetails.clientName;
    }
  }

  /**
   * Update chart values based on utilization
   */
  private updateChart(): void {
    if (this.locDetails && typeof this.locDetails.utilization === 'number') {
      const utilizationPercentage = Math.max(0, Math.min(100, this.locDetails.utilization));
      this.strokeDashoffset = this.circumference - (utilizationPercentage / 100) * this.circumference;
    } else {
      this.strokeDashoffset = this.circumference; // 0% utilization
    }
  }

  /**
   * Calculate utilization percentage
   */
  private calculateUtilization(data: any): number {
    // Try various field names for credit limit
    const maxAmount =
      data.maximumAmount ||
      data.maxCreditLimit ||
      data.creditLimit ||
      data.approvedCreditFacilityAmount ||
      data.facilityAmount;

    // Try various field names for utilized/outstanding amount
    const consumedAmount =
      data.outstanding ||
      data.consumedAmount ||
      data.consumed_amount ||
      data.utilizedAmount ||
      data.utilized_amount ||
      data.drawn ||
      data.drawnAmount;

    if (maxAmount && maxAmount > 0 && consumedAmount !== null && consumedAmount !== undefined) {
      const percentage = (consumedAmount / maxAmount) * 100;
      // Ensure percentage doesn't exceed 100% and is not negative
      return Math.max(0, Math.min(100, Math.round(percentage * 10) / 10)); // Round to 1 decimal place
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
   * Check if LOC is in a state that allows drawdowns
   */
  canCreateDrawdown(): boolean {
    return this.locDetails?.status === 'ACTIVE';
  }

  /**
   * Get available actions based on LOC status
   */
  getAvailableActions(): string[] {
    const status = this.locDetails?.status;
    switch (status) {
      case 'SUBMITTED':
        return [
          'Approve',
          'Close'
        ];
      case 'APPROVED':
        return [
          'Activate',
          'Close'
        ];
      case 'ACTIVE':
        return [
          'Deactivate',
          'Suspend',
          'Increase Limit',
          'Decrease Limit'
        ];
      case 'INACTIVE':
        return [
          'Reactivate',
          'Increase Limit',
          'Decrease Limit'
        ];
      case 'SUSPENDED':
        return [
          'Reactivate',
          'Increase Limit',
          'Decrease Limit'
        ];
      case 'CLOSED':
        return [];
      default:
        return [];
    }
  }

  /**
   * Normalize various backend status representations to canonical values.
   */
  private normalizeStatus(status: any): string {
    if (!status) {
      return '';
    }
    const s = String(status).trim().toLowerCase();
    // Map possible variants to canonical constants
    if ([
        'submitted',
        'status.submitted',
        'locactivationstatus.submitted'
      ].includes(s)) {
      return 'SUBMITTED';
    }
    if ([
        'approved',
        'status.approved',
        'locactivationstatus.approved'
      ].includes(s)) {
      return 'APPROVED';
    }
    if ([
        'active',
        'status.active',
        'locactivationstatus.active'
      ].includes(s)) {
      return 'ACTIVE';
    }
    if ([
        'inactive',
        'status.inactive',
        'locactivationstatus.inactive',
        'deactivated',
        'status.deactivated'
      ].includes(s)) {
      return 'INACTIVE';
    }
    if ([
        'suspended',
        'status.suspended',
        'locactivationstatus.suspended'
      ].includes(s)) {
      return 'SUSPENDED';
    }
    if ([
        'closed',
        'status.closed',
        'locactivationstatus.closed'
      ].includes(s)) {
      return 'CLOSED';
    }
    return status; // fallback to raw so at least something renders
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
        // Navigate to loan creation page with LOC ID as query parameter
        const queryParams: any = { lineOfCreditId: this.locId };
        this.router.navigate(
          [
            '../../',
            'loans-accounts',
            'create'
          ],
          { relativeTo: this.route, queryParams }
        );
        break;
      case 'Approve':
        this.openActionDialog('approve');
        break;
      case 'Activate':
        this.openActionDialog('activate');
        break;
      case 'Deactivate':
        this.openActionDialog('deactivate');
        break;
      case 'Reactivate':
        this.openActionDialog('reactivate');
        break;
      case 'Suspend':
        this.openActionDialog('suspend');
        break;
      case 'Close':
        this.openActionDialog('close');
        break;
      case 'Increase Limit':
        // Open dialog for increasing limit
        this.router.navigate(['increase-limit'], { relativeTo: this.route });
        break;
      case 'Decrease Limit':
        // Open dialog for decreasing limit
        this.router.navigate(['decrease-limit'], { relativeTo: this.route });
        break;
      default:
    }
  }

  /**
   * Open action dialog with date and note fields
   */
  private openActionDialog(action: string): void {
    const actionTitle = this.getActionTitle(action);
    const dateFieldLabel = this.getDateFieldLabel(action);

    const dialogRef = this.dialog.open(FormDialogComponent, {
      data: {
        formfields: [
          new DatepickerBase({
            controlName: 'actionDate',
            label: dateFieldLabel,
            value: new Date(),
            required: true,
            order: 1,
            maxDate: new Date()
          }),
          new InputBase({
            controlName: 'note',
            label: 'Notes (Optional)',
            value: '',
            required: false,
            order: 2,
            controlType: 'textarea',
            rows: 3
          })

        ],
        layout: {
          addButtonText: `${actionTitle} LOC`,
          cancelButtonText: 'Cancel'
        },
        pristine: false
      }
    });

    dialogRef.afterClosed().subscribe((response: any) => {
      if (response && response.data) {
        const formValue = response.data.value;
        const payload = this.buildActionPayload(action, formValue.actionDate, formValue.note);
        this.performLocAction(action, payload);
      }
    });
  }

  /**
   * Get action title for display
   */
  private getActionTitle(action: string): string {
    const titles: { [key: string]: string } = {
      approve: 'Approve',
      activate: 'Activate',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      suspend: 'Suspend',
      close: 'Close'
    };
    return titles[action] || action;
  }

  /**
   * Get date field label for display
   */
  private getDateFieldLabel(action: string): string {
    const labels: { [key: string]: string } = {
      approve: 'Approval Date',
      activate: 'Activation Date',
      deactivate: 'Deactivation Date',
      reactivate: 'Reactivation Date',
      suspend: 'Suspension Date',
      close: 'Closure Date'
    };
    return labels[action] || `${action} Date`;
  }

  /**
   * Build payload for LOC action with locale, dateFormat, and date
   */
  private buildActionPayload(action: string, actionDate: Date, note?: string): any {
    const formattedDate = this.formatDateForPayload(actionDate);
    const dateFieldName = this.getDateFieldName(action);

    const payload: any = {
      locale: this.locale,
      dateFormat: this.dateFormat,
      [dateFieldName]: formattedDate
    };

    if (note && note.trim()) {
      payload.note = note.trim();
    }

    return payload;
  }

  /**
   * Format date according to the expected API format
   */
  private formatDateForPayload(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    // Format according to the dateFormat setting
    if (this.dateFormat.includes('dd')) {
      return `${day} ${this.getMonthName(date.getMonth())} ${year}`;
    }

    return `${day} ${month} ${year}`;
  }

  /**
   * Get month name for date formatting
   */
  private getMonthName(monthIndex: number): string {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ];
    return months[monthIndex];
  }

  /**
   * Get the appropriate date field name for the action
   */
  private getDateFieldName(action: string): string {
    const fieldNames: { [key: string]: string } = {
      approve: 'approvedOnDate',
      activate: 'activatedOnDate',
      deactivate: 'closedOnDate',
      reactivate: 'reactivatedOnDate',
      suspend: 'suspendedOnDate',
      close: 'closedOnDate'
    };
    return fieldNames[action] || 'actionDate';
  }

  /**
   * Perform LOC action via API
   */
  private performLocAction(action: string, payload?: any): void {
    if (this.clientsService && typeof (this.clientsService as any).performLocAction === 'function') {
      (this.clientsService as any).performLocAction(this.clientId, this.locId, action, payload).subscribe(
        (response: any) => {
          // Reload the page after successful action
          window.location.reload();
        },
        (error: any) => {
          console.error(`LOC ${action} failed:`, error);
        }
      );
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

  // Charges Summary Methods

  /**
   * Get total number of charges
   */
  getTotalChargesCount(): number {
    return this.locDetails?.charges?.length || 0;
  }

  /**
   * Get number of active charges
   */
  getActiveChargesCount(): number {
    if (!this.locDetails?.charges) return 0;
    return this.locDetails.charges.filter((charge: any) => charge.active && !charge.paid && !charge.waived).length;
  }

  /**
   * Get number of pending charges (outstanding > 0)
   */
  getPendingChargesCount(): number {
    if (!this.locDetails?.charges) return 0;
    return this.locDetails.charges.filter((charge: any) => charge.amountOutstanding > 0).length;
  }

  /**
   * Get total amount of all charges
   */
  getTotalChargesAmount(): number {
    if (!this.locDetails?.charges) return 0;
    return this.locDetails.charges.reduce((total: number, charge: any) => total + (charge.amount || 0), 0);
  }

  /**
   * Get total paid amount across all charges
   */
  getTotalPaidAmount(): number {
    if (!this.locDetails?.charges) return 0;
    return this.locDetails.charges.reduce((total: number, charge: any) => total + (charge.amountPaid || 0), 0);
  }

  /**
   * Get total waived amount across all charges
   */
  getTotalWaivedAmount(): number {
    if (!this.locDetails?.charges) return 0;
    return this.locDetails.charges.reduce((total: number, charge: any) => total + (charge.amountWaived || 0), 0);
  }

  /**
   * Get total outstanding amount across all charges
   */
  getTotalOutstandingAmount(): number {
    if (!this.locDetails?.charges) return 0;
    return this.locDetails.charges.reduce((total: number, charge: any) => total + (charge.amountOutstanding || 0), 0);
  }

  /**
   * Get overall completion percentage for all charges
   */
  getOverallCompletionPercentage(): number {
    const totalAmount = this.getTotalChargesAmount();
    if (totalAmount === 0) return 0;

    const completedAmount = this.getTotalPaidAmount() + this.getTotalWaivedAmount();
    return (completedAmount / totalAmount) * 100;
  }

  /**
   * Navigate to charges tab/view
   */
  viewAllCharges(): void {
    this.router.navigate(['./charges'], { relativeTo: this.route });
  }

  /**
   * Get formatted utilization percentage
   */
  getUtilizationPercentage(): string {
    if (!this.locDetails || typeof this.locDetails.utilization !== 'number') {
      return '0.0';
    }
    return this.locDetails.utilization.toFixed(1);
  }

  /**
   * Get numeric utilization percentage for calculations
   */
  getUtilizationValue(): number {
    if (!this.locDetails || typeof this.locDetails.utilization !== 'number') {
      return 0;
    }
    return Math.max(0, Math.min(100, this.locDetails.utilization));
  }
}
