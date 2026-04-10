/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

/** Custom Services */
import { ClientsService } from '../../clients.service';
import { SettingsService } from 'app/settings/settings.service';
import { AlertService } from 'app/core/alert/alert.service';

/** Custom Components */
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { ManageApprovedBuyersDialogComponent } from '../manage-approved-buyers-dialog/manage-approved-buyers-dialog.component';
import {
  EditBlockedAmountDialogComponent,
  EditBlockedAmountDialogResult
} from './edit-blocked-amount-dialog/edit-blocked-amount-dialog.component';

/** Custom Models */
import { ApprovedBuyer, ManageApprovedBuyersDialogData } from '../../models/credit-line.model';

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
  blockedAmountActionAllowed = true;

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
    private settingsService: SettingsService,
    private alertService: AlertService
  ) {
    this.clientId = this.route.parent?.snapshot.paramMap.get('clientId') || '';
    this.locId = this.route.snapshot.paramMap.get('locId') || '';
  }

  ngOnInit() {
    // Prefer fetching real LOC details from resolver; fallback to API call if resolver data not available
    try {
      this.dateFormat = this.settingsService.dateFormat || this.dateFormat;
      this.locale = this.settingsService.language?.code || this.settingsService.languageCode || this.locale;
    } catch (e) {
      // ignore
    }

    // Check resolver data first (this is the preferred and efficient approach)
    const resolved = this.route.snapshot.data['locData'] || this.route.parent?.snapshot.data['locData'];
    if (resolved) {
      this.processLocData(resolved);
    } else if (this.clientsService && this.locId) {
      // Fallback: Only make API call if resolver data is not available
      this.clientsService.getClientCreditLine(this.clientId, this.locId).subscribe(
        (data: any) => {
          this.processLocData(data);
        },
        (err) => {
          console.error('Failed to load LOC details:', err);
        }
      );
    } else {
      console.warn('No LOC data available from resolver or service');
    }
  }

  /**
   * Process LOC data from backend
   */
  private processLocData(data: any): void {
    const rawStatusObj = data?.status; // keep entire backend object {id, code, value}
    const rawStatus = rawStatusObj?.code || rawStatusObj?.value || data?.status;

    // Access timeline data for activation date (consistent with audit trail implementation)
    const timelineData = data.timeLineData || data;

    this.locDetails = {
      id: data.id,
      externalId: data.externalId,
      name: data.name,
      type: data.productType === 'PAYABLE' ? 'LOC PAYABLE' : 'LOC RECEIVABLE',
      status: rawStatusObj || rawStatus, // retain original object for pipe consumption (expects code)
      activationDate: this.parseDate(timelineData.activatedOnDate),
      nextReviewDate: this.parseDate(data.interimReviewDate),
      interestRate: data.interestRateOverride,
      annualInterestRate: data.annualInterestRate,
      creditLimit: data.maximumAmount,
      blockedAmount: data.blockedAmount || 0,
      approvedCreditFacilityAmount: data.approvedCreditFacilityAmount,
      availableBalance: data.availableBalance,

      consumedAmount: data.consumedAmount,
      tenorDays: data.tenorDays,
      activeLoans: data.activeLoans,
      totalRepaid: data.totalRepaid,
      utilization: this.calculateUtilization(data),
      avgUtilization: data.avgUtilization,
      performance: data.performance,
      charges: Array.isArray(data.charges) ? data.charges : [],
      currency: data.currency,

      // Date fields
      startDate: this.parseDate(data.startDate),
      endDate: this.parseDate(data.endDate),

      // LOC specific fields
      advancePercentage: data.advancePercentage,
      cashMarginType: data.cashMarginType,
      cashMarginValue: data.cashMarginValue,
      rateType: data.rateType,
      interestChargeTime: data.interestChargeTime,

      // Business fields
      distributionPartner: data.distributionPartner,
      reviewPeriod: data.reviewPeriod,
      loanOfficerId: data.loanOfficerId,
      loanOfficerName: data.loanOfficerName,

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
      clientLegalForm: data.client?.legalForm?.value,
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
    // Use the specific field from the API response
    const maxAmount = data.maximumAmount;
    const consumedAmount = data.consumedAmount;

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
    return this.locDetails?.status?.code === 'status.active';
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
        const queryParams: any = {
          lineOfCreditId: this.locId,
          lineOfCreditType: this.locDetails.type === 'LOC PAYABLE' ? 'Payable' : 'Receivable'
        };
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
      case 'Close':
        this.openActionDialog('close');
        break;
      case 'Increase Limit':
        this.openLimitActionDialog('increasecreditlimit');
        break;
      case 'Decrease Limit':
        this.openLimitActionDialog('decreasecreditlimit');
        break;
      case 'Edit Blocked Amount':
        this.openEditBlockedAmountDialog();
        break;
      default:
    }
  }

  openEditBlockedAmountDialog(): void {
    const dialogRef = this.dialog.open(EditBlockedAmountDialogComponent, {
      width: '560px',
      data: {
        currentBlockedAmount: Number(this.locDetails?.blockedAmount || 0),
        currencyCode: this.getCurrencyCode(),
        currencyDecimalPlaces: 2
      }
    });

    dialogRef.afterClosed().subscribe((result?: EditBlockedAmountDialogResult) => {
      if (!result) {
        return;
      }

      const request =
        result.action === 'blockamount'
          ? this.clientsService.blockLocAmount(this.clientId, this.locId, result.payload)
          : this.clientsService.unblockLocAmount(this.clientId, this.locId, result.payload);

      request.subscribe(
        () => {
          const formattedAmount = new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(result.payload.amount);
          const actionLabel = result.action === 'blockamount' ? 'Blocked amount updated' : 'Blocked amount reduced';
          this.alertService.alert({
            type: 'Line of Credit',
            message: `${actionLabel}: ${formattedAmount} ${this.getCurrencyCode()}`.trim()
          });
          this.refreshLocData();
        },
        (error) => {
          if (error?.status === 401 || error?.status === 403) {
            this.blockedAmountActionAllowed = false;
          }
          this.alertService.alert({ type: 'Line of Credit', message: this.extractApiErrorMessage(error) });
        }
      );
    });
  }

  canEditBlockedAmount(): boolean {
    return this.isActive() && this.blockedAmountActionAllowed;
  }

  /**
   * Open manage approved buyers dialog
   */
  openManageApprovedBuyersDialog(): void {
    const dialogData: ManageApprovedBuyersDialogData = {
      clientId: this.clientId,
      lineOfCreditId: this.locId,
      currentVendors: [], // Will be loaded from API in the dialog
      locType: this.locDetails?.type === 'LOC PAYABLE' ? 'PAYABLE' : 'RECEIVABLE',
      isActive: this.isActive()
    };

    const dialogRef = this.dialog.open(ManageApprovedBuyersDialogComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.success) {
        // Refresh the LOC data from the server to get updated vendor list
        this.refreshLocData();

        // Show success message
        console.log('Vendors updated successfully');
      }
    });
  }

  /**
   * Extract current buyers as objects for the dialog
   */
  private extractCurrentBuyersAsObjects(): ApprovedBuyer[] {
    if (!this.locDetails?.approvedBuyersList || !Array.isArray(this.locDetails.approvedBuyersList)) {
      return [];
    }

    // For now, we only have names, so we'll create objects with name as both code and name
    // In the future, if the backend provides full objects, this can be updated
    return this.locDetails.approvedBuyersList.map((name: string, index: number) => ({
      code: name.replace(/\s+/g, '_').toUpperCase(), // Generate a code from name
      name: name,
      externalId: '' // Empty for now
    }));
  }

  /**
   * Refresh LOC data from server
   */
  private refreshLocData(): void {
    if (this.clientsService && this.locId) {
      this.clientsService.getClientCreditLine(this.clientId, this.locId).subscribe(
        (data: any) => {
          this.processLocData(data);
        },
        (err) => {
          console.error('Failed to refresh LOC details:', err);
        }
      );
    }
  }

  private extractApiErrorMessage(error: any): string {
    const firstValidationMessage = error?.error?.errors?.[0]?.defaultUserMessage;
    return (
      firstValidationMessage ||
      error?.error?.defaultUserMessage ||
      error?.error?.userMessage ||
      error?.error?.developerMessage ||
      error?.message ||
      'Request failed. Please review your input and try again.'
    );
  }

  private getCurrencyCode(): string {
    if (typeof this.locDetails?.currency === 'string') {
      return this.locDetails.currency;
    }
    return this.locDetails?.currency?.code || '';
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
      },
      width: '600px',
      minWidth: '600px'
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
   * Open action dialog with date, amount and note fields for limit actions
   */
  private openLimitActionDialog(action: string): void {
    const actionTitle = this.getLimitActionTitle(action);
    const amountLabel =
      action === 'increasecreditlimit'
        ? 'Enter new available balance'
        : 'Enter amount to decrease from available balance';

    const dialogRef = this.dialog.open(FormDialogComponent, {
      data: {
        formfields: [
          new DatepickerBase({
            controlName: 'actionDate',
            label: 'Action Date',
            value: new Date(),
            required: true,
            order: 1,
            maxDate: new Date()
          }),
          new InputBase({
            controlName: 'amount',
            label: amountLabel,
            value: '',
            required: true,
            order: 2,
            controlType: 'number',
            validators: [
              'required',
              'min(0.01)'
            ]
          }),
          new InputBase({
            controlName: 'note',
            label: 'Notes (Optional)',
            value: '',
            required: false,
            order: 3,
            controlType: 'textarea',
            rows: 3
          })

        ],
        layout: {
          addButtonText: `${actionTitle} LOC`,
          cancelButtonText: 'Cancel'
        },
        pristine: false
      },
      width: '600px',
      minWidth: '600px'
    });

    dialogRef.afterClosed().subscribe((response: any) => {
      if (response && response.data) {
        const formValue = response.data.value;
        const payload = this.buildLimitActionPayload(action, formValue.actionDate, formValue.amount, formValue.note);
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
   * Get action title for limit actions
   */
  private getLimitActionTitle(action: string): string {
    const titles: { [key: string]: string } = {
      increasecreditlimit: 'Increase New Available Balance',
      decreasecreditlimit: 'Decrease New Available Balance'
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
   * Build payload for LOC limit actions with locale, dateFormat, date and amount
   */
  private buildLimitActionPayload(action: string, actionDate: Date, amount: number, note?: string): any {
    const formattedDate = this.formatDateForPayload(actionDate);

    const payload: any = {
      locale: this.locale,
      dateFormat: this.dateFormat,
      actionDate: formattedDate,
      amount: amount
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
    return 'actionDate';
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

  getTotalTaxesAmount(): number {
    if (!this.locDetails?.charges) return 0;
    return this.locDetails.charges.reduce((total: number, charge: any) => total + (charge.taxAmount || 0), 0);
  }

  /**
   * Get total paid amount across all charges
   */
  getTotalPaidAmount(): number {
    if (!this.locDetails?.charges) return 0;
    let total = this.locDetails.charges.reduce((total: number, charge: any) => total + (charge.amountPaid || 0), 0);
    if (total > 0) {
      total = total + this.getTotalTaxesAmount();
    }

    return total;
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
    let total = this.locDetails.charges.reduce(
      (total: number, charge: any) => total + (charge.amountOutstanding || 0),
      0
    );
    if (total > 0) {
      total = total + this.getTotalTaxesAmount();
    }

    return total;
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

  /**
   * Check if LOC can be edited (only when status is submitted or approved)
   */
  canEditLoc(): boolean {
    return this.locDetails?.status?.code === 'status.submitted' || this.locDetails?.status?.code === 'status.approved';
  }
}
