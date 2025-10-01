import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoansService } from '../loans.service';
import { LoansAccountDetailsStepComponent } from '../loans-account-stepper/loans-account-details-step/loans-account-details-step.component';
import { LoansAccountTermsStepComponent } from '../loans-account-stepper/loans-account-terms-step/loans-account-terms-step.component';
import { LoansAccountChargesStepComponent } from '../loans-account-stepper/loans-account-charges-step/loans-account-charges-step.component';
import { LoansAccountLocDetailsStepComponent } from '../loans-account-stepper/loans-account-loc-details-step/loans-account-loc-details-step.component';

/** Custom Services */
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';

/**
 * Edit Loans
 */
@Component({
  selector: 'mifosx-edit-loans-account',
  templateUrl: './edit-loans-account.component.html',
  styleUrls: ['./edit-loans-account.component.scss']
})
export class EditLoansAccountComponent {
  @ViewChild(LoansAccountDetailsStepComponent, { static: true })
  loansAccountDetailsStep: LoansAccountDetailsStepComponent;
  @ViewChild(LoansAccountTermsStepComponent, { static: true }) loansAccountTermsStep: LoansAccountTermsStepComponent;
  @ViewChild(LoansAccountChargesStepComponent, { static: true })
  loansAccountChargesStep: LoansAccountChargesStepComponent;
  @ViewChild(LoansAccountLocDetailsStepComponent, { static: false })
  loansAccountLocDetailsStep: LoansAccountLocDetailsStepComponent;

  loansAccountAndTemplate: any;
  /** Loans Account Product Template */
  loansAccountProductTemplate: any;
  /** Collateral Options */
  collateralOptions: any;
  /** Loan Id */
  loanId: any;
  /** Currency Code */
  currencyCode: string;
  /** Available Currencies */
  currencies: any[] = [];
  /** Subscriptions */

  /**
   * Sets loans account edit form.
   * @param {route} ActivatedRoute Activated Route.
   * @param {router} Router Router.
   * @param {Dates} dateUtils Date Utils
   * @param {loansService} LoansService Loans Service
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dateUtils: Dates,
    private loansService: LoansService,
    private settingsService: SettingsService
  ) {
    this.route.data.subscribe((data: { loansAccountAndTemplate: any; currencies: any }) => {
      this.loansAccountAndTemplate = data.loansAccountAndTemplate;
      this.currencies = data.currencies ? data.currencies.selectedCurrencyOptions || [] : [];
    });
    this.loanId = this.route.snapshot.params['loanId'];
  }

  /**
   * Sets loans account product template and collateral template
   * @param {any} $event API response
   */
  setTemplate($event: any) {
    this.loansAccountProductTemplate = $event;
    this.currencyCode = this.loansAccountProductTemplate.currency.code;
    if (this.loansAccountProductTemplate.loanProductId) {
      this.loansService
        .getLoansCollateralTemplateResource(this.loansAccountProductTemplate.loanProductId)
        .subscribe((response: any) => {
          this.collateralOptions = response.loanCollateralOptions;
        });
    }
  }

  /** Get Loans Account Details Form Data */
  get loansAccountDetailsForm() {
    return this.loansAccountDetailsStep.loansAccountDetailsForm;
  }

  /** Get Loans Account Terms Form Data */
  get loansAccountTermsForm() {
    return this.loansAccountTermsStep.loansAccountTermsForm;
  }

  /** Get LOC Details Form Data */
  get locDetailsForm() {
    return this.loansAccountLocDetailsStep?.locDetailsForm;
  }

  /** Check if LOC is enabled */
  get isLocEnabled(): boolean {
    return this.loansAccountDetailsStep?.isLocEnabled || false;
  }

  /** Checks wheter all the forms in different steps are valid and not pristine */
  get loansAccountFormValidAndNotPristine() {
    // For edit mode, we only need the forms to be valid, not necessarily pristine
    const isEditMode = !!this.loanId;

    const detailsValid = this.loansAccountDetailsForm.valid;
    const termsValid = this.loansAccountTermsForm.valid;

    // Check LOC details form if LOC is enabled
    let locDetailsValid = true;
    if (this.isLocEnabled && this.locDetailsForm) {
      locDetailsValid = this.locDetailsForm.valid;
    }

    if (isEditMode) {
      return detailsValid && termsValid && locDetailsValid;
    }

    // For create mode, check if forms are valid and not pristine
    return (
      detailsValid &&
      termsValid &&
      locDetailsValid &&
      (!this.loansAccountDetailsForm.pristine ||
        !this.loansAccountTermsForm.pristine ||
        !this.loansAccountTermsStep.pristine ||
        !this.loansAccountChargesStep.pristine)
    );
  }

  /** Retrieves Data of all forms except Currency to submit the data */
  get loansAccount() {
    const baseData = {
      ...this.loansAccountDetailsStep.loansAccountDetails,
      ...this.loansAccountTermsStep.loansAccountTerms,
      ...this.loansAccountChargesStep.loansAccountCharges,
      ...this.loansAccountTermsStep.loanCollateral,
      ...this.loansAccountTermsStep.disbursementData
    };

    // Include LOC details flattened at root level if LOC is enabled and has meaningful data
    if (this.isLocEnabled && this.loansAccountLocDetailsStep) {
      const locDetails = this.loansAccountLocDetailsStep.locDetails;

      // Include all LOC details for preview display (locType will be filtered out later for API submission)
      const filteredLocDetails = this.filterEmptyValues(locDetails);

      // Only flatten LOC details if there are actually meaningful values
      if (Object.keys(filteredLocDetails).length > 0) {
        Object.assign(baseData, filteredLocDetails);
      }

      // For LOC loans, use the approved facility amount as principal
      const locId = this.loansAccountDetailsStep?.loansAccountDetailsForm?.get('lineOfCreditId')?.value;
      if (locId) {
        // Determine which approved amount to use based on LOC type
        const approvedReceivableAmount = filteredLocDetails.approvedReceivableAmount;
        const approvedPayableAmount = filteredLocDetails.amountInFacilityCurrency;
        const isReceivableType = filteredLocDetails.locType === 'RECEIVABLE';

        // Use the appropriate approved facility amount as principal
        if (approvedReceivableAmount != null && approvedReceivableAmount > 0 && isReceivableType) {
          baseData.principalAmount = approvedReceivableAmount;
        } else if (approvedPayableAmount != null && approvedPayableAmount > 0 && !isReceivableType) {
          baseData.principalAmount = approvedPayableAmount;
        }
      }
    }

    return baseData;
  }

  /**
   * Filters out empty, null, undefined values and empty strings from an object
   */
  private filterEmptyValues(obj: any): any {
    const filtered: any = {};

    for (const [
      key,
      value
    ] of Object.entries(obj)) {
      // Include the value if it's meaningful (not empty, null, or undefined)
      if (value !== null && value !== undefined && value !== '') {
        // For numbers, include even if 0
        if (typeof value === 'number') {
          filtered[key] = value;
        }
        // For strings, include only if not empty
        else if (typeof value === 'string' && value.trim() !== '') {
          filtered[key] = value;
        }
        // For other types (dates, booleans, objects), include as is
        else if (typeof value !== 'string') {
          filtered[key] = value;
        }
      }
    }

    return filtered;
  }

  /**
   * Submits Data to create loan account
   */
  submit() {
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const loanType = 'individual';

    // Remove preview-specific fields that shouldn't be submitted to API
    const { locType, buyerSupplierOptions, ...loansAccountForSubmission } = this.loansAccount;

    const loansAccountData = {
      ...loansAccountForSubmission,
      clientId: this.loansAccountAndTemplate.clientId,
      charges: this.loansAccount.charges.map((charge: any) => ({
        chargeId: charge.id,
        amount: charge.amount,
        dueDate: charge.dueDate && this.dateUtils.formatDate(charge.dueDate, dateFormat)
      })),
      collateral: this.loansAccount.collateral.map((collateralEle: any) => ({
        type: collateralEle.type,
        value: collateralEle.value,
        description: collateralEle.description
      })),
      disbursementData: this.loansAccount.disbursementData.map((item: any) => ({
        expectedDisbursementDate: this.dateUtils.formatDate(item.expectedDisbursementDate, dateFormat),
        principal: item.principal
      })),
      interestChargedFromDate: this.dateUtils.formatDate(this.loansAccount.interestChargedFromDate, dateFormat),
      repaymentsStartingFromDate: this.dateUtils.formatDate(this.loansAccount.repaymentsStartingFromDate, dateFormat),
      submittedOnDate: this.dateUtils.formatDate(this.loansAccount.submittedOnDate, dateFormat),
      expectedDisbursementDate: this.dateUtils.formatDate(this.loansAccount.expectedDisbursementDate, dateFormat),
      dateFormat,
      locale,
      loanType
    };
    delete loansAccountData.isValid;
    if (loansAccountData.syncRepaymentsWithMeeting) {
      loansAccountData.calendarId = this.loansAccountProductTemplate.calendarOptions[0].id;
      delete loansAccountData.syncRepaymentsWithMeeting;
    }

    if (loansAccountData.recalculationRestFrequencyDate) {
      loansAccountData.recalculationRestFrequencyDate = this.dateUtils.formatDate(
        this.loansAccount.recalculationRestFrequencyDate,
        dateFormat
      );
    }

    if (loansAccountData.interestCalculationPeriodType === 0) {
      loansAccountData.allowPartialPeriodInterestCalculation = false;
    }
    if (
      !loansAccountData.isLoanProductLinkedToFloatingRate ||
      loansAccountData.isLoanProductLinkedToFloatingRate === false
    ) {
      delete loansAccountData.isFloatingInterestRate;
    }
    loansAccountData.principal = loansAccountData.principalAmount;
    delete loansAccountData.principalAmount;
    delete loansAccountData.multiDisburseLoan;

    // In Fineract, the POST and PUT endpoints for /v1/loans have a typo in the field
    // allowPartialPeriodInterestCalculation. Until that is fixed, we need to replace the field name in the payload.
    loansAccountData.allowPartialPeriodInterestCalcualtion = loansAccountData.allowPartialPeriodInterestCalculation;
    delete loansAccountData.allowPartialPeriodInterestCalculation;

    // Handle LOC Details fields (they come flattened at root level)
    if (loansAccountData.invoiceDate) {
      loansAccountData.invoiceDate = this.dateUtils.formatDate(loansAccountData.invoiceDate, dateFormat);
    }
    if (loansAccountData.invoiceDueDate) {
      loansAccountData.invoiceDueDate = this.dateUtils.formatDate(loansAccountData.invoiceDueDate, dateFormat);
    }

    this.loansService.updateLoansAccount(this.loanId, loansAccountData).subscribe((response: any) => {
      this.router.navigate(['../'], { relativeTo: this.route });
    });
  }
}
