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

  /**
   * Custom validator for array fields (buyer/supplier details)
   */
  arrayRequiredValidator(control: AbstractControl): { [key: string]: any } | null {
    const value = control.value;
    if (!value || !Array.isArray(value) || value.length === 0) {
      return { required: true };
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
      buyerDetails: [[]],

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
      supplierDetails: [[]]
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
        Validators.min(0)]);
      this.locDetailsForm.get('advancePercentage')?.setValidators([
        Validators.required,
        Validators.min(0),
        Validators.max(100)]);
      this.locDetailsForm.get('buyerDetails')?.setValidators([this.arrayRequiredValidator]);

      // Remove payable validators but DON'T clear payable field values
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
      this.locDetailsForm.get('supplierDetails')?.setValidators([this.arrayRequiredValidator]);

      // Remove receivable validators but DON'T clear receivable field values
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
    this.locDetailsForm.get('invoiceAmount')?.valueChanges.subscribe((value) => {
      // Only trigger calculations if the value is meaningful
      if (value !== null && value !== undefined && value !== '') {
        this.updateApprovedReceivableAmount();
        this.updateApprovedPayableAmount();
      }
    });

    this.locDetailsForm.get('disapprovedAmount')?.valueChanges.subscribe((value) => {
      // Only update approved amounts when disapproved amount changes
      // Do not interfere with other fields like principal or invoice amount
      this.updateApprovedReceivableAmount();
      this.updateApprovedPayableAmount();
    });

    // Listen to approved receivable amount and advance percentage changes to compute amount after advance
    this.locDetailsForm.get('advancePercentage')?.valueChanges.subscribe((value) => {
      // Only trigger calculations if the value is meaningful
      if (value !== null && value !== undefined && value !== '') {
        this.updateAmountAfterAdvance();
      }
    });

    // Listen to exchange rate and markup changes for payable calculations
    this.locDetailsForm.get('exchangeRate')?.valueChanges.subscribe((value) => {
      // Only trigger calculations if the value is meaningful
      if (value !== null && value !== undefined && value !== '') {
        this.updateAmountInFacilityCurrency();
      }
    });

    this.locDetailsForm.get('markup')?.valueChanges.subscribe((value) => {
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

    // Only update if the approved amount is actually different from current value
    const currentApprovedAmount = this.locDetailsForm.get('approvedReceivableAmount')?.value;
    if (currentApprovedAmount !== approvedAmount) {
      this.locDetailsForm
        .get('approvedReceivableAmount')
        ?.setValue(approvedAmount >= 0 ? approvedAmount : 0, { emitEvent: false });

      // Also update amount after advance when approved amount changes
      this.updateAmountAfterAdvance();
    }
  }

  /**
   * Updates the approved payable amount (Invoice Amount - Disapproved Amount)
   */
  updateApprovedPayableAmount() {
    const invoiceAmount = this.locDetailsForm.get('invoiceAmount')?.value || 0;
    const disapprovedAmount = this.locDetailsForm.get('disapprovedAmount')?.value || 0;
    const approvedAmount = invoiceAmount - disapprovedAmount;

    // Only update if the approved amount is actually different from current value
    const currentApprovedAmount = this.locDetailsForm.get('approvedPayableAmount')?.value;
    if (currentApprovedAmount !== approvedAmount) {
      this.locDetailsForm
        .get('approvedPayableAmount')
        ?.setValue(approvedAmount >= 0 ? approvedAmount : 0, { emitEvent: false });
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
   * Updates the amount in facility currency (Invoice Amount * (Exchange Rate + Markup))
   */
  updateAmountInFacilityCurrency() {
    const invoiceAmount = this.locDetailsForm.get('invoiceAmount')?.value || 0;
    const exchangeRate = this.locDetailsForm.get('exchangeRate')?.value || 0;
    const markup = this.locDetailsForm.get('markup')?.value || 0;
    const amountInFacilityCurrency = invoiceAmount * (exchangeRate + markup);

    // Only update if the amount in facility currency is actually different from current value
    const currentAmountInFacilityCurrency = this.locDetailsForm.get('amountInFacilityCurrency')?.value;
    if (currentAmountInFacilityCurrency !== amountInFacilityCurrency) {
      this.locDetailsForm.get('amountInFacilityCurrency')?.setValue(amountInFacilityCurrency, { emitEvent: false });
    }
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

    if (buyerDetailsControl && Array.isArray(buyerDetailsControl.value)) {
      const currentBuyerValues = buyerDetailsControl.value;
      const validBuyerValues = currentBuyerValues.filter((value: any) =>
        this.buyerSupplierOptions.some((option: any) => option.id === value || option.name === value)
      );
      if (validBuyerValues.length !== currentBuyerValues.length) {
        buyerDetailsControl.setValue(validBuyerValues, { emitEvent: false });
      }
    }

    if (supplierDetailsControl && Array.isArray(supplierDetailsControl.value)) {
      const currentSupplierValues = supplierDetailsControl.value;
      const validSupplierValues = currentSupplierValues.filter((value: any) =>
        this.buyerSupplierOptions.some((option: any) => option.id === value || option.name === value)
      );
      if (validSupplierValues.length !== currentSupplierValues.length) {
        supplierDetailsControl.setValue(validSupplierValues, { emitEvent: false });
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
    const supplierDetailsControl = this.locDetailsForm.get('supplierDetails');

    // Match buyer details - handle both array and single values from legacy data
    if (buyerDetailsControl?.value) {
      let currentValues = buyerDetailsControl.value;

      // Convert single value to array for consistent processing
      if (!Array.isArray(currentValues)) {
        currentValues = [currentValues];
      }

      const matchedValues = currentValues
        .map((currentValue: any) => {
          let matchedOption = this.buyerSupplierOptions.find(
            (option: any) => option.id === currentValue || option.name === currentValue
          );

          // If exact match not found, try to find by name comparison
          if (!matchedOption && typeof currentValue === 'string') {
            matchedOption = this.buyerSupplierOptions.find(
              (option: any) => option.name?.toLowerCase() === currentValue.toLowerCase()
            );
          }

          return matchedOption ? matchedOption.id : null;
        })
        .filter((value: any) => value !== null);

      buyerDetailsControl.setValue(matchedValues, { emitEvent: false });
    }

    // Match supplier details - handle both array and single values from legacy data
    if (supplierDetailsControl?.value) {
      let currentValues = supplierDetailsControl.value;

      // Convert single value to array for consistent processing
      if (!Array.isArray(currentValues)) {
        currentValues = [currentValues];
      }

      const matchedValues = currentValues
        .map((currentValue: any) => {
          let matchedOption = this.buyerSupplierOptions.find(
            (option: any) => option.id === currentValue || option.name === currentValue
          );

          // If exact match not found, try to find by name comparison
          if (!matchedOption && typeof currentValue === 'string') {
            matchedOption = this.buyerSupplierOptions.find(
              (option: any) => option.name?.toLowerCase() === currentValue.toLowerCase()
            );
          }

          return matchedOption ? matchedOption.id : null;
        })
        .filter((value: any) => value !== null);

      supplierDetailsControl.setValue(matchedValues, { emitEvent: false });
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
    return this.locDetailsForm.getRawValue();
  }
}
