import { Component, Inject, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import { OrganizationService } from 'app/organization/organization.service';

export interface BulkDisburseDialogData {
  clientId: number;
  locId: number;
  locCurrency: string;
  locType?: string; // 'Receivable' or 'Payable'
  selectedLoans: any[];
}

@Component({
  selector: 'mifosx-bulk-disburse-dialog',
  templateUrl: './bulk-disburse-dialog.component.html',
  styleUrls: ['./bulk-disburse-dialog.component.scss']
})
export class BulkDisburseDialogComponent implements OnInit {
  /** Disbursement form */
  bulkDisburseForm: UntypedFormGroup;

  /** Minimum date allowed */
  minDate = new Date(2000, 0, 1);

  /** Maximum date allowed */
  maxDate: Date;

  /** Payment type options */
  paymentTypeOptions: any[] = [];

  /** Loading state for payment types */
  isLoadingPaymentTypes = false;

  /** Whether any loan has non-AED invoice currency */
  hasNonAedInvoices = false;

  /** Loans with non-AED currency */
  nonAedLoans: any[] = [];

  /** Total amount to be disbursed (in AED) */
  totalAmount = 0;

  /** Displayed columns for loans summary */
  displayedColumns: string[] = [
    'accountNo',
    'invoiceNo',
    'invoiceAmount',
    'amountAed'
  ];

  constructor(
    public dialogRef: MatDialogRef<BulkDisburseDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BulkDisburseDialogData,
    private formBuilder: UntypedFormBuilder,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private organizationService: OrganizationService
  ) {}

  ngOnInit(): void {
    this.maxDate = this.settingsService.businessDate || new Date();
    this.initForm();
    this.fetchPaymentTypes();
    this.analyzeSelectedLoans();
  }

  /**
   * Initialize the form
   */
  private initForm(): void {
    this.bulkDisburseForm = this.formBuilder.group({
      actualDisbursementDate: [
        new Date(),
        Validators.required
      ],
      autoWithdrawFromSavings: [false],
      withdrawalPaymentTypeId: [null],
      note: [''],
      disburseInInvoiceCurrency: [false]
    });

    // Subscribe to autoWithdrawFromSavings changes
    this.bulkDisburseForm.get('autoWithdrawFromSavings')?.valueChanges.subscribe((isChecked: boolean) => {
      this.updateWithdrawalPaymentTypeValidation(isChecked);
    });
  }

  /**
   * Updates validation for withdrawal payment type based on checkbox state
   */
  private updateWithdrawalPaymentTypeValidation(isAutoWithdrawChecked: boolean): void {
    const withdrawalPaymentTypeControl = this.bulkDisburseForm.get('withdrawalPaymentTypeId');
    if (isAutoWithdrawChecked) {
      withdrawalPaymentTypeControl?.setValidators([Validators.required]);
    } else {
      withdrawalPaymentTypeControl?.clearValidators();
    }
    withdrawalPaymentTypeControl?.updateValueAndValidity();
  }

  /**
   * Fetch payment types from organization service
   */
  private fetchPaymentTypes(): void {
    this.isLoadingPaymentTypes = true;
    this.organizationService.getPaymentTypes().subscribe({
      next: (paymentTypes: any) => {
        this.paymentTypeOptions = paymentTypes || [];
        this.isLoadingPaymentTypes = false;
        this.preSelectDisbursementOfInvoicePaymentType();
      },
      error: (error) => {
        console.error('Error fetching payment types:', error);
        this.paymentTypeOptions = [];
        this.isLoadingPaymentTypes = false;
      }
    });
  }

  /**
   * Pre-select "Disbursement of Invoice" payment type for withdrawal
   */
  private preSelectDisbursementOfInvoicePaymentType(): void {
    const disbursementOfInvoice = this.paymentTypeOptions.find((pt: any) => pt.name === 'Disbursement of Invoice');
    if (disbursementOfInvoice) {
      this.bulkDisburseForm.patchValue({
        withdrawalPaymentTypeId: disbursementOfInvoice.id
      });
    }
  }

  /**
   * Analyze selected loans for non-AED currencies and calculate totals
   * Total is always calculated in AED using exchange rates
   */
  private analyzeSelectedLoans(): void {
    this.totalAmount = 0;
    this.nonAedLoans = [];

    this.data.selectedLoans.forEach((loan) => {
      const ap = loan.additionalProperties || {};

      // Always add the AED equivalent to total
      const aedAmount = this.getLoanAmountInAed(loan);
      this.totalAmount += aedAmount;

      // Check if loan is non-AED using the same logic as isNonAedLoan
      if (this.isNonAedLoan(loan)) {
        const invoiceCurrency = (ap.invoiceCurrency || loan.invoiceCurrency || loan.currency?.code || '').toUpperCase();

        this.nonAedLoans.push({
          ...loan,
          invoiceCurrency
        });
      }
    });

    this.hasNonAedInvoices = this.nonAedLoans.length > 0;
  }

  /**
   * Get the amount for a loan based on LOC type
   * For Receivable: uses approvedReceivableAmount
   * For Payable: uses approvedPayableAmount
   * Falls back to invoiceAmount, principal, or originalLoan
   */
  getLoanAmount(loan: any): number {
    const ap = loan.additionalProperties || {};
    const locType = (this.data.locType || '').toUpperCase();

    // First try to get the approved amount based on LOC type
    if (locType === 'RECEIVABLE' && ap.approvedReceivableAmount > 0) {
      return ap.approvedReceivableAmount;
    }
    if (locType === 'PAYABLE' && ap.approvedPayableAmount > 0) {
      return ap.approvedPayableAmount;
    }

    // Try both approved amounts if LOC type is not specified
    if (ap.approvedReceivableAmount > 0) {
      return ap.approvedReceivableAmount;
    }
    if (ap.approvedPayableAmount > 0) {
      return ap.approvedPayableAmount;
    }

    // Try invoice amount
    if (ap.invoiceAmount > 0) {
      return ap.invoiceAmount;
    }

    // Fallback to principal/approved/original loan amount
    return loan.principal || loan.approvedPrincipal || loan.originalLoan || 0;
  }

  /**
   * Get the invoice amount with its original currency for display
   * Returns object with amount and currency
   * Checks multiple sources for invoice amount: additionalProperties, top-level loan properties, etc.
   */
  getInvoiceAmountDisplay(loan: any): { amount: number; currency: string } {
    const ap = loan.additionalProperties || {};

    // Determine invoice currency
    const invoiceCurrency = (ap.invoiceCurrency || loan.invoiceCurrency || loan.currency?.code || 'AED').toUpperCase();

    // Try to get the invoice amount from multiple sources
    let invoiceAmount = 0;

    // First try additionalProperties.invoiceAmount
    if (ap.invoiceAmount > 0) {
      invoiceAmount = ap.invoiceAmount;
    }
    // Try top-level invoiceAmount
    else if (loan.invoiceAmount > 0) {
      invoiceAmount = loan.invoiceAmount;
    }
    // For non-AED currencies, if we have original invoice data, use that
    else if (invoiceCurrency !== 'AED') {
      // Try to get from approved amounts based on LOC type
      const locType = (this.data.locType || '').toUpperCase();

      // If we have exchange rate data, we can calculate back the original invoice amount
      const exchangeRate = ap.exchangeRate || loan.exchangeRate || 0;
      const markup = ap.markup || loan.markup || 0;
      const totalRate = exchangeRate + markup;

      if (totalRate > 0) {
        // Get the AED amount and convert back to invoice currency
        const aedAmount =
          ap.amountInFacilityCurrency ||
          ap.approvedReceivableAmount ||
          ap.approvedPayableAmount ||
          loan.principal ||
          loan.approvedPrincipal ||
          0;
        if (aedAmount > 0) {
          invoiceAmount = aedAmount / totalRate;
        }
      }
    }

    // Fallback: if still 0 and currency is AED, use principal amount as invoice amount
    if (invoiceAmount === 0 && invoiceCurrency === 'AED') {
      invoiceAmount =
        loan.principal ||
        loan.approvedPrincipal ||
        loan.originalLoan ||
        ap.approvedReceivableAmount ||
        ap.approvedPayableAmount ||
        0;
    }

    return {
      amount: invoiceAmount,
      currency: invoiceCurrency
    };
  }

  /**
   * Get the loan amount in AED (converted if necessary)
   * Uses pre-calculated AED fields or calculates using exchange rate + markup
   * Checks both additionalProperties and top-level loan properties
   */
  getLoanAmountInAed(loan: any): number {
    const ap = loan.additionalProperties || {};
    const locType = (this.data.locType || '').toUpperCase();

    // First, check if we have pre-calculated AED amounts stored
    // amountInFacilityCurrency is the funded amount in AED
    if (ap.amountInFacilityCurrency > 0) {
      return ap.amountInFacilityCurrency;
    }
    if (loan.amountInFacilityCurrency > 0) {
      return loan.amountInFacilityCurrency;
    }

    // approvedReceivableAmount / approvedPayableAmount are already in AED
    if (locType === 'RECEIVABLE') {
      if (ap.approvedReceivableAmount > 0) return ap.approvedReceivableAmount;
      if (loan.approvedReceivableAmount > 0) return loan.approvedReceivableAmount;
    }
    if (locType === 'PAYABLE') {
      if (ap.approvedPayableAmount > 0) return ap.approvedPayableAmount;
      if (loan.approvedPayableAmount > 0) return loan.approvedPayableAmount;
    }

    // Try both approved amounts if LOC type is not specified
    if (ap.approvedReceivableAmount > 0) return ap.approvedReceivableAmount;
    if (loan.approvedReceivableAmount > 0) return loan.approvedReceivableAmount;
    if (ap.approvedPayableAmount > 0) return ap.approvedPayableAmount;
    if (loan.approvedPayableAmount > 0) return loan.approvedPayableAmount;

    // Check for invoiceAmountInAED (pre-calculated)
    if (ap.invoiceAmountInAED > 0) {
      return ap.invoiceAmountInAED;
    }
    if (loan.invoiceAmountInAED > 0) {
      return loan.invoiceAmountInAED;
    }

    // If invoice is in non-AED currency, calculate conversion
    const invoiceCurrency = (ap.invoiceCurrency || loan.invoiceCurrency || loan.currency?.code || '').toUpperCase();
    const invoiceAmount = ap.invoiceAmount || loan.invoiceAmount || 0;

    if (invoiceCurrency && invoiceCurrency !== 'AED' && invoiceAmount > 0) {
      // Convert using: invoiceAmount * (exchangeRate + markup)
      const exchangeRate = ap.exchangeRate || loan.exchangeRate || 0;
      const markup = ap.markup || loan.markup || 0;
      const totalRate = exchangeRate + markup;

      if (totalRate > 0) {
        return invoiceAmount * totalRate;
      }
    }

    // Fallback to principal/originalLoan (already in AED for facility currency)
    return loan.principal || loan.approvedPrincipal || loan.originalLoan || invoiceAmount || 0;
  }

  /**
   * Get the currency for a loan (invoice currency or default to AED)
   * Checks multiple sources for currency
   */
  getLoanCurrency(loan: any): string {
    const ap = loan.additionalProperties || {};
    const invoiceCurrency = (ap.invoiceCurrency || loan.invoiceCurrency || loan.currency?.code || '').toUpperCase();

    if (invoiceCurrency && invoiceCurrency !== 'AED') {
      return invoiceCurrency;
    }
    return 'AED';
  }

  /**
   * Check if loan has non-AED currency
   * Checks multiple sources for invoice currency
   */
  isNonAedLoan(loan: any): boolean {
    const ap = loan.additionalProperties || {};
    const invoiceCurrency = (ap.invoiceCurrency || loan.invoiceCurrency || loan.currency?.code || '').toUpperCase();

    return invoiceCurrency && invoiceCurrency !== 'AED' && invoiceCurrency !== '';
  }

  /**
   * Get invoice number from loan
   */
  getInvoiceNumber(loan: any): string {
    return (
      loan.invoiceNumber || loan.additionalProperties?.invoiceNumber || loan.additionalProperties?.invoiceNo || '-'
    );
  }

  /**
   * Submit the bulk disbursement
   */
  submit(): void {
    if (this.bulkDisburseForm.invalid) {
      return;
    }

    const formValues = this.bulkDisburseForm.getRawValue();
    // Use ISO date format (yyyy-MM-dd) for bulk disburse API compatibility
    const dateFormat = 'yyyy-MM-dd';
    const locale = this.settingsService.language.code;

    // Format the date in ISO format for API
    let disbursementDate = formValues.actualDisbursementDate;
    if (disbursementDate && !(disbursementDate instanceof Date)) {
      disbursementDate = new Date(disbursementDate);
    }
    if (disbursementDate instanceof Date && !isNaN(disbursementDate.getTime())) {
      // Format as yyyy-MM-dd
      disbursementDate = this.dateUtils.formatDate(disbursementDate, dateFormat);
    }

    // Build the loans array - ensure loanId is a number
    const loans = this.data.selectedLoans.map((loan) => {
      const loanRequest: any = {
        loanId: Number(loan.id)
      };

      // If disburseInInvoiceCurrency is checked and this loan has non-AED currency
      if (formValues.disburseInInvoiceCurrency && this.isNonAedLoan(loan)) {
        loanRequest.disburseInInvoiceCurrency = true;
      }

      return loanRequest;
    });

    // Build the request payload - ensure IDs are numbers
    const requestPayload: any = {
      loans,
      actualDisbursementDate: disbursementDate,
      dateFormat,
      locale
    };

    // Add optional fields - ensure IDs are numbers
    if (formValues.autoWithdrawFromSavings) {
      requestPayload.autoWithdrawFromSavings = true;
      if (formValues.withdrawalPaymentTypeId) {
        requestPayload.withdrawalPaymentTypeId = Number(formValues.withdrawalPaymentTypeId);
      }
    }

    if (formValues.note?.trim()) {
      requestPayload.note = formValues.note.trim();
    }

    this.dialogRef.close({ action: 'disburse', payload: requestPayload });
  }

  /**
   * Cancel and close the dialog
   */
  cancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }
}
