/** Angular Imports */
import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, AbstractControl } from '@angular/forms';

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

  /** Buyer/Supplier Options from selected LOC */
  buyerSupplierOptions: any[] = [];

  /** Minimum date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum date allowed. */
  maxDate = new Date(2100, 0, 1);

  /** Get minimum date for invoice due date (should be invoice date or later) */
  get invoiceDueDateMinDate(): Date {
    const invoiceDate = this.locDetailsForm?.get('invoiceDate')?.value;
    if (invoiceDate) {
      return new Date(invoiceDate);
    }
    return this.minDate;
  }

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

    // Update buyer/supplier options from selected LOC
    this.updateBuyerSupplierOptions();

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
        // Parse dates if they exist as arrays [year, month, day] from backend
        const formData: any = { ...locData };

        // Normalize buyerDetails / supplierDetails to single scalar (take first id if array)
        if (Array.isArray(formData.buyerDetails)) {
          const first = formData.buyerDetails[0];
          formData.buyerDetails = first && typeof first === 'object' ? first.id : first;
        } else if (formData.buyerDetails && typeof formData.buyerDetails === 'object' && formData.buyerDetails.id) {
          formData.buyerDetails = formData.buyerDetails.id;
        }
        if (Array.isArray(formData.supplierDetails)) {
          const first = formData.supplierDetails[0];
          formData.supplierDetails = first && typeof first === 'object' ? first.id : first;
        } else if (
          formData.supplierDetails &&
          typeof formData.supplierDetails === 'object' &&
          formData.supplierDetails.id
        ) {
          formData.supplierDetails = formData.supplierDetails.id;
        }

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

        // Ensure proper field handling based on LOC type for edit mode
        // First check if this is editing mode by determining LOC type from existing data
        const hasReceivableFields = !!(
          formData.advancePercentage !== undefined ||
          formData.buyerDetails !== undefined ||
          formData.approvedReceivableAmount !== undefined ||
          formData.amountAfterAdvance !== undefined
        );

        const hasPayableFields = !!(
          formData.exchangeRate !== undefined ||
          formData.markup !== undefined ||
          formData.supplierDetails !== undefined ||
          formData.approvedPayableAmount !== undefined ||
          formData.amountInFacilityCurrency !== undefined
        );

        // Clear conflicting field values based on LOC type
        if (hasReceivableFields && !hasPayableFields) {
          // This is a receivable LOC - clear any payable fields that might exist
          delete formData.exchangeRate;
          delete formData.markup;
          delete formData.supplierDetails;
          delete formData.approvedPayableAmount;
          delete formData.amountInFacilityCurrency;
        } else if (hasPayableFields && !hasReceivableFields) {
          // This is a payable LOC - clear any receivable fields that might exist
          delete formData.advancePercentage;
          delete formData.buyerDetails;
          delete formData.approvedReceivableAmount;
          delete formData.amountAfterAdvance;
        }

        this.locDetailsForm.patchValue(formData);

        // Update form validators based on LOC type after patching
        this.updateFormValidators();

        // For dropdown fields, ensure the values match the available options
        this.matchDropdownValuesWithOptions();

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
      this.updateBuyerSupplierOptions();
      this.updateFormValidators();
      this.prefillAdvancePercentageFromSelectedLoc();
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

  // Removed arrayRequiredValidator since buyer/supplier are now single-select scalar values

  /**
   * Custom validator for disapproved amount - cannot be greater than invoice amount
   */
  disapprovedAmountValidator(control: AbstractControl): { [key: string]: any } | null {
    const disapprovedAmount = control.value;
    const invoiceAmount = this.locDetailsForm?.get('invoiceAmount')?.value || 0;

    if (disapprovedAmount && invoiceAmount && disapprovedAmount > invoiceAmount) {
      return { disapprovedAmountExceeded: true };
    }
    return null;
  }

  trackByOptionId(index: number, option: any): any {
    return option.id;
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
        0,
        [
          Validators.min(0),
          this.disapprovedAmountValidator.bind(this)]
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
        0,
        [Validators.min(0)]
      ],
      amountInFacilityCurrency: [{ value: '', disabled: true }], // Computed field - Funded Amount in AED (lowest of amountAfterAdvanceInAED, requestedAmountInAED, availableLimit)
      approvedPayableAmount: [{ value: '', disabled: true }], // Computed field - Approved Invoice Amount in invoice currency
      supplierDetails: [''],

      // Additional Payable calculated fields
      invoiceAmountInAED: [{ value: '', disabled: true }], // Computed: Invoice Amount × Exchange Rate
      disapprovedAmountInAED: [{ value: '', disabled: true }], // Computed: Disapproved Amount × Exchange Rate
      approvedInvoiceAmountInAED: [{ value: '', disabled: true }], // Computed: Approved Payable Amount × Exchange Rate
      amountAfterAdvanceInAED: [{ value: '', disabled: true }], // Computed: Approved Invoice Amount in AED × (Advance % / 100)
      requestedAmount: [
        '',
        [Validators.min(0)]
      ], // Editable field - Requested Amount in invoice currency
      requestedAmountInAED: [{ value: '', disabled: true }], // Computed: Requested Amount × Exchange Rate
      fundedAmountInInvoiceCurrency: [{ value: '', disabled: true }] // Computed: Funded Amount in AED ÷ Exchange Rate
    });

    // Set up value change listeners for computed fields
    this.setupComputedFields();
  }

  /**
   * Updates form validators based on LOC type
   */
  updateFormValidators() {
    // Store current values to preserve them during validator updates
    const currentValues = this.locDetailsForm.value;

    if (this.isReceivableType) {
      // Make shared and receivable fields required for RECEIVABLE type LOCs
      this.locDetailsForm.get('disapprovedAmount')?.setValidators([
        Validators.required,
        Validators.min(0),
        this.disapprovedAmountValidator.bind(this)]);
      this.locDetailsForm.get('advancePercentage')?.setValidators([
        Validators.required,
        Validators.min(0),
        Validators.max(100)]);
      // For Receivable type, advancePercentage is editable
      this.locDetailsForm.get('advancePercentage')?.enable({ emitEvent: false });
      this.locDetailsForm.get('buyerDetails')?.setValidators([Validators.required]);

      // Remove payable validators but DON'T clear payable field values
      this.locDetailsForm.get('exchangeRate')?.setValidators([Validators.min(0.01)]);
      this.locDetailsForm.get('markup')?.setValidators([Validators.min(0)]);
      this.locDetailsForm.get('supplierDetails')?.setValidators([]);
    } else if (this.isPayableType) {
      // Make shared and payable fields required for PAYABLE type LOCs
      this.locDetailsForm.get('disapprovedAmount')?.setValidators([
        Validators.required,
        Validators.min(0),
        this.disapprovedAmountValidator.bind(this)]);
      this.locDetailsForm.get('exchangeRate')?.setValidators([
        Validators.required,
        Validators.min(0.01)]);
      this.locDetailsForm.get('markup')?.setValidators([
        Validators.required,
        Validators.min(0)]);
      this.locDetailsForm.get('supplierDetails')?.setValidators([Validators.required]);

      // For Payable type, advancePercentage is always 100% and readonly
      this.locDetailsForm.get('advancePercentage')?.setValue(100, { emitEvent: false });
      this.locDetailsForm.get('advancePercentage')?.disable({ emitEvent: false });
      this.locDetailsForm.get('buyerDetails')?.setValidators([]);
    } else {
      // Remove all required validators for other LOC types
      this.locDetailsForm.get('disapprovedAmount')?.setValidators([
        Validators.min(0),
        this.disapprovedAmountValidator.bind(this)]);
      this.locDetailsForm.get('advancePercentage')?.setValidators([
        Validators.min(0),
        Validators.max(100)]);
      this.locDetailsForm.get('buyerDetails')?.setValidators([]);
      this.locDetailsForm.get('exchangeRate')?.setValidators([Validators.min(0.01)]);
      this.locDetailsForm.get('markup')?.setValidators([Validators.min(0)]);
      this.locDetailsForm.get('supplierDetails')?.setValidators([]);
    }

    // Update validity for all fields with { emitEvent: false } to prevent triggering unwanted events
    this.locDetailsForm.get('disapprovedAmount')?.updateValueAndValidity({ emitEvent: false });
    this.locDetailsForm.get('advancePercentage')?.updateValueAndValidity({ emitEvent: false });
    this.locDetailsForm.get('buyerDetails')?.updateValueAndValidity({ emitEvent: false });
    this.locDetailsForm.get('exchangeRate')?.updateValueAndValidity({ emitEvent: false });
    this.locDetailsForm.get('markup')?.updateValueAndValidity({ emitEvent: false });
    this.locDetailsForm.get('supplierDetails')?.updateValueAndValidity({ emitEvent: false });

    // Ensure critical values like invoice amount are not reset during validation updates
    // Restore ALL form values if they were inadvertently reset during validator updates
    Object.keys(currentValues).forEach((key) => {
      const control = this.locDetailsForm.get(key);
      const currentControlValue = control?.value;
      const originalValue = currentValues[key];

      // Only restore if the value was actually changed during validator update
      // and the original value was meaningful (not empty/null/undefined)
      if (
        originalValue !== null &&
        originalValue !== undefined &&
        originalValue !== '' &&
        currentControlValue !== originalValue
      ) {
        control?.setValue(originalValue, { emitEvent: false });
      }
    });

    // Apply currency behavior (must happen after validators and possible option updates)
    this.updateInvoiceCurrencyBehavior();
  }

  /**
   * Sets default and editability for invoiceCurrency based on LOC type
   * - RECEIVABLE: default to product currency (or first available) and disable editing
   * - PAYABLE: enable editing
   * - Other: enable editing
   */
  private updateInvoiceCurrencyBehavior(): void {
    const invoiceCurrencyControl = this.locDetailsForm.get('invoiceCurrency');
    if (!invoiceCurrencyControl) {
      return;
    }

    if (this.isReceivableType) {
      const productCurrencyCode =
        this.loansAccountProductTemplate?.currency?.code || this.currencyOptions?.[0]?.code || '';
      if (productCurrencyCode && invoiceCurrencyControl.value !== productCurrencyCode) {
        invoiceCurrencyControl.setValue(productCurrencyCode, { emitEvent: false });
      }
      if (!invoiceCurrencyControl.disabled) {
        invoiceCurrencyControl.disable({ emitEvent: false });
      }
    } else {
      if (invoiceCurrencyControl.disabled) {
        invoiceCurrencyControl.enable({ emitEvent: false });
      }
      // If no value yet, default to product currency for convenience
      if (!invoiceCurrencyControl.value) {
        const defaultCode = this.loansAccountProductTemplate?.currency?.code || this.currencyOptions?.[0]?.code || '';
        if (defaultCode) {
          invoiceCurrencyControl.setValue(defaultCode, { emitEvent: false });
        }
      }
    }
  }

  /**
   * Sets up listeners for computed fields
   */
  setupComputedFields() {
    // Listen to invoice amount and disapproved amount changes to compute approved amounts
    this.locDetailsForm.get('invoiceAmount')?.valueChanges.subscribe((value: any) => {
      // Only trigger calculations if the value is meaningful
      if (value !== null && value !== undefined && value !== '') {
        this.updateApprovedReceivableAmount();
        this.updateApprovedPayableAmount();
        this.updateInvoiceAmountInAED();
        // Re-validate disapproved amount when invoice amount changes
        this.locDetailsForm.get('disapprovedAmount')?.updateValueAndValidity({ emitEvent: false });
      }
    });

    this.locDetailsForm.get('disapprovedAmount')?.valueChanges.subscribe((value: any) => {
      // Only update approved amounts when disapproved amount changes
      // Do not interfere with other fields like principal or invoice amount
      this.updateApprovedReceivableAmount();
      this.updateApprovedPayableAmount();
      this.updateDisapprovedAmountInAED();
    });

    // Listen to approved receivable amount and advance percentage changes to compute amount after advance
    this.locDetailsForm.get('advancePercentage')?.valueChanges.subscribe((value: any) => {
      // Only trigger calculations if the value is meaningful
      if (value !== null && value !== undefined && value !== '') {
        this.updateAmountAfterAdvance();
      }
    });

    // Listen to exchange rate and markup changes for payable calculations
    this.locDetailsForm.get('exchangeRate')?.valueChanges.subscribe((value: any) => {
      // Only trigger calculations if the value is meaningful
      if (value !== null && value !== undefined && value !== '') {
        // Update AED conversions
        this.updateInvoiceAmountInAED();
        this.updateDisapprovedAmountInAED();
        this.updateApprovedInvoiceAmountInAED();
        // Note: updateApprovedInvoiceAmountInAED will call updateAmountAfterAdvanceInAED
        // which will call updateFundedAmountInAED which will call updateFundedAmountInInvoiceCurrency
        this.updateRequestedAmountInAED();
      }
    });

    this.locDetailsForm.get('markup')?.valueChanges.subscribe((value: any) => {
      // Markup is now part of the AED conversion formula: value * (exchangeRate + markup)
      // Update all AED conversions when markup changes
      if (value !== null && value !== undefined && value !== '') {
        this.updateInvoiceAmountInAED();
        this.updateDisapprovedAmountInAED();
        this.updateApprovedInvoiceAmountInAED();
        this.updateRequestedAmountInAED();
      }
    });

    // Listen to requested amount changes for AED conversion
    this.locDetailsForm.get('requestedAmount')?.valueChanges.subscribe((value: any) => {
      this.updateRequestedAmountInAED();
    });
  }

  /**
   * Updates the approved receivable amount (Invoice Amount - Disapproved Amount)
   */
  updateApprovedReceivableAmount() {
    if (this.isReceivableType) {
      const invoiceAmount = Math.max(0, this.locDetailsForm.get('invoiceAmount')?.value || 0);
      const disapprovedAmount = Math.max(0, this.locDetailsForm.get('disapprovedAmount')?.value || 0);
      const approvedAmount = Math.max(0, invoiceAmount - disapprovedAmount);

      // Only update if the approved amount is actually different from current value
      const currentApprovedAmount = this.locDetailsForm.get('approvedReceivableAmount')?.value;
      if (currentApprovedAmount !== approvedAmount) {
        this.locDetailsForm.get('approvedReceivableAmount')?.setValue(approvedAmount, { emitEvent: false });

        // Also update amount after advance when approved amount changes
        this.updateAmountAfterAdvance();
      }
    } else {
      this.locDetailsForm.get('approvedReceivableAmount')?.setValue(undefined, { emitEvent: false });
    }
  }

  /**
   * Updates the approved payable amount (Invoice Amount - Disapproved Amount)
   */
  updateApprovedPayableAmount() {
    if (this.isPayableType) {
      const invoiceAmount = Math.max(0, this.locDetailsForm.get('invoiceAmount')?.value || 0);
      const disapprovedAmount = Math.max(0, this.locDetailsForm.get('disapprovedAmount')?.value || 0);
      const approvedAmount = Math.max(0, invoiceAmount - disapprovedAmount);

      // Only update if the approved amount is actually different from current value
      const currentApprovedAmount = this.locDetailsForm.get('approvedPayableAmount')?.value;
      if (currentApprovedAmount !== approvedAmount) {
        this.locDetailsForm.get('approvedPayableAmount')?.setValue(approvedAmount, { emitEvent: false });

        // Update the approved invoice amount in AED
        this.updateApprovedInvoiceAmountInAED();
        // Then update amount after advance in AED (depends on approvedInvoiceAmountInAED)
        this.updateAmountAfterAdvanceInAED();
        // Finally update funded amount in AED (depends on amountAfterAdvanceInAED)
        this.updateFundedAmountInAED();
      }
    } else {
      this.locDetailsForm.get('approvedPayableAmount')?.setValue(undefined, { emitEvent: false });
    }
  }

  /**
   * Updates the amount after advance (Advance % of Approved Receivable Amount)
   */
  updateAmountAfterAdvance() {
    const approvedAmount = this.locDetailsForm.get('approvedReceivableAmount')?.value || 0;
    const advancePercentage = this.locDetailsForm.get('advancePercentage')?.value || 0;
    const amountAfterAdvance = (approvedAmount * advancePercentage) / 100;

    // Only update if the amount after advance is actually different from current value
    const currentAmountAfterAdvance = this.locDetailsForm.get('amountAfterAdvance')?.value;
    if (currentAmountAfterAdvance !== amountAfterAdvance) {
      this.locDetailsForm.get('amountAfterAdvance')?.setValue(amountAfterAdvance, { emitEvent: false });
    }
  }

  /**
   * Updates invoice amount in AED (Invoice Amount * (Exchange Rate + Markup))
   */
  updateInvoiceAmountInAED() {
    if (!this.isPayableType) return;

    const invoiceAmount = Math.max(0, this.locDetailsForm.get('invoiceAmount')?.value || 0);
    const exchangeRate = Math.max(0, this.locDetailsForm.get('exchangeRate')?.value || 0);
    const markup = Math.max(0, this.locDetailsForm.get('markup')?.value || 0);
    const invoiceAmountInAED = invoiceAmount * (exchangeRate + markup);

    const current = this.locDetailsForm.get('invoiceAmountInAED')?.value;
    if (current !== invoiceAmountInAED) {
      this.locDetailsForm.get('invoiceAmountInAED')?.setValue(invoiceAmountInAED, { emitEvent: false });
    }
  }

  /**
   * Updates disapproved amount in AED (Disapproved Amount * (Exchange Rate + Markup))
   */
  updateDisapprovedAmountInAED() {
    if (!this.isPayableType) return;

    const disapprovedAmount = Math.max(0, this.locDetailsForm.get('disapprovedAmount')?.value || 0);
    const exchangeRate = Math.max(0, this.locDetailsForm.get('exchangeRate')?.value || 0);
    const markup = Math.max(0, this.locDetailsForm.get('markup')?.value || 0);
    const disapprovedAmountInAED = disapprovedAmount * (exchangeRate + markup);

    const current = this.locDetailsForm.get('disapprovedAmountInAED')?.value;
    if (current !== disapprovedAmountInAED) {
      this.locDetailsForm.get('disapprovedAmountInAED')?.setValue(disapprovedAmountInAED, { emitEvent: false });
    }
  }

  /**
   * Updates approved invoice amount in AED (Approved Payable Amount * (Exchange Rate + Markup))
   */
  updateApprovedInvoiceAmountInAED() {
    if (!this.isPayableType) return;

    const approvedPayableAmount = Math.max(0, this.locDetailsForm.get('approvedPayableAmount')?.value || 0);
    const exchangeRate = Math.max(0, this.locDetailsForm.get('exchangeRate')?.value || 0);
    const markup = Math.max(0, this.locDetailsForm.get('markup')?.value || 0);
    const approvedInvoiceAmountInAED = approvedPayableAmount * (exchangeRate + markup);

    const current = this.locDetailsForm.get('approvedInvoiceAmountInAED')?.value;
    if (current !== approvedInvoiceAmountInAED) {
      this.locDetailsForm.get('approvedInvoiceAmountInAED')?.setValue(approvedInvoiceAmountInAED, { emitEvent: false });
      // Also update amount after advance in AED when approved invoice amount changes
      this.updateAmountAfterAdvanceInAED();
    }
  }

  /**
   * Updates amount after advance in AED (Approved Invoice Amount in AED * (Advance % / 100))
   * For Payable type, advance % is always 100%, so this equals Approved Invoice Amount in AED
   */
  updateAmountAfterAdvanceInAED() {
    if (!this.isPayableType) return;

    const approvedInvoiceAmountInAED = Math.max(0, this.locDetailsForm.get('approvedInvoiceAmountInAED')?.value || 0);
    const advancePercentage = Math.max(0, this.locDetailsForm.get('advancePercentage')?.value || 100); // Default 100% for payable
    const amountAfterAdvanceInAED = (approvedInvoiceAmountInAED * advancePercentage) / 100;

    const current = this.locDetailsForm.get('amountAfterAdvanceInAED')?.value;
    if (current !== amountAfterAdvanceInAED) {
      this.locDetailsForm.get('amountAfterAdvanceInAED')?.setValue(amountAfterAdvanceInAED, { emitEvent: false });
      // Update funded amount when amount after advance changes
      this.updateFundedAmountInAED();
    }
  }

  /**
   * Updates requested amount in AED (Requested Amount * (Exchange Rate + Markup))
   */
  updateRequestedAmountInAED() {
    if (!this.isPayableType) return;

    const requestedAmount = Math.max(0, this.locDetailsForm.get('requestedAmount')?.value || 0);
    const exchangeRate = Math.max(0, this.locDetailsForm.get('exchangeRate')?.value || 0);
    const markup = Math.max(0, this.locDetailsForm.get('markup')?.value || 0);
    const requestedAmountInAED = requestedAmount * (exchangeRate + markup);

    const current = this.locDetailsForm.get('requestedAmountInAED')?.value;
    if (current !== requestedAmountInAED) {
      this.locDetailsForm.get('requestedAmountInAED')?.setValue(requestedAmountInAED, { emitEvent: false });
      // Update funded amount when requested amount in AED changes
      this.updateFundedAmountInAED();
    }
  }

  /**
   * Updates Funded Amount in AED (amountInFacilityCurrency)
   * Funded Amount = lowest value of:
   * - Amount after Advance% in AED
   * - Requested Amount in AED
   * - Available Limit (from LOC)
   */
  updateFundedAmountInAED() {
    if (!this.isPayableType) return;

    const amountAfterAdvanceInAED = Math.max(0, this.locDetailsForm.get('amountAfterAdvanceInAED')?.value || 0);
    const requestedAmountInAED = Math.max(0, this.locDetailsForm.get('requestedAmountInAED')?.value || 0);

    // Get available limit from the selected LOC
    let availableLimit = Infinity;
    const locId = this.resolvedSelectedLocId;
    if (this.locOptions && locId) {
      const selectedLoc = this.locOptions.find((loc: any) => loc.id === locId);
      if (selectedLoc && selectedLoc.availableLimit !== undefined) {
        availableLimit = Math.max(0, selectedLoc.availableLimit);
      }
    }

    // Funded amount is the lowest of the three values
    // If requestedAmountInAED is 0 or not set, use amountAfterAdvanceInAED as the comparison base
    const candidateValues = [amountAfterAdvanceInAED];
    if (requestedAmountInAED > 0) {
      candidateValues.push(requestedAmountInAED);
    }
    if (availableLimit !== Infinity) {
      candidateValues.push(availableLimit);
    }

    const fundedAmountInAED = Math.min(...candidateValues);

    const current = this.locDetailsForm.get('amountInFacilityCurrency')?.value;
    if (current !== fundedAmountInAED) {
      this.locDetailsForm.get('amountInFacilityCurrency')?.setValue(fundedAmountInAED, { emitEvent: false });
      // Also update funded amount in invoice currency
      this.updateFundedAmountInInvoiceCurrency();
    }
  }

  /**
   * Updates funded amount in invoice currency (Funded Amount in AED / (Exchange Rate + Markup))
   */
  updateFundedAmountInInvoiceCurrency() {
    if (!this.isPayableType) return;

    const fundedAmountInAED = Math.max(0, this.locDetailsForm.get('amountInFacilityCurrency')?.value || 0);
    const exchangeRate = Math.max(0, this.locDetailsForm.get('exchangeRate')?.value || 0);
    const markup = Math.max(0, this.locDetailsForm.get('markup')?.value || 0);
    const effectiveRate = exchangeRate + markup;

    // Funded amount in invoice currency = Funded Amount in AED / (Exchange Rate + Markup)
    const fundedAmountInInvoiceCurrency = effectiveRate > 0 ? fundedAmountInAED / effectiveRate : 0;

    const current = this.locDetailsForm.get('fundedAmountInInvoiceCurrency')?.value;
    if (current !== fundedAmountInInvoiceCurrency) {
      this.locDetailsForm
        .get('fundedAmountInInvoiceCurrency')
        ?.setValue(fundedAmountInInvoiceCurrency, { emitEvent: false });
    }
  }

  /**
   * Triggers calculation of all computed fields
   */
  calculateComputedFields() {
    this.updateApprovedReceivableAmount();
    this.updateApprovedPayableAmount();
    this.updateAmountAfterAdvance();
    this.updateInvoiceAmountInAED();
    this.updateDisapprovedAmountInAED();
    this.updateApprovedInvoiceAmountInAED();
    this.updateAmountAfterAdvanceInAED();
    this.updateRequestedAmountInAED();
    this.updateFundedAmountInAED();
    this.updateFundedAmountInInvoiceCurrency();
  }

  /**
   * Checks if the selected LOC type is receivable
   */
  get isReceivableType(): boolean {
    const locId = this.resolvedSelectedLocId;

    // Find the selected LOC from the available options
    if (this.locOptions && locId) {
      const selectedLoc = this.locOptions.find((loc: any) => loc.id === locId);
      if (selectedLoc) {
        return selectedLoc.productType === 'RECEIVABLE';
      }
    }

    // Fallback: check if receivable-specific fields exist in the form data (for edit mode)
    if (this.loansAccountTemplate?.additionalProperties) {
      const additionalProps = this.loansAccountTemplate.additionalProperties;
      // If we have receivable-specific fields, assume it's receivable type
      return !!(
        additionalProps.advancePercentage !== undefined ||
        additionalProps.buyerDetails !== undefined ||
        additionalProps.approvedReceivableAmount !== undefined ||
        additionalProps.amountAfterAdvance !== undefined
      );
    }

    return false;
  }

  /**
   * Checks if the selected LOC type is payable
   */
  get isPayableType(): boolean {
    const locId = this.resolvedSelectedLocId;

    // Find the selected LOC from the available options
    if (this.locOptions && locId) {
      const selectedLoc = this.locOptions.find((loc: any) => loc.id === locId);
      if (selectedLoc) {
        return selectedLoc.productType === 'PAYABLE';
      }
    }

    // Fallback: check if payable-specific fields exist in the form data (for edit mode)
    if (this.loansAccountTemplate?.additionalProperties) {
      const additionalProps = this.loansAccountTemplate.additionalProperties;
      // If we have payable-specific fields, assume it's payable type
      return !!(
        additionalProps.exchangeRate !== undefined ||
        additionalProps.markup !== undefined ||
        additionalProps.supplierDetails !== undefined ||
        additionalProps.approvedPayableAmount !== undefined ||
        additionalProps.amountInFacilityCurrency !== undefined
      );
    }

    return false;
  }

  /**
   * Gets the selected invoice currency code for display in labels
   */
  get selectedInvoiceCurrency(): string {
    return this.locDetailsForm?.get('invoiceCurrency')?.value || '';
  }

  /**
   * Gets the facility currency code (AED for payable LOCs)
   */
  get facilityCurrency(): string {
    return 'AED';
  }

  /** Prefill advancePercentage control from selected LOC (advancePercentage field) if available and control empty */
  private prefillAdvancePercentageFromSelectedLoc(): void {
    if (!this.locOptions || this.locOptions.length === 0) return;

    const locId = this.resolvedSelectedLocId;
    if (!locId) return;

    const selectedLoc = this.locOptions.find((loc: any) => loc.id === locId);
    if (!selectedLoc) return;

    const locAdvance = selectedLoc.advancePercentage; // expected field name from payload
    const control = this.locDetailsForm.get('advancePercentage');
    if (!control) return;

    // Only set if control is pristine or empty/null
    const currentVal = control.value;
    if ((currentVal === null || currentVal === '' || currentVal === undefined) && (locAdvance || locAdvance === 0)) {
      control.setValue(locAdvance, { emitEvent: true });
    }
  }

  /**
   * Updates buyer/supplier options from selected LOC's approvedBuyersOrSellers
   */
  private updateBuyerSupplierOptions(): void {
    if (!this.locOptions || this.locOptions.length === 0) {
      this.buyerSupplierOptions = [];
      return;
    }

    const locId = this.resolvedSelectedLocId;
    if (!locId) {
      this.buyerSupplierOptions = [];
      return;
    }

    const selectedLoc = this.locOptions.find((loc: any) => loc.id === locId);
    if (!selectedLoc) {
      this.buyerSupplierOptions = [];
      return;
    }

    // Get approved buyers/sellers from the selected LOC
    this.buyerSupplierOptions = selectedLoc.approvedBuyersOrSellers || [];

    // If current form values are not in the new options, filter out invalid selections
    const buyerDetailsControl = this.locDetailsForm.get('buyerDetails');
    const supplierDetailsControl = this.locDetailsForm.get('supplierDetails');

    // If scalar value no longer valid, clear it
    if (buyerDetailsControl) {
      const v = buyerDetailsControl.value;
      if (v && !this.buyerSupplierOptions.some((o: any) => o.id === v || o.name === v)) {
        buyerDetailsControl.setValue('', { emitEvent: false });
      }
    }
    if (supplierDetailsControl) {
      const v = supplierDetailsControl.value;
      if (v && !this.buyerSupplierOptions.some((o: any) => o.id === v || o.name === v)) {
        supplierDetailsControl.setValue('', { emitEvent: false });
      }
    }
  }

  /**
   * Matches dropdown values with available options for edit mode
   */
  private matchDropdownValuesWithOptions(): void {
    if (this.buyerSupplierOptions.length === 0) {
      return;
    }

    const buyerDetailsControl = this.locDetailsForm.get('buyerDetails');
    if (buyerDetailsControl?.value) {
      const v = buyerDetailsControl.value;
      let resolved = null;
      if (v && typeof v === 'object' && v.id) {
        resolved = v.id;
      } else {
        const match = this.buyerSupplierOptions.find(
          (o: any) => o.id === v || (typeof v === 'string' && o.name?.toLowerCase() === v.toLowerCase())
        );
        resolved = match ? match.id : v;
      }
      buyerDetailsControl.setValue(resolved, { emitEvent: false });
    }
    const supplierDetailsControl = this.locDetailsForm.get('supplierDetails');
    if (supplierDetailsControl?.value) {
      const v = supplierDetailsControl.value;
      let resolved = null;
      if (v && typeof v === 'object' && v.id) {
        resolved = v.id;
      } else {
        const match = this.buyerSupplierOptions.find(
          (o: any) => o.id === v || (typeof v === 'string' && o.name?.toLowerCase() === v.toLowerCase())
        );
        resolved = match ? match.id : v;
      }
      supplierDetailsControl.setValue(resolved, { emitEvent: false });
    }
  }

  /**
   * Gets the currently selected Line of Credit ID from various sources
   */
  get resolvedSelectedLocId(): number | null {
    // Priority: additionalProperties > selectedLocId input > template lineOfCreditId
    if (this.loansAccountTemplate?.additionalProperties?.lineOfCreditId) {
      return this.loansAccountTemplate.additionalProperties.lineOfCreditId;
    } else if (this.selectedLocId) {
      return this.selectedLocId;
    } else if (this.loansAccountTemplate?.lineOfCreditId) {
      return this.loansAccountTemplate.lineOfCreditId;
    }
    return null;
  }

  /**
   * Returns the form value for LOC Details
   */
  get locDetails() {
    const formData = this.locDetailsForm.getRawValue();
    // Ensure scalar values are returned (empty string treated as undefined)
    const buyerDetails = formData.buyerDetails || undefined;
    const supplierDetails = formData.supplierDetails || undefined;

    // Add LOC type information for proper preview display
    return {
      ...formData,
      locType: this.isReceivableType ? 'RECEIVABLE' : this.isPayableType ? 'PAYABLE' : null,
      buyerSupplierOptions: this.buyerSupplierOptions,
      buyerDetails,
      supplierDetails
    };
  }
}
