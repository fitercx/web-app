/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

/** Custom Services */
import { LoansService } from '../loans.service';

/** Custom Buttons Configuration */
import { LoansAccountButtonConfiguration } from './loan-accounts-button-config';

/** Dialog Components */
import { ConfirmationDialogComponent } from '../../shared/confirmation-dialog/confirmation-dialog.component';
import { DeleteDialogComponent } from 'app/shared/delete-dialog/delete-dialog.component';
import { LoanStatus } from '../models/loan-status.model';
import { Currency } from 'app/shared/models/general.model';
import { DelinquencyPausePeriod } from '../models/loan-account.model';
import { TranslateService } from '@ngx-translate/core';
import { LoanTransaction } from 'app/products/loan-products/models/loan-account.model';

@Component({
  selector: 'mifosx-loans-view',
  templateUrl: './loans-view.component.html',
  styleUrls: ['./loans-view.component.scss']
})
class LoansViewComponent implements OnInit {
  /** Loan Details Data */
  loanDetailsData: any;
  /** Loan Datatables */
  loanDatatables: any;
  /** Recalculate Interest */
  recalculateInterest: any;
  /** Whether this loan's product configuration can ever satisfy the backend's Re-Age/Re-Amortize
   *  eligibility rules (progressive schedule + advanced payment allocation + non-interest-bearing) */
  isReAgeReAmortizeEligible = false;
  /** True once any real money-movement transaction (repayment, waiver, write-off, refund, etc.) has
   *  been posted after disbursement - see setConditionalButtons() for why this gates "Undo Disbursal". */
  hasPostDisbursementActivity = false;
  /** loan Arrears Delinquency config value */
  loanDisplayArrearsDelinquency: number;
  /** Status */
  status: string;
  entityType: string;
  /** Loan Id */
  loanId: number;
  /** Client Id */
  clientId: number;
  /** Button Configuration */
  buttonConfig: LoansAccountButtonConfiguration;
  /** Disburse Transaction number */
  disburseTransactionNo = 0;

  loanDelinquencyClassificationStyle = '';
  loanStatus: LoanStatus;
  currency: Currency;
  loanReAged = false;
  loanReAmortized = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public loansService: LoansService,
    private translateService: TranslateService,
    public dialog: MatDialog
  ) {
    this.route.data.subscribe(
      (data: { loanDetailsData: any; loanDatatables: any; loanArrearsDelinquencyConfig: any }) => {
        this.loanDetailsData = data.loanDetailsData;
        this.loanDatatables = data.loanDatatables;
        this.loanDisplayArrearsDelinquency = data.loanArrearsDelinquencyConfig.value || 0;
        this.loanStatus = this.loanDetailsData.status;
        this.currency = this.loanDetailsData.currency;
        if (this.loanStatus.active) {
          this.loanDetailsData.transactions.forEach((lt: LoanTransaction) => {
            if (!lt.manuallyReversed) {
              if (lt.type.reAge) {
                this.loanReAged = true;
              } else if (lt.type.reAmortize) {
                this.loanReAmortized = true;
              }
            }
          });
        }
      }
    );
    this.loanId = this.route.snapshot.params['loanId'];
    this.clientId = this.loanDetailsData.clientId;
  }

  ngOnInit() {
    // BUG FIX: this used to be `this.loanDetailsData.recalculateInterest || true`. Two separate bugs
    // compounded here: (1) `recalculateInterest` is not a real field on the loan details API response
    // (the real field is `isInterestRecalculationEnabled`), so it always read `undefined`; and (2) the
    // `|| true` then unconditionally forced the result to `true` regardless of what the API returned.
    // Together this incorrectly showed "Add Interest Pause" on every Active loan, including all of
    // today's real production products (RBF / Payables Facility / Receivables Facility / Short Term
    // Loan), none of which have interest recalculation enabled - the backend always rejects the action
    // with a 403, but ops sees a working-looking button that is guaranteed to dead-end. See
    // UI_AUDIT_FINDINGS.md.
    this.recalculateInterest = !!this.loanDetailsData.isInterestRecalculationEnabled;
    // Re-Age and Re-Amortize are only ever accepted by the backend for loans that are ALL of:
    // progressive repayment schedule, "Advanced payment allocation" transaction processing strategy,
    // AND non-interest-bearing (see LoanReAgingValidator / LoanReAmortizationValidator in core
    // Fineract). None of today's real production loan products satisfy all three - they use a
    // Cumulative schedule, the standard transaction strategy, and do charge interest - so these buttons
    // are today a guaranteed dead-end 403 for every real loan. Compute the eligibility once here so both
    // buttons (and their "Undo" counterparts, which only make sense once the action has actually
    // happened) can be hidden entirely for products that can never use them, instead of showing an
    // action that always fails.
    this.isReAgeReAmortizeEligible =
      this.loanDetailsData.loanScheduleType?.code === 'PROGRESSIVE' &&
      this.loanDetailsData.transactionProcessingStrategyCode === 'advanced-payment-allocation-strategy' &&
      !(this.loanDetailsData.interestRatePerPeriod > 0);
    this.status = this.loanDetailsData.status.value;
    if (this.loanDetailsData && this.loanDetailsData.transactions) {
      if (this.loanStatus.active && this.loanDetailsData.multiDisburseLoan) {
        this.loanDetailsData.transactions.forEach((transaction: any) => {
          if (transaction.type.disbursement) {
            this.disburseTransactionNo++;
          }
        });
      }
      // "Undo Disbursal" resets the loan all the way back to pre-disbursal state and reverses EVERY
      // transaction on it (see LoanWritePlatformServiceJpaRepositoryImpl#updateLoanToPreDisbursalState).
      // That is safe on a freshly-disbursed loan with nothing else posted, but on a loan that already
      // has real repayments/waivers/refunds/write-offs against it, it silently wipes that entire
      // transaction history back to zero - while the actual cash already collected from/paid into the
      // customer's linked accounts is NOT symmetrically reversed, leaving the loan's records and the
      // real-world cash movements out of sync. Detect that case here so the button can be disabled with
      // a clear explanation instead of allowing a one-click, hard-to-detect data-corrupting mistake.
      this.hasPostDisbursementActivity = this.loanDetailsData.transactions.some(
        (transaction: any) =>
          !transaction.reversed &&
          !(
            transaction.type &&
            (transaction.type.disbursement || transaction.type.accrual || transaction.type.repaymentAtDisbursement)
          )
      );
    }
    this.setConditionalButtons();
    if (this.router.url.includes('clients')) {
      this.entityType = 'Client';
    } else if (this.router.url.includes('groups')) {
      this.entityType = 'Group';
    } else if (this.router.url.includes('centers')) {
      this.entityType = 'Center';
    }
    this.loanDelinquencyClassification();
  }

  // Defines the buttons based on the status of the loan account
  setConditionalButtons() {
    this.buttonConfig = new LoansAccountButtonConfiguration(this.status);

    if (this.status === 'Active' && this.hasPostDisbursementActivity) {
      this.buttonConfig.disableButton(
        'Undo Disbursal',
        'Not available: this loan already has repayments, waivers, refunds, or other transactions ' +
          'posted after disbursement. Undoing the disbursal would wipe out that entire transaction ' +
          'history without reversing the matching cash movements already made in the customer\u2019s ' +
          'linked accounts, leaving the two out of sync.'
      );
    }

    if (this.status === 'Submitted and pending approval') {
      this.buttonConfig.addOption({
        name: this.loanDetailsData.loanOfficerName ? 'Change Loan Officer' : 'Assign Loan Officer',
        icon: 'user-tie',
        taskPermissionName: 'DISBURSE_LOAN'
      });

      if (this.loanDetailsData.isVariableInstallmentsAllowed) {
        this.buttonConfig.addOption({
          name: 'Edit Repayment Schedule',
          icon: 'edit',
          taskPermissionName: 'ADJUST_REPAYMENT_SCHEDULE'
        });
      }
    } else if (this.status === 'Approved') {
      this.buttonConfig.addButton({
        name: this.loanDetailsData.loanOfficerName ? 'Change Loan Officer' : 'Assign Loan Officer',
        icon: 'user-tie',
        taskPermissionName: 'DISBURSE_LOAN'
      });
    } else if (this.status === 'Active') {
      if (this.loanDetailsData.canDisburse || this.loanDetailsData.multiDisburseLoan) {
        this.buttonConfig.addButton({
          name: 'Disburse',
          icon: 'hand-holding-usd',
          taskPermissionName: 'DISBURSE_LOAN'
        });
      }
      if (this.loanDetailsData.canDisburse || this.loanDetailsData.multiDisburseLoan) {
        this.buttonConfig.addButton({
          name: 'Disburse to Savings',
          icon: 'piggy-bank',
          taskPermissionName: 'DISBURSETOSAVINGS_LOAN'
        });
      }
      if (this.loanDetailsData.multiDisburseLoan && this.disburseTransactionNo > 1) {
        this.buttonConfig.addButton({
          name: 'Undo Last Disbursal',
          icon: 'undo',
          taskPermissionName: 'DISBURSALLASTUNDO_LOAN'
        });
      }
      // Interest Pause is only accepted by the backend for progressive + interest-recalculation-enabled
      // loans (see InterestPauseWritePlatformServiceImpl) - none of today's real production products.
      // Hidden entirely rather than shown as a button that always 403s.
      if (this.recalculateInterest) {
        this.buttonConfig.addButton({
          name: 'Add Interest Pause',
          icon: 'calendar',
          taskPermissionName: 'CREATE_INTEREST_PAUSE'
        });
      }
      // loan officer not assigned to loan, below logic
      // helps to display otherwise not
      if (!this.loanDetailsData.loanOfficerName) {
        this.buttonConfig.addButton({
          name: 'Assign Loan Officer',
          icon: 'user-tie',
          taskPermissionName: 'UPDATELOANOFFICER_LOAN'
        });
      }

      // Unlike Interest Pause/Re-Age/Re-Amortize, "Prepay Loan" has no backend restriction tying it to
      // interest recalculation - it works (posts as a normal early full repayment) for every loan
      // product, so it is intentionally NOT gated on `recalculateInterest` here.
      this.buttonConfig.addButton({
        name: 'Prepay Loan',
        icon: 'coins',
        taskPermissionName: 'REPAYMENT_LOAN'
      });

      // Allow ChargeOff only If there loan is not already ChargeOff
      if (!this.loanDetailsData.chargedOff) {
        this.buttonConfig.addButton({
          name: 'Charge-Off',
          icon: 'coins',
          taskPermissionName: 'CHARGEOFF_LOAN'
        });
      } else {
        this.buttonConfig.addButton({
          name: 'Undo Charge-Off',
          icon: 'undo',
          taskPermissionName: 'UNDOCHARGEOFF_LOAN'
        });
      }

      // Re-Age/Re-Amortize are only accepted by the backend for progressive-schedule, advanced-payment-
      // allocation, non-interest-bearing loans (see LoanReAgingValidator / LoanReAmortizationValidator) -
      // no real production product qualifies today. Hide the "start" action entirely for ineligible
      // products (a guaranteed-403 button is worse than no button); still show "Undo" if a re-age/
      // re-amortize transaction somehow already exists on this loan, so it always stays reversible.
      if (this.isReAgeReAmortizeEligible || this.loanReAged) {
        if (!this.loanReAged) {
          this.buttonConfig.addButton({
            name: 'Re-Age',
            icon: 'calendar',
            taskPermissionName: 'REAGE_LOAN'
          });
        } else {
          this.buttonConfig.addButton({
            name: 'Undo Re-Age',
            icon: 'undo',
            taskPermissionName: 'UNDO_REAGE_LOAN'
          });
        }
      }

      if (this.isReAgeReAmortizeEligible || this.loanReAmortized) {
        if (!this.loanReAmortized) {
          this.buttonConfig.addButton({
            name: 'Re-Amortize',
            icon: 'calendar-alt',
            taskPermissionName: 'REAMORTIZE_LOAN'
          });
        } else {
          this.buttonConfig.addButton({
            name: 'Undo Re-Amortize',
            icon: 'undo',
            taskPermissionName: 'UNDO_REAMORTIZE_LOAN'
          });
        }
      }
    }
  }

  loanAction(actionName: string) {
    switch (actionName) {
      case 'Recover From Guarantor':
        this.recoverFromGuarantor();
        break;
      case 'Delete':
        this.deleteLoanAccount();
        break;
      case 'Modify Application':
        this.router.navigate(['edit-loans-account'], { relativeTo: this.route });
        break;
      case 'Transfer Funds':
        const queryParams: any = { loanId: this.loanId, accountType: 'fromloans' };
        this.router.navigate(['transfer-funds/make-account-transfer'], {
          relativeTo: this.route,
          queryParams: queryParams
        });
        break;
      case 'Adjust Installment Date':
        this.router.navigate(['./repayment-schedule'], {
          relativeTo: this.route,
          queryParams: { openAdjustDialog: 'true' }
        });
        break;
      case 'Undo Re-Age':
      case 'Undo Re-Amortize':
      case 'Undo Charge-Off':
        this.undoLoanAction(actionName);
        break;
      default:
        const navigationExtras: NavigationExtras = {
          relativeTo: this.route,
          state: {
            data: this.loanDetailsData
          }
        };
        this.router.navigate(
          [
            'actions',
            actionName
          ],
          navigationExtras
        );
        break;
    }
  }

  /**
   * Recover from guarantor action
   */
  private recoverFromGuarantor() {
    const recoverFromGuarantorDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: this.translateService.instant('labels.heading.Recover from Guarantor'),
        dialogContext: this.translateService.instant(
          'labels.dialogContext.Are you sure you want recover from Guarantor'
        ),
        type: 'Mild'
      }
    });
    recoverFromGuarantorDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        this.loansService.loanActionButtons(this.loanId, 'recoverGuarantees').subscribe(() => {
          this.reload();
        });
      }
    });
  }

  loanDelinquencyClassification(): void {
    this.loanDelinquencyClassificationStyle = '';
    if (this.loanDetailsData.delinquent && this.loanDetailsData.delinquent.delinquencyPausePeriods) {
      this.loanDetailsData.delinquent.delinquencyPausePeriods.some((period: DelinquencyPausePeriod) => {
        if (period.active) {
          this.loanDelinquencyClassificationStyle = 'fa fa-stop status-pending';
        }
      });
    }
  }

  undoLoanAction(actionName: string): void {
    actionName = actionName.replace('Undo ', '');
    const undoTransactionAccountDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: this.translateService.instant('labels.heading.Undo Transaction'),
        dialogContext:
          this.translateService.instant('labels.dialogContext.Are you sure you want undo the transaction type') +
          ' ' +
          this.translateService.instant('labels.menus.' + actionName)
      }
    });
    undoTransactionAccountDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        let undoCommand: string = '';
        switch (actionName) {
          case 'Re-Age':
            undoCommand = 'undoReAge';
            break;
          case 'Re-Amortize':
            undoCommand = 'undoReAmortize';
            break;
          case 'Charge-Off':
            undoCommand = 'undo-charge-off';
            break;
        }
        this.loansService.executeLoansAccountTransactionsCommand(String(this.loanId), undoCommand, {}).subscribe(() => {
          this.reload();
        });
      }
    });
  }

  iconLoanStatusColor() {
    if (this.loanDetailsData.chargedOff) {
      return 'loanStatusType.chargeoff';
    }
    return this.loanDetailsData.status.code;
  }

  /**
   * Checks if the loan has LOC details in additionalProperties
   */
  hasLocDetails(): boolean {
    const additionalProperties = this.loanDetailsData.additionalProperties;
    if (!additionalProperties) {
      return false;
    }

    // Check if any LOC-related fields exist in additionalProperties
    return !!(
      additionalProperties.invoiceNo ||
      additionalProperties.invoiceAmount ||
      additionalProperties.lineOfCreditId ||
      additionalProperties.approvedReceivableAmount ||
      additionalProperties.approvedPayableAmount
    );
  }

  /**
   * Delete loan Account
   */
  private deleteLoanAccount() {
    const deleteGuarantorDialogRef = this.dialog.open(DeleteDialogComponent, {
      data: { deleteContext: `with loan id: ${this.loanId}` }
    });
    deleteGuarantorDialogRef.afterClosed().subscribe((response: any) => {
      if (response.delete) {
        this.loansService.deleteLoanAccount(this.loanId).subscribe(() => {
          this.router.navigate(['../../'], { relativeTo: this.route });
        });
      }
    });
  }

  /**
   * Refetches data for the component
   * TODO: Replace by a custom reload component instead of hard-coded back-routing.
   */
  private reload() {
    const clientId = this.clientId;
    const url: string = this.router.url;
    this.router
      .navigateByUrl(`/clients/${clientId}/loans-accounts`, { skipLocationChange: true })
      .then(() => this.router.navigate([url]));
  }

  /** Returns adjusted current balance less any overpaid amount (never below zero) */
  getAdjustedCurrentBalance(): number {
    if (!this.loanDetailsData || !this.loanDetailsData.summary) {
      return 0;
    }
    if (this.loanDetailsData?.multiDisburseLoan) {
      return this.getTotalOutstandingForMultiTranche();
    }

    const totalOutstanding = this.loanDetailsData.summary.totalOutstanding || 0;
    const overPaid = this.loanDetailsData.totalOverpaid || this.loanDetailsData.overPaidAmount || 0;
    if (overPaid > 0 && this.isAnyLineOfCredit()) {
      const adjusted = totalOutstanding - overPaid;
      return adjusted < 0 ? 0 : adjusted;
    }
    return totalOutstanding;
  }

  /** Whether loan is any LOC (receivable/payable) */
  private isAnyLineOfCredit(): boolean {
    const info = this.loanDetailsData;
    if (!info) {
      return false;
    }
    const hasLocId = !!(info.lineOfCreditId || info.additionalProperties?.lineOfCreditId);
    if (!hasLocId) {
      return false;
    }
    const locType = info.locType || info.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE' || locType === 'PAYABLE';
  }

  private getTotalOutstandingForMultiTranche(): number {
    const principalOutstanding = this.getPrincipalOutstandingForMultiTranche();
    // Use unadjusted interest outstanding, we'll apply overpayment to total
    const interestOutstanding = this.loanDetailsData.summary.interestOutstanding || 0;
    const feesOutstanding = this.getDisbursedTrancheFees().feeChargesOutstanding;
    const taxesOutstanding = this.loanDetailsData.summary.taxChargesOutstanding || 0;
    const penaltiesOutstanding = this.loanDetailsData.summary.penaltyChargesOutstanding || 0;

    let totalOutstanding =
      principalOutstanding + interestOutstanding + feesOutstanding + taxesOutstanding + penaltiesOutstanding;

    // Apply overpayment adjustment for LOC loans (similar to getAdjustedTotalOutstanding)
    const overPaid = this.loanDetailsData.totalOverpaid || this.loanDetailsData.overPaidAmount || 0;
    if (overPaid > 0 && this.isAnyLineOfCredit()) {
      totalOutstanding = totalOutstanding - overPaid;
    }

    return Math.max(0, totalOutstanding); // Ensure non-negative
  }

  private getPrincipalOutstandingForMultiTranche(): number {
    if (!this.loanDetailsData?.multiDisburseLoan || !this.loanDetailsData?.summary) {
      return this.loanDetailsData?.summary?.principalOutstanding || 0;
    }

    const disbursedPrincipal = this.getTotalDisbursedPrincipal();
    const paid = this.loanDetailsData.summary.principalPaid || 0;
    const waived = this.loanDetailsData.summary.principalWaived || 0;
    const writtenOff = this.loanDetailsData.summary.principalWrittenOff || 0;

    const outstanding = disbursedPrincipal - paid - waived - writtenOff;
    return Math.max(0, outstanding); // Ensure non-negative
  }
  private getTotalDisbursedPrincipal(): number {
    // If not a multi-disbursal loan, return the standard principalDisbursed value
    if (!this.loanDetailsData?.multiDisburseLoan) {
      return this.loanDetailsData?.summary?.principalDisbursed || 0;
    }

    // For multi-disbursal loans, prefer repaymentSchedule.totalPrincipalDisbursed (calculated by backend)
    // This is more reliable as it's based on actual period data
    // Accept 0 as a valid value (e.g., loan with zero principal disbursed initially)
    if (this.loanDetailsData?.repaymentSchedule?.totalPrincipalDisbursed != null) {
      return this.loanDetailsData.repaymentSchedule.totalPrincipalDisbursed;
    }

    // Fallback: calculate from disbursementDetails if repaymentSchedule total is not available
    if (!this.loanDetailsData?.disbursementDetails || !Array.isArray(this.loanDetailsData.disbursementDetails)) {
      return this.loanDetailsData?.summary?.principalDisbursed || 0;
    }

    // Sum principal amounts only for disbursements that have been actually disbursed
    let totalDisbursed = 0;
    this.loanDetailsData.disbursementDetails.forEach((disbursement: any) => {
      // Only count disbursements that have an actualDisbursementDate
      // Check for null/undefined (not truthiness) to allow zero-principal disbursements
      if (disbursement.actualDisbursementDate && disbursement.principal != null) {
        totalDisbursed += disbursement.principal * 1;
      }
    });

    return totalDisbursed;
  }

  private getDisbursedTrancheFees(): {
    feeChargesCharged: number;
    feeChargesPaid: number;
    feeChargesOutstanding: number;
    feeChargesWaived: number;
    feeChargesWrittenOff: number;
    feeChargesOverdue: number;
  } {
    const result = {
      feeChargesCharged: 0,
      feeChargesPaid: 0,
      feeChargesOutstanding: 0,
      feeChargesWaived: 0,
      feeChargesWrittenOff: 0,
      feeChargesOverdue: 0
    };
    // Only process if it's a multi-disbursal loan with repayment schedule
    if (!this.loanDetailsData?.multiDisburseLoan || !this.loanDetailsData?.repaymentSchedule?.periods) {
      return result;
    }
    const periods = this.loanDetailsData.repaymentSchedule.periods;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Iterate through periods and sum fees only for disbursed tranches
    periods.forEach((period: any) => {
      if (this.isDisbursementPeriodDisbursed(period)) {
        // Use original value when available, fall back to current value (for "Original" column consistency)
        result.feeChargesCharged += period.feeChargesOriginalDue || period.feeChargesDue || 0;
        result.feeChargesPaid += period.feeChargesPaid || 0;
        result.feeChargesOutstanding += period.feeChargesOutstanding || 0;
        result.feeChargesWaived += period.feeChargesWaived || 0;
        result.feeChargesWrittenOff += period.feeChargesWrittenOff || 0;

        // Calculate overdue: if period has outstanding fees and due date has passed
        if (period.feeChargesOutstanding && period.feeChargesOutstanding > 0 && period.dueDate) {
          const dueDate = new Date(period.dueDate[0], period.dueDate[1] - 1, period.dueDate[2]);
          dueDate.setHours(0, 0, 0, 0);
          if (dueDate < today) {
            result.feeChargesOverdue += period.feeChargesOutstanding || 0;
          }
        }
      }
    });
    return result;
  }

  private isDisbursementPeriodDisbursed(period: any): boolean {
    if (!period.status || period.status !== 'DISBURSEMENT') {
      return false;
    }

    if (!this.loanDetailsData) {
      return false;
    }

    // Primary check: Use disbursementDetails if available
    if (this.loanDetailsData.disbursementDetails && Array.isArray(this.loanDetailsData.disbursementDetails)) {
      const periodDueDate = period.dueDate;
      const periodPrincipal = period.principalDisbursed || 0;

      // Find matching disbursementDetail
      const matchingDisbursement = this.loanDetailsData.disbursementDetails.find((disb: any) => {
        const disbursementExpectedDate = disb.expectedDisbursementDate;
        const disbursementPrincipal = disb.principal || 0;
        // Compare dates
        const datesMatch = this.areDateArraysEqual(disbursementExpectedDate, periodDueDate);
        // Compare principal amounts (with small tolerance for floating point)
        const principalMatch = Math.abs(disbursementPrincipal - periodPrincipal) < 0.01;
        return datesMatch && principalMatch;
      });

      // If found and has actualDisbursementDate, it's been disbursed
      if (matchingDisbursement) {
        return !!matchingDisbursement.actualDisbursementDate;
      }
    }

    // Fallback: Check if fees were paid (indicates disbursement occurred)
    // If feeChargesPaid > 0, it's likely been disbursed
    return period.feeChargesPaid && period.feeChargesPaid > 0;
  }

  private areDateArraysEqual(date1: number[] | undefined | null, date2: number[] | undefined | null): boolean {
    if (!date1 || !date2 || date1.length !== 3 || date2.length !== 3) {
      return false;
    }
    return date1[0] === date2[0] && date1[1] === date2[1] && date1[2] === date2[2];
  }
}

export default LoansViewComponent;
