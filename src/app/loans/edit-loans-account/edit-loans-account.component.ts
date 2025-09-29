import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
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
export class EditLoansAccountComponent implements AfterViewInit, OnDestroy {
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
  private principalSyncSub: any;
  private locIdSub: any;
  private invoiceSyncSub: any;

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

  ngAfterViewInit(): void {
    setTimeout(() => this.setupPrincipalInvoiceSync(), 0);
  }

  ngOnDestroy(): void {
    if (this.principalSyncSub) {
      this.principalSyncSub.unsubscribe();
    }
    if (this.locIdSub) {
      this.locIdSub.unsubscribe();
    }
    if (this.invoiceSyncSub) {
      this.invoiceSyncSub.unsubscribe();
    }
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

  /** Sets up subscription to keep invoiceAmount == principalAmount when LOC selected */
  private setupPrincipalInvoiceSync(): void {
    const principalControl = this.loansAccountTermsStep?.loansAccountTermsForm?.get('principalAmount');
    if (principalControl && !this.principalSyncSub) {
      this.principalSyncSub = principalControl.valueChanges.subscribe(() => this.syncInvoiceAmountWithPrincipal());
      this.syncInvoiceAmountWithPrincipal();
    }
    const locControl = this.loansAccountDetailsStep?.loansAccountDetailsForm?.get('lineOfCreditId');
    if (locControl && !this.locIdSub) {
      this.locIdSub = locControl.valueChanges.subscribe(() => this.syncInvoiceAmountWithPrincipal());
    }
    const invoiceControl = this.loansAccountLocDetailsStep?.locDetailsForm?.get('invoiceAmount');
    if (invoiceControl && !this.invoiceSyncSub) {
      this.invoiceSyncSub = invoiceControl.valueChanges.subscribe(() => this.syncPrincipalAmountWithInvoice());
    }
  }

  /** Performs the actual sync under required conditions */
  private syncInvoiceAmountWithPrincipal(): void {
    if (!this.isLocEnabled) {
      return;
    }
    const locId = this.loansAccountDetailsStep?.loansAccountDetailsForm?.get('lineOfCreditId')?.value;
    if (!locId) {
      return;
    }
    const principalVal = this.loansAccountTermsStep?.loansAccountTermsForm?.get('principalAmount')?.value;
    const invoiceControl = this.loansAccountLocDetailsStep?.locDetailsForm?.get('invoiceAmount');
    if (invoiceControl == null || principalVal == null) {
      return;
    }
    // Only sync if values are actually different and both are meaningful values
    if (invoiceControl.value !== principalVal && principalVal > 0) {
      invoiceControl.setValue(principalVal, { emitEvent: false });

      // Manually trigger approved amount recalculations after setting invoice amount
      this.triggerApprovedAmountCalculations();
    }
    if (!this.invoiceSyncSub && invoiceControl) {
      this.invoiceSyncSub = invoiceControl.valueChanges.subscribe(() => this.syncPrincipalAmountWithInvoice());
    }
  }

  private syncPrincipalAmountWithInvoice(): void {
    if (!this.isLocEnabled) {
      return;
    }
    const locId = this.loansAccountDetailsStep?.loansAccountDetailsForm?.get('lineOfCreditId')?.value;
    if (!locId) {
      return;
    }
    const invoiceVal = this.loansAccountLocDetailsStep?.locDetailsForm?.get('invoiceAmount')?.value;
    const principalControl = this.loansAccountTermsStep?.loansAccountTermsForm?.get('principalAmount');
    if (principalControl == null || invoiceVal == null) {
      return;
    }
    // Only sync if values are actually different and both are meaningful values
    if (principalControl.value !== invoiceVal && invoiceVal > 0) {
      principalControl.setValue(invoiceVal, { emitEvent: false });
      this.triggerApprovedAmountCalculations();
    }
  }

  /** Manually triggers approved amount calculations in the LOC details component */
  private triggerApprovedAmountCalculations(): void {
    if (this.loansAccountLocDetailsStep) {
      // Only trigger calculations if the LOC details form is properly initialized
      // and has meaningful invoice amount value
      const invoiceAmount = this.loansAccountLocDetailsStep.locDetailsForm?.get('invoiceAmount')?.value;
      if (invoiceAmount != null && invoiceAmount > 0) {
        // Call the public calculation methods directly
        this.loansAccountLocDetailsStep.updateApprovedReceivableAmount();
        this.loansAccountLocDetailsStep.updateApprovedPayableAmount();
      }
    }
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

    // Include LOC details flattened at root level if LOC is enabled
    if (this.isLocEnabled && this.loansAccountLocDetailsStep) {
      const locDetails = this.loansAccountLocDetailsStep.locDetails;
      // Flatten all LOC fields to root level
      Object.assign(baseData, locDetails);

      // For LOC products, include tenorDays from loan term frequency if it's in days
      const locId = this.loansAccountDetailsStep?.loansAccountDetailsForm?.get('lineOfCreditId')?.value;
      if (locId && this.isLocProductEnabled()) {
        const loanTerm = baseData.loanTermFrequency;
        const termFrequencyType = baseData.loanTermFrequencyType;

        // Check if frequency type is days
        const isTermInDays = this.isDaysFrequencyType(termFrequencyType);

        if (loanTerm && isTermInDays) {
          // Ensure additionalProperties exists
          if (!baseData.additionalProperties) {
            baseData.additionalProperties = {};
          }
          baseData.additionalProperties.tenorDays = loanTerm;
        }
      }
    }

    return baseData;
  }

  /**
   * Submits Data to create loan account
   */
  submit() {
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const loanType = 'individual';
    const loansAccountData = {
      ...this.loansAccount,
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

  /**
   * Checks if LOC product is enabled
   */
  private isLocProductEnabled(): boolean {
    return !!(
      this.loansAccountProductTemplate?.additionalProperties?.isLocEnabled ||
      this.loansAccountAndTemplate?.additionalProperties?.isLocEnabled ||
      this.isLocEnabled
    );
  }

  /**
   * Checks if the given frequency type ID corresponds to days
   */
  private isDaysFrequencyType(frequencyTypeId: number): boolean {
    if (!this.loansAccountProductTemplate?.termFrequencyTypeOptions) {
      return false;
    }

    const frequencyType = this.loansAccountProductTemplate.termFrequencyTypeOptions.find(
      (option: any) => option.id === frequencyTypeId
    );

    return !!(frequencyType && (frequencyType.code === 'DAYS' || frequencyType.value === 'Days'));
  }
}
