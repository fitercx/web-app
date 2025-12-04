import { Component, Input, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { Currency } from 'app/shared/models/general.model';
import { ClientsService } from 'app/clients/clients.service';

@Component({
  selector: 'mifosx-disburse-to-savings-account',
  templateUrl: './disburse-to-savings-account.component.html',
  styleUrls: ['./disburse-to-savings-account.component.scss']
})
export class DisburseToSavingsAccountComponent implements OnInit {
  @Input() dataObject: any;

  /** Minimum Date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed. */
  maxDate = new Date();
  /** Disbursement Loan form. */
  disbursementForm: UntypedFormGroup;
  /** Full Loan Details Data */
  loanDetailsData: any;
  currency: Currency;
  /** Eligible Savings Accounts */
  eligibleSavingsAccounts: any[] = [];
  /** Loading state for savings accounts */
  isLoadingSavingsAccounts = false;

  /**
   * Get data from `Resolver`.
   * @param {FormBuilder} formBuilder FormBuilder.
   * @param {ActivatedRoute} route ActivatedRoute.
   * @param {Router} router Router.
   * @param {LoansService} loanService Loan Service.
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private dateUtils: Dates,
    private loanService: LoansService,
    private settingsService: SettingsService,
    private clientsService: ClientsService
  ) {}

  ngOnInit() {
    this.maxDate = this.settingsService.businessDate;

    if (this.dataObject?.currency) {
      this.currency = this.dataObject.currency;
    }

    // Build form once so user input isn't lost when async data arrives
    this.setDisbursementToSavingsForm();

    const loanId = this.route.snapshot.params['loanId'];
    this.loanService.getLoanAccountAssociationDetails(loanId).subscribe((loanDetails: any) => {
      this.loanDetailsData = loanDetails;
      // Only perform LOC-specific adjustments; do NOT rebuild the form.
      if (this.isLineOfCreditReceivable()) {
        this.disbursementForm.get('transactionAmount')?.disable();
      }
      // Fetch and filter eligible savings accounts
      this.fetchEligibleSavingsAccounts(loanDetails);
    });
  }

  /**
   * Set Disbursement Loan form.
   * Preserves existing user-selected date if already chosen.
   */
  setDisbursementToSavingsForm() {
    const existingDate = this.disbursementForm?.get('actualDisbursementDate')?.value;
    const providedDate = this.dataObject?.actualDisbursementDate; // may come pre-populated

    let initialDate: Date;
    if (existingDate instanceof Date) {
      initialDate = existingDate;
    } else if (typeof existingDate === 'string' && existingDate) {
      // attempt to parse previously entered string
      const parsed = new Date(existingDate);
      initialDate = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else if (providedDate) {
      const parsedProvided = new Date(providedDate);
      initialDate = isNaN(parsedProvided.getTime()) ? new Date() : parsedProvided;
    } else {
      initialDate = new Date();
    }

    const existingNote = this.disbursementForm?.get('note')?.value || '';
    const existingDestinationAccount = this.disbursementForm?.get('destinationSavingsAccountId')?.value || '';

    this.disbursementForm = this.formBuilder.group({
      actualDisbursementDate: [
        initialDate,
        Validators.required
      ],
      transactionAmount: [
        this.dataObject?.amount,
        Validators.required
      ],
      destinationSavingsAccountId: [existingDestinationAccount],
      note: [existingNote]
    });

    if (this.dataObject?.fixedEmiAmount) {
      if (!this.disbursementForm.get('fixedEmiAmount')) {
        this.disbursementForm.addControl(
          'fixedEmiAmount',
          new UntypedFormControl(this.dataObject.fixedEmiAmount, [Validators.required])
        );
      } else {
        this.disbursementForm.get('fixedEmiAmount')?.setValue(this.dataObject.fixedEmiAmount);
      }
    }

    // Disable amount field for LOC receivable loans
    if (this.isLineOfCreditReceivable()) {
      this.disbursementForm.get('transactionAmount')?.disable();
    }
  }

  /**
   * Submit Disburse Form.
   */
  submit() {
    // Get all form values including disabled fields
    const disbursementLoanFormData = this.disbursementForm.getRawValue();
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    let chosenDate = disbursementLoanFormData.actualDisbursementDate;

    if (chosenDate && !(chosenDate instanceof Date)) {
      chosenDate = new Date(chosenDate);
    }

    if (chosenDate instanceof Date && !isNaN(chosenDate.getTime())) {
      disbursementLoanFormData.actualDisbursementDate = this.dateUtils.formatDate(chosenDate, dateFormat);
    }

    const data = {
      ...disbursementLoanFormData,
      dateFormat,
      locale,
      transactionAmount: disbursementLoanFormData.transactionAmount * 1
    };

    // Only include destinationSavingsAccountId if it's provided
    if (disbursementLoanFormData.destinationSavingsAccountId) {
      data['destinationSavingsAccountId'] = disbursementLoanFormData.destinationSavingsAccountId;
    }

    const loanId = this.route.snapshot.params['loanId'];
    this.loanService.loanActionButtons(loanId, 'disbursetosavings', data).subscribe(() => {
      this.router.navigate(['../../general'], { relativeTo: this.route });
    });
  }

  /**
   * Checks if the loan is a Line of Credit Receivable loan
   */
  isLineOfCreditReceivable(): boolean {
    const loanInfo = this.loanDetailsData || this.dataObject;
    if (!loanInfo) {
      return false;
    }
    const hasLineOfCredit = !!(loanInfo.lineOfCreditId || loanInfo.additionalProperties?.lineOfCreditId);
    if (!hasLineOfCredit) {
      return false;
    }
    const locType = loanInfo.locType || loanInfo.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE';
  }

  /**
   * Fetches and filters eligible savings accounts for the borrower
   */
  fetchEligibleSavingsAccounts(loanDetails: any): void {
    const clientId = loanDetails?.clientId;
    const groupId = loanDetails?.groupId;

    // Need either clientId or groupId to fetch accounts
    if (!clientId && !groupId) {
      this.eligibleSavingsAccounts = [];
      return;
    }

    this.isLoadingSavingsAccounts = true;

    // For now, we only support client loans. Group loans would need a different endpoint
    if (clientId) {
      this.clientsService.getClientAccountData(clientId.toString()).subscribe({
        next: (clientAccounts: any) => {
          this.eligibleSavingsAccounts = this.filterEligibleSavingsAccounts(
            clientAccounts?.savingsAccounts || [],
            loanDetails
          );
          this.isLoadingSavingsAccounts = false;

          // Auto-select if only one eligible account
          if (this.eligibleSavingsAccounts.length === 1) {
            this.disbursementForm.patchValue({
              destinationSavingsAccountId: this.eligibleSavingsAccounts[0].id
            });
          }
        },
        error: (error) => {
          console.error('Error fetching client accounts:', error);
          this.eligibleSavingsAccounts = [];
          this.isLoadingSavingsAccounts = false;
        }
      });
    } else {
      // Group loans - would need groups/{groupId}/accounts endpoint if available
      this.eligibleSavingsAccounts = [];
      this.isLoadingSavingsAccounts = false;
    }
  }

  /**
   * Filters savings accounts based on eligibility criteria:
   * - Status: Must be active
   * - SubStatus: Must not be blocked, inactive, dormant, or escheat
   * - Currency: Must match loan currency
   */
  filterEligibleSavingsAccounts(savingsAccounts: any[], loanDetails: any): any[] {
    if (!savingsAccounts || savingsAccounts.length === 0) {
      return [];
    }

    const loanCurrencyCode = loanDetails?.currency?.code;

    return savingsAccounts.filter((account: any) => {
      // Filter by status - must be active
      const status = account?.status;
      if (!status || !status.active) {
        return false;
      }

      // Filter by subStatus - exclude blocked, inactive, dormant, or escheat accounts
      const subStatus = account?.subStatus;
      if (subStatus) {
        if (
          subStatus.block === true ||
          subStatus.blockCredit === true ||
          subStatus.blockDebit === true ||
          subStatus.inactive === true ||
          subStatus.dormant === true ||
          subStatus.escheat === true
        ) {
          return false;
        }
      }

      // Filter by currency - must match loan currency
      if (loanCurrencyCode) {
        const accountCurrencyCode = account?.currency?.code;
        if (accountCurrencyCode && accountCurrencyCode !== loanCurrencyCode) {
          return false;
        }
      }

      return true;
    });
  }
}
