/** Angular Imports */
import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from '@angular/forms';

/** Custom Services */
import { SettingsService } from 'app/settings/settings.service';

/**
 * Loans Account LOC Details Step
 */
@Component({
  selector: 'mifosx-loans-account-loc-details-step',
  templateUrl: './loans-account-loc-details-step.component.html',
  styleUrls: ['./loans-account-loc-details-step.component.scss']
})
export class LoansAccountLocDetailsStepComponent implements OnInit, OnChanges {
  /** Loans Account Template */
  @Input() loansAccountTemplate: any;
  /** Loans Account Product Template */
  @Input() loansAccountProductTemplate: any;
  /** LOC Options */
  @Input() locOptions: any;
  /** Available Currencies from resolver */
  @Input() currencies: any[] = [];
  /** Loan ID for edit mode */
  @Input() loanId: any;
  /** Selected LOC ID */
  @Input() selectedLocId: any;

  /** LOC Details Form */
  locDetailsForm: UntypedFormGroup;

  /** Currency Options */
  currencyOptions: any[] = [];

  /** Minimum date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum date allowed. */
  maxDate = new Date(2100, 0, 1);

  /**
   * @param {UntypedFormBuilder} formBuilder Form Builder
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private settingsService: SettingsService
  ) {
    this.createLocDetailsForm();
  }

  ngOnInit() {
    this.maxDate = this.settingsService.maxFutureDate || this.maxDate;

    // Set currency options from the loan product template or loan account template
    this.setCurrencyOptions();

    // For edit mode, populate form with existing LOC data from additionalProperties
    if (this.loansAccountTemplate) {
      let locData = null;

      // Check for LOC data in additionalProperties (edit mode)
      if (this.loansAccountTemplate.additionalProperties) {
        locData = this.loansAccountTemplate.additionalProperties;
      }
      // Fallback to locDetails (legacy or create mode)
      else if (this.loansAccountTemplate.locDetails) {
        locData = this.loansAccountTemplate.locDetails;
      }

      if (locData) {
        console.log('LOC Edit Debug - Raw locData:', locData);
        console.log('LOC Edit Debug - lineOfCreditId:', locData.lineOfCreditId);
        console.log('LOC Edit Debug - locOptions:', this.locOptions);

        // Parse dates if they exist as arrays [year, month, day] from backend
        const formData: any = { ...locData };

        if (formData.invoiceDate && Array.isArray(formData.invoiceDate)) {
          // Convert [2025, 9, 20] to Date object (month is 0-based in JavaScript)
          formData.invoiceDate = new Date(
            formData.invoiceDate[0],
            formData.invoiceDate[1] - 1,
            formData.invoiceDate[2]
          );
        } else if (formData.invoiceDate && typeof formData.invoiceDate === 'string') {
          formData.invoiceDate = new Date(formData.invoiceDate);
        }

        if (formData.invoiceDueDate && Array.isArray(formData.invoiceDueDate)) {
          // Convert [2025, 9, 20] to Date object (month is 0-based in JavaScript)
          formData.invoiceDueDate = new Date(
            formData.invoiceDueDate[0],
            formData.invoiceDueDate[1] - 1,
            formData.invoiceDueDate[2]
          );
        } else if (formData.invoiceDueDate && typeof formData.invoiceDueDate === 'string') {
          formData.invoiceDueDate = new Date(formData.invoiceDueDate);
        }

        // Set the lineOfCreditId in the parent form if it exists in additionalProperties
        if (formData.lineOfCreditId && this.loansAccountTemplate.lineOfCreditId === undefined) {
          this.loansAccountTemplate.lineOfCreditId = formData.lineOfCreditId;
        }

        console.log('LOC Edit Debug - Processed formData:', formData);
        console.log('LOC Edit Debug - isReceivableType:', this.isReceivableType);
        console.log('LOC Edit Debug - isPayableType:', this.isPayableType);

        this.locDetailsForm.patchValue(formData);

        // Update form validators based on LOC type after patching
        this.updateFormValidators();

        // Trigger computed field calculations after patching values
        this.calculateComputedFields();
      }
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // Update currency options when the loan product template changes
    if (changes['loansAccountProductTemplate'] || changes['loansAccountTemplate']) {
      this.setCurrencyOptions();

      // If currency options changed and we have a selected currency, set default
      if (this.currencyOptions.length === 1 && this.locDetailsForm) {
        this.locDetailsForm.get('invoiceCurrency')?.setValue(this.currencyOptions[0].code);
      }
    }

    // Update form validators when LOC selection changes
    if (changes['selectedLocId'] || changes['locOptions']) {
      this.updateFormValidators();
    }
  }

  /**
   * Sets currency options from available sources
   */
  setCurrencyOptions() {
    // Use the currencies from the resolver as the primary source
    if (this.currencies && this.currencies.length > 0) {
      this.currencyOptions = this.currencies;
    } else if (this.loansAccountProductTemplate?.currency) {
      // Fallback to loan product currency if resolver currencies aren't available
      this.currencyOptions = [this.loansAccountProductTemplate.currency];
    } else if (this.loansAccountTemplate?.currencyOptions) {
      // Final fallback to template currency options
      this.currencyOptions = this.loansAccountTemplate.currencyOptions;
    } else {
      // Empty array if no currency options are available
      this.currencyOptions = [];
    }
  }

  /**
   * Creates the LOC Details form with Invoice Details
   */
  createLocDetailsForm() {
    this.locDetailsForm = this.formBuilder.group({
      // Invoice Details
      invoiceNo: [
        '',
        Validators.required
      ],
      invoiceDate: [
        '',
        Validators.required
      ],
      invoiceDueDate: [
        '',
        Validators.required
      ],
      invoiceAmount: [
        '',
        [
          Validators.required,
          Validators.min(0)]
      ],
      invoiceCurrency: [
        '',
        Validators.required
      ],

      // Shared fields
      disapprovedAmount: [
        '',
        [Validators.min(0)]
      ],

      // Receivable-specific fields
      approvedReceivableAmount: [{ value: '', disabled: true }], // Computed field
      advancePercentage: [
        '',
        [
          Validators.min(0),
          Validators.max(100)]
      ],
      amountAfterAdvance: [{ value: '', disabled: true }], // Computed field
      buyerDetails: [''],

      // Payable-specific fields
      exchangeRate: [
        '',
        [Validators.min(0.01)]
      ],
      markup: [
        '',
        [Validators.min(0)]
      ],
      amountInFacilityCurrency: [{ value: '', disabled: true }], // Computed field
      approvedPayableAmount: [{ value: '', disabled: true }], // Computed field
      supplierDetails: ['']
    });

    // Set up value change listeners for computed fields
    this.setupComputedFields();
  }

  /**
   * Updates form validators based on LOC type
   */
  updateFormValidators() {
    if (this.isReceivableType) {
      // Make shared and receivable fields required for RECEIVABLE type LOCs
      this.locDetailsForm.get('disapprovedAmount')?.setValidators([
        Validators.required,
        Validators.min(0)]);
      this.locDetailsForm.get('advancePercentage')?.setValidators([
        Validators.required,
        Validators.min(0),
        Validators.max(100)]);
      this.locDetailsForm.get('buyerDetails')?.setValidators([Validators.required]);

      // Remove payable validators
      this.locDetailsForm.get('exchangeRate')?.setValidators([Validators.min(0.01)]);
      this.locDetailsForm.get('markup')?.setValidators([Validators.min(0)]);
      this.locDetailsForm.get('supplierDetails')?.setValidators([]);
    } else if (this.isPayableType) {
      // Make shared and payable fields required for PAYABLE type LOCs
      this.locDetailsForm.get('disapprovedAmount')?.setValidators([
        Validators.required,
        Validators.min(0)]);
      this.locDetailsForm.get('exchangeRate')?.setValidators([
        Validators.required,
        Validators.min(0.01)]);
      this.locDetailsForm.get('markup')?.setValidators([
        Validators.required,
        Validators.min(0)]);
      this.locDetailsForm.get('supplierDetails')?.setValidators([Validators.required]);

      // Remove receivable validators
      this.locDetailsForm.get('advancePercentage')?.setValidators([
        Validators.min(0),
        Validators.max(100)]);
      this.locDetailsForm.get('buyerDetails')?.setValidators([]);
    } else {
      // Remove all required validators for other LOC types
      this.locDetailsForm.get('disapprovedAmount')?.setValidators([Validators.min(0)]);
      this.locDetailsForm.get('advancePercentage')?.setValidators([
        Validators.min(0),
        Validators.max(100)]);
      this.locDetailsForm.get('buyerDetails')?.setValidators([]);
      this.locDetailsForm.get('exchangeRate')?.setValidators([Validators.min(0.01)]);
      this.locDetailsForm.get('markup')?.setValidators([Validators.min(0)]);
      this.locDetailsForm.get('supplierDetails')?.setValidators([]);
    }

    // Update validity for all fields
    this.locDetailsForm.get('disapprovedAmount')?.updateValueAndValidity();
    this.locDetailsForm.get('advancePercentage')?.updateValueAndValidity();
    this.locDetailsForm.get('buyerDetails')?.updateValueAndValidity();
    this.locDetailsForm.get('exchangeRate')?.updateValueAndValidity();
    this.locDetailsForm.get('markup')?.updateValueAndValidity();
    this.locDetailsForm.get('supplierDetails')?.updateValueAndValidity();
  }

  /**
   * Sets up listeners for computed fields
   */
  setupComputedFields() {
    // Listen to invoice amount and disapproved amount changes to compute approved amounts
    this.locDetailsForm.get('invoiceAmount')?.valueChanges.subscribe(() => {
      this.updateApprovedReceivableAmount();
      this.updateApprovedPayableAmount();
    });

    this.locDetailsForm.get('disapprovedAmount')?.valueChanges.subscribe(() => {
      this.updateApprovedReceivableAmount();
      this.updateApprovedPayableAmount();
    });

    // Listen to approved receivable amount and advance percentage changes to compute amount after advance
    this.locDetailsForm.get('advancePercentage')?.valueChanges.subscribe(() => {
      this.updateAmountAfterAdvance();
    });

    // Listen to exchange rate and markup changes for payable calculations
    this.locDetailsForm.get('exchangeRate')?.valueChanges.subscribe(() => {
      this.updateAmountInFacilityCurrency();
    });

    this.locDetailsForm.get('markup')?.valueChanges.subscribe(() => {
      this.updateAmountInFacilityCurrency();
    });
  }

  /**
   * Updates the approved receivable amount (Invoice Amount - Disapproved Amount)
   */
  updateApprovedReceivableAmount() {
    const invoiceAmount = this.locDetailsForm.get('invoiceAmount')?.value || 0;
    const disapprovedAmount = this.locDetailsForm.get('disapprovedAmount')?.value || 0;
    const approvedAmount = invoiceAmount - disapprovedAmount;

    this.locDetailsForm.get('approvedReceivableAmount')?.setValue(approvedAmount >= 0 ? approvedAmount : 0);

    // Also update amount after advance when approved amount changes
    this.updateAmountAfterAdvance();
  }

  /**
   * Updates the approved payable amount (Invoice Amount - Disapproved Amount)
   */
  updateApprovedPayableAmount() {
    const invoiceAmount = this.locDetailsForm.get('invoiceAmount')?.value || 0;
    const disapprovedAmount = this.locDetailsForm.get('disapprovedAmount')?.value || 0;
    const approvedAmount = invoiceAmount - disapprovedAmount;

    this.locDetailsForm.get('approvedPayableAmount')?.setValue(approvedAmount >= 0 ? approvedAmount : 0);
  }

  /**
   * Updates the amount after advance (Advance % of Approved Receivable Amount)
   */
  updateAmountAfterAdvance() {
    const approvedAmount = this.locDetailsForm.get('approvedReceivableAmount')?.value || 0;
    const advancePercentage = this.locDetailsForm.get('advancePercentage')?.value || 0;
    const amountAfterAdvance = (approvedAmount * advancePercentage) / 100;

    this.locDetailsForm.get('amountAfterAdvance')?.setValue(amountAfterAdvance);
  }

  /**
   * Updates the amount in facility currency (Invoice Amount * (Exchange Rate + Markup))
   */
  updateAmountInFacilityCurrency() {
    const invoiceAmount = this.locDetailsForm.get('invoiceAmount')?.value || 0;
    const exchangeRate = this.locDetailsForm.get('exchangeRate')?.value || 0;
    const markup = this.locDetailsForm.get('markup')?.value || 0;
    const amountInFacilityCurrency = invoiceAmount * (exchangeRate + markup);

    this.locDetailsForm.get('amountInFacilityCurrency')?.setValue(amountInFacilityCurrency);
  }

  /**
   * Triggers calculation of all computed fields
   */
  calculateComputedFields() {
    this.updateApprovedReceivableAmount();
    this.updateApprovedPayableAmount();
    this.updateAmountAfterAdvance();
    this.updateAmountInFacilityCurrency();
  }

  /**
   * Checks if the selected LOC type is receivable
   */
  get isReceivableType(): boolean {
    // In edit mode, get LOC ID from additionalProperties, then from selectedLocId input, then from template
    let locId: number | null = null;

    if (this.loansAccountTemplate?.additionalProperties?.lineOfCreditId) {
      locId = this.loansAccountTemplate.additionalProperties.lineOfCreditId;
    } else if (this.selectedLocId) {
      locId = this.selectedLocId;
    } else if (this.loansAccountTemplate?.lineOfCreditId) {
      locId = this.loansAccountTemplate.lineOfCreditId;
    }

    console.log('LOC Type Debug - isReceivableType - locId:', locId);
    console.log('LOC Type Debug - isReceivableType - locOptions:', this.locOptions);

    // Find the selected LOC from the available options
    if (this.locOptions && locId) {
      const selectedLoc = this.locOptions.find((loc: any) => loc.id === locId);
      console.log('LOC Type Debug - isReceivableType - selectedLoc:', selectedLoc);
      const isReceivable = selectedLoc?.productType === 'RECEIVABLE';
      console.log('LOC Type Debug - isReceivableType - result:', isReceivable);
      return isReceivable;
    }

    return false;
  }

  /**
   * Checks if the selected LOC type is payable
   */
  get isPayableType(): boolean {
    // In edit mode, get LOC ID from additionalProperties, then from selectedLocId input, then from template
    let locId: number | null = null;

    if (this.loansAccountTemplate?.additionalProperties?.lineOfCreditId) {
      locId = this.loansAccountTemplate.additionalProperties.lineOfCreditId;
    } else if (this.selectedLocId) {
      locId = this.selectedLocId;
    } else if (this.loansAccountTemplate?.lineOfCreditId) {
      locId = this.loansAccountTemplate.lineOfCreditId;
    }

    // Find the selected LOC from the available options
    if (this.locOptions && locId) {
      const selectedLoc = this.locOptions.find((loc: any) => loc.id === locId);
      return selectedLoc?.productType === 'PAYABLE';
    }

    return false;
  }

  /**
   * Returns the form value for LOC Details
   */
  get locDetails() {
    return this.locDetailsForm.getRawValue();
  }
}
