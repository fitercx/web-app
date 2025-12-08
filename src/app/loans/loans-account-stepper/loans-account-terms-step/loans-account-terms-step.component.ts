/** Angular Imports */
import { Component, OnInit, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, FormArray, UntypedFormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { LoansAccountAddCollateralDialogComponent } from 'app/loans/custom-dialog/loans-account-add-collateral-dialog/loans-account-add-collateral-dialog.component';
import { LoanProducts } from 'app/products/loan-products/loan-products';
import { LoanProduct } from 'app/products/loan-products/models/loan-product.model';
import { SettingsService } from 'app/settings/settings.service';
import { DeleteDialogComponent } from 'app/shared/delete-dialog/delete-dialog.component';
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { DatepickerBase } from 'app/shared/form-dialog/formfield/model/datepicker-base';
import { FormfieldBase } from 'app/shared/form-dialog/formfield/model/formfield-base';
import { InputBase } from 'app/shared/form-dialog/formfield/model/input-base';
import { Currency } from 'app/shared/models/general.model';
import { CodeName, OptionData } from 'app/shared/models/option-data.model';

/**
 * Create Loans Account Terms Step
 */
@Component({
  selector: 'mifosx-loans-account-terms-step',
  templateUrl: './loans-account-terms-step.component.html',
  styleUrls: ['./loans-account-terms-step.component.scss']
})
export class LoansAccountTermsStepComponent implements OnInit, OnChanges, OnDestroy {
  /** Loans Product Options */
  @Input() loansProductOptions: any;
  /** Loans Account Product Template */
  @Input() loansAccountProductTemplate: any;
  /** Loans Account Template */
  @Input() loansAccountTemplate: any;
  loansAccountTermsData: any;

  /** Is Multi Disburse Loan  */
  multiDisburseLoan: any;
  // @Input() loansAccountFormValid: LoansAccountFormValid
  @Input() loansAccountFormValid: boolean;
  // @Input collateralOptions: Collateral Options
  @Input() collateralOptions: any;
  // @Input loanPrincipal: Loan Principle
  @Input() loanPrincipal: any;
  /** Whether a LOC is selected (for dynamic principal label) */
  @Input() locSelected: boolean = false;
  /** LOC Options for detecting LOC product */
  @Input() locOptions: any[] = [];
  /** Selected LOC ID for tracking changes */
  @Input() selectedLocId: any;

  /** Minimum date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum date allowed. */
  maxDate = new Date(2100, 0, 1);
  /** Loans Account Terms Form */
  loansAccountTermsForm: UntypedFormGroup;
  /** Term Frequency Type Data */
  termFrequencyTypeData: any;
  /** Repayment Frequency Nth Day Type Data */
  repaymentFrequencyNthDayTypeData: any;
  /** Repayment Frequency Days of Week Type Data */
  repaymentFrequencyDaysOfWeekTypeData: any;
  /** Interest Type Data */
  interestTypeData: any;
  /** Amortization Type Data */
  amortizationTypeData: any;
  /** Interest Calculation Period Type Data */
  interestCalculationPeriodTypeData: any;
  /** Client Active Loan Data */
  clientActiveLoanData: any;
  /** Multi Disbursement Data */
  disbursementDataSource: {}[] = [];
  /** Loan repayment strategies */
  transactionProcessingStrategyOptions: any = [];
  repaymentStrategyDisabled = false;
  /** Check if value of collateral added  is more than principal amount */
  isCollateralSufficient = false;
  /** Total value of all collateral added to a loan */
  totalCollateralValue: any = 0;
  /** Collateral Data Source */
  collateralDataSource: {}[] = [];
  /** Columns to be displayed in collateral table. */
  loanCollateralDisplayedColumns: string[] = [
    'type',
    'value',
    'totalValue',
    'totalCollateralValue',
    'action'
  ];
  /** Disbursement Data Displayed Columns */
  disbursementDisplayedColumns: string[] = [
    'expectedDisbursementDate',
    'principal',
    'actions'
  ];
  /** Multi Disbursement Control */
  totalMultiDisbursed: any = 0;
  isMultiDisbursedCompleted = false;

  /** Component is pristine if there has been no changes by user interaction */
  pristine = true;

  loanId: any = null;
  loanScheduleType: OptionData | null = null;
  loanProduct: LoanProduct | null = null;
  interestRateFrequencyTypeData: any[] = [];
  currency: Currency;

  productEnableDownPayment = false;
  enableIncomeCapitalization = false;
  isProgressive = false;
  factorRateEnabled = false;

  /** Subscriptions for loan term listeners */
  private loanTermSubscriptions: Subscription[] = [];
  private currentProductType: 'LOC' | 'STANDARD' | null = null;
  /** Track if this is the initial load vs. subsequent updates */
  private isInitialLoad = true;

  /**
   * Create Loans Account Terms Form
   * @param formBuilder FormBuilder
   * @param {SettingsService} settingsService SettingsService
   * @param route
   * @param dialog
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    public dialog: MatDialog
  ) {
    this.loanId = this.route.snapshot.params['loanId'];
    this.createloansAccountTermsForm();
  }
  /**
   * Executes on change of input values
   */
  ngOnChanges(changes: SimpleChanges) {
    if (this.loansAccountProductTemplate) {
      this.currency = this.loansAccountProductTemplate.currency;
      this.loansAccountTermsData = this.loansAccountProductTemplate;
      let factorRate = this.loansAccountProductTemplate?.product?.factorRate;
      if (this.loanId != null && this.loansAccountTemplate.accountNo) {
        this.loansAccountTermsData = this.loansAccountTemplate;
        factorRate = this.loansAccountTemplate.factorRate;
      }
      this.productEnableDownPayment = this.loansAccountTermsData.product.enableDownPayment;
      this.enableIncomeCapitalization = this.loansAccountTermsData.product.enableIncomeCapitalization;

      this.isProgressive =
        this.loansAccountTermsData.loanScheduleType.code == LoanProducts.LOAN_SCHEDULE_TYPE_PROGRESSIVE;
      if (this.loansAccountTermsData.product) {
        this.loanProduct = this.loansAccountTermsData.product;
      }
      this.factorRateEnabled = this.loansAccountProductTemplate?.product?.factorRateProductEnabled;
      this.interestRateFrequencyTypeData = this.loansAccountTermsData.interestRateFrequencyTypeOptions;

      // Handle LOC products: use tenorDays from additionalProperties if available
      let loanTermFrequency = this.loansAccountTermsData.termFrequency;
      let loanTermFrequencyType = this.loansAccountTermsData.termPeriodFrequencyType.id;

      if (this.isLocProduct()) {
        const tenorDays = this.getTenorDaysForLoc();
        if (tenorDays) {
          loanTermFrequency = tenorDays;
          // Find the ID for "DAYS" frequency type
          const daysFrequencyType = this.loansAccountProductTemplate?.termFrequencyTypeOptions?.find(
            (option: any) => option.code === 'DAYS' || option.value === 'Days'
          );
          if (daysFrequencyType) {
            loanTermFrequencyType = daysFrequencyType.id;
          }
        }
      }

      // For LOC products, override the interest rate frequency type to be per annum
      let interestRateFrequencyType = this.loansAccountTermsData.interestRateFrequencyType.id;
      if (this.isLocProduct()) {
        const perAnnumFrequencyTypeId = this.getPerAnnumInterestRateFrequencyTypeId();
        if (perAnnumFrequencyTypeId !== null) {
          interestRateFrequencyType = perAnnumFrequencyTypeId;
        }
      }

      // Preserve user input values and only patch fields that haven't been modified
      this.patchFormPreservingUserInput({
        factorRate: factorRate,
        factorRateEnabled: this.factorRateEnabled,
        principalAmount: this.loansAccountTermsData.principal,
        loanTermFrequency: loanTermFrequency,
        loanTermFrequencyType: loanTermFrequencyType,
        numberOfRepayments: this.loansAccountTermsData.numberOfRepayments,
        repaymentEvery: this.loansAccountTermsData.repaymentEvery,
        repaymentFrequencyType: this.loansAccountTermsData.repaymentFrequencyType.id,
        amortizationType: this.loansAccountTermsData.amortizationType.id,
        isEqualAmortization: this.loansAccountTermsData.isEqualAmortization,
        interestType: this.loansAccountTermsData.interestType.id,
        // TODO: 2025-03-17: Is this correct?
        isFloatingInterestRate: this.loansAccountTermsData.isLoanProductLinkedToFloatingRate ? false : '',
        interestCalculationPeriodType: this.loansAccountTermsData.interestCalculationPeriodType.id,
        allowPartialPeriodInterestCalculation: this.loansAccountTermsData.allowPartialPeriodInterestCalculation,
        inArrearsTolerance: this.loansAccountTermsData.inArrearsTolerance,
        graceOnPrincipalPayment: this.loansAccountTermsData.graceOnPrincipalPayment,
        graceOnInterestPayment: this.loansAccountTermsData.graceOnInterestPayment,
        graceOnArrearsAgeing: this.loansAccountTermsData.graceOnArrearsAgeing,
        graceOnInterestCharged: this.loansAccountTermsData.graceOnInterestCharged,
        fixedEmiAmount: this.loansAccountTermsData.fixedEmiAmount,
        maxOutstandingLoanBalance: this.loansAccountTermsData.maxOutstandingLoanBalance,
        transactionProcessingStrategyCode: this.loansAccountTermsData.transactionProcessingStrategyCode,
        interestRateDifferential: this.loansAccountTermsData.interestRateDifferential,
        multiDisburseLoan: this.loansAccountTermsData.multiDisburseLoan,
        interestRateFrequencyType: interestRateFrequencyType,
        balloonRepaymentAmount: this.loansAccountTermsData.balloonRepaymentAmount,
        interestRecognitionOnDisbursementDate: this.loansAccountTermsData.interestRecognitionOnDisbursementDate || false
      });

      // Handle LOC product field restrictions
      this.handleLocProductTerms();

      this.setAdvancedPaymentStrategyControls();

      if (
        this.loansAccountTermsData.loanScheduleType.code == LoanProducts.LOAN_SCHEDULE_TYPE_CUMULATIVE ||
        this.loansAccountTermsData.loanScheduleType.code == LoanProducts.LINE_OF_CREDIT
      ) {
        this.loansAccountTermsForm.removeControl('interestRecognitionOnDisbursementDate');
      }

      if (this.loansAccountTermsData.isLoanProductLinkedToFloatingRate) {
        this.loansAccountTermsForm.removeControl('interestRatePerPeriod');
      }

      this.multiDisburseLoan = this.loansAccountTermsData.multiDisburseLoan;
      if (this.loansAccountTermsData.disbursementDetails) {
        this.disbursementDataSource = this.loansAccountTermsData.disbursementDetails;
        this.totalMultiDisbursed = 0;
        this.disbursementDataSource.forEach((item: any) => {
          this.totalMultiDisbursed += item.principal;
        });
      }
      if (this.isDelinquencyEnabled()) {
        this.loansAccountTermsForm.addControl(
          'enableInstallmentLevelDelinquency',
          new UntypedFormControl(
            this.loansAccountTermsData.enableInstallmentLevelDelinquency ||
              this.loanProduct.enableInstallmentLevelDelinquency
          )
        );
      }
      this.collateralDataSource = this.loansAccountTermsData.collateral || [];
      if (this.productEnableDownPayment) {
        const enableDownPayment = this.loansAccountTermsData['enableDownPayment'] !== false;
        this.loansAccountTermsForm.addControl('enableDownPayment', new UntypedFormControl(enableDownPayment));
      }

      const allowAttributeOverrides = this.loansAccountTermsData.product.allowAttributeOverrides;
      if (!allowAttributeOverrides.repaymentEvery) {
        this.loansAccountTermsForm.controls.repaymentEvery.disable();
        this.loansAccountTermsForm.controls.repaymentFrequencyType.disable();
      }
      if (!allowAttributeOverrides.interestType) {
        this.loansAccountTermsForm.controls.interestType.disable();
      }
      if (!allowAttributeOverrides.amortizationType) {
        this.loansAccountTermsForm.controls.amortizationType.disable();
      }
      if (!allowAttributeOverrides.interestCalculationPeriodType) {
        this.loansAccountTermsForm.controls.interestCalculationPeriodType.disable();
        this.loansAccountTermsForm.controls.allowPartialPeriodInterestCalculation.disable();
      }
      if (!allowAttributeOverrides.inArrearsTolerance) {
        this.loansAccountTermsForm.controls.inArrearsTolerance.disable();
      }
      if (!allowAttributeOverrides.transactionProcessingStrategyCode) {
        this.loansAccountTermsForm.controls.transactionProcessingStrategyCode.disable();
      }
      if (!allowAttributeOverrides.graceOnPrincipalAndInterestPayment) {
        this.loansAccountTermsForm.controls.graceOnPrincipalPayment.disable();
      }
      if (!allowAttributeOverrides.graceOnPrincipalAndInterestPayment) {
        this.loansAccountTermsForm.controls.graceOnInterestPayment.disable();
      }
      if (!allowAttributeOverrides.graceOnArrearsAgeing) {
        this.loansAccountTermsForm.controls.graceOnArrearsAgeing.disable();
      }
      this.setOptions();
    }

    // Handle changes in LOC selection
    if (changes['selectedLocId'] && this.isLocProduct()) {
      this.updateLoanTermForSelectedLoc();
    }

    // Handle changes in LOC selection state
    if (changes['locSelected']) {
      this.handleLocProductTerms();
    }

    // Set up loan term listeners when product template changes
    if (changes['loansAccountProductTemplate'] || changes['loansAccountTemplate']) {
      this.setupLoanTermListeners();
    }

    // Mark initial load as complete after first ngOnChanges
    if (this.isInitialLoad) {
      this.isInitialLoad = false;
    }
  }

  ngOnInit() {
    this.maxDate = this.settingsService.maxFutureDate;
    this.loansAccountTermsData = this.loansAccountProductTemplate;
    let factorRate = this.loansAccountProductTemplate?.product?.factorRate;
    if (this.loanId != null && this.loansAccountTemplate.accountNo) {
      this.loansAccountTermsData = this.loansAccountTemplate;
      factorRate = this.loansAccountTemplate.factorRate;
    }

    if (this.loansAccountTermsData) {
      if (this.loansAccountTermsData.loanProductId) {
        let formattedDate = null;
        if (this.loansAccountTermsData.expectedFirstRepaymentOnDate) {
          const repaymentDate = new Date(this.loansAccountTermsData.expectedFirstRepaymentOnDate);
          formattedDate = this.formatDateToDDMMYYYY(repaymentDate);
        }
        this.loansAccountTermsForm.patchValue({
          repaymentsStartingFromDate: this.loansAccountTermsData.expectedFirstRepaymentOnDate && formattedDate
        });
      }

      // Handle LOC products: use tenorDays from additionalProperties if available
      let loanTermFrequency = this.loansAccountTermsData.termFrequency;
      let loanTermFrequencyType = this.loansAccountTermsData.termPeriodFrequencyType.id;

      if (this.isLocProduct()) {
        const tenorDays = this.getTenorDaysForLoc();
        if (tenorDays) {
          loanTermFrequency = tenorDays;
          // Find the ID for "DAYS" frequency type
          const daysFrequencyType = this.loansAccountProductTemplate?.termFrequencyTypeOptions?.find(
            (option: any) => option.code === 'DAYS' || option.value === 'Days'
          );
          if (daysFrequencyType) {
            loanTermFrequencyType = daysFrequencyType.id;
          }
        }
      }

      this.factorRateEnabled = this.loansAccountProductTemplate?.product?.factorRateProductEnabled;

      // For LOC products, override the interest rate frequency type to be per annum
      let interestRateFrequencyType = this.loansAccountTermsData.interestRateFrequencyType.id;
      if (this.isLocProduct()) {
        const perAnnumFrequencyTypeId = this.getPerAnnumInterestRateFrequencyTypeId();
        if (perAnnumFrequencyTypeId !== null) {
          interestRateFrequencyType = perAnnumFrequencyTypeId;
        }
      }

      this.loansAccountTermsForm.patchValue({
        factorRate: factorRate,
        factorRateEnabled: this.factorRateEnabled,
        principalAmount: this.loansAccountTermsData.principal,
        loanTermFrequency: loanTermFrequency,
        loanTermFrequencyType: loanTermFrequencyType,
        numberOfRepayments: this.loansAccountTermsData.numberOfRepayments,
        repaymentEvery: this.loansAccountTermsData.repaymentEvery,
        repaymentFrequencyType: this.loansAccountTermsData.repaymentFrequencyType.id,
        amortizationType: this.loansAccountTermsData.amortizationType.id,
        isEqualAmortization: this.loansAccountTermsData.isEqualAmortization,
        interestType: this.loansAccountTermsData.interestType.id,
        isFloatingInterestRate: this.loansAccountTermsData.isLoanProductLinkedToFloatingRate ? false : '',
        interestCalculationPeriodType: this.loansAccountTermsData.interestCalculationPeriodType.id,
        allowPartialPeriodInterestCalculation: this.loansAccountTermsData.allowPartialPeriodInterestCalculation,
        inArrearsTolerance: this.loansAccountTermsData.inArrearsTolerance,
        graceOnPrincipalPayment: this.loansAccountTermsData.graceOnPrincipalPayment,
        graceOnInterestPayment: this.loansAccountTermsData.graceOnInterestPayment,
        graceOnArrearsAgeing: this.loansAccountTermsData.graceOnArrearsAgeing,
        graceOnInterestCharged: this.loansAccountTermsData.graceOnInterestCharged,
        fixedEmiAmount: this.loansAccountTermsData.fixedEmiAmount,
        maxOutstandingLoanBalance: this.loansAccountTermsData.maxOutstandingLoanBalance,
        transactionProcessingStrategyCode: this.loansAccountTermsData.transactionProcessingStrategyCode,
        interestRateDifferential: this.loansAccountTermsData.interestRateDifferential,
        multiDisburseLoan: this.loansAccountTermsData.multiDisburseLoan,
        interestRateFrequencyType: interestRateFrequencyType,
        balloonRepaymentAmount: this.loansAccountTermsData.balloonRepaymentAmount,
        interestRecognitionOnDisbursementDate: this.loansAccountTermsData.interestRecognitionOnDisbursementDate || false
      });

      // Handle LOC product field restrictions
      this.handleLocProductTerms();
    }
    this.createloansAccountTermsForm();
    this.setAdvancedPaymentStrategyControls();
    // this.setCustomValidators();
    this.setupLoanTermListeners();

    // Update loan term if LOC is already selected during initialization
    if (this.isLocProduct() && this.selectedLocId) {
      this.updateLoanTermForSelectedLoc();
    }
  }

  allowAddDisbursementDetails() {
    return this.multiDisburseLoan && !this.loansAccountTermsData.disallowExpectedDisbursements;
  }
  formatDateToDDMMYYYY(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  /** Custom Validators for the form */
  setCustomValidators() {
    const repaymentFrequencyNthDayType = this.loansAccountTermsForm.get('repaymentFrequencyNthDayType');
    const repaymentFrequencyDayOfWeekType = this.loansAccountTermsForm.get('repaymentFrequencyDayOfWeekType');

    this.loansAccountTermsForm.get('repaymentFrequencyType').valueChanges.subscribe((repaymentFrequencyType) => {
      if (repaymentFrequencyType === 2) {
        repaymentFrequencyNthDayType.setValidators([Validators.required]);
        repaymentFrequencyDayOfWeekType.setValidators([Validators.required]);
      } else {
        repaymentFrequencyNthDayType.setValidators(null);
        repaymentFrequencyDayOfWeekType.setValidators(null);
      }

      repaymentFrequencyNthDayType.updateValueAndValidity();
      repaymentFrequencyDayOfWeekType.updateValueAndValidity();
    });
  }

  /**
   * Clears existing loan term listeners
   */
  private clearLoanTermListeners(): void {
    this.loanTermSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.loanTermSubscriptions = [];
  }

  /**
   * Sets up loan term listeners based on the current product type
   */
  setupLoanTermListeners(): void {
    this.clearLoanTermListeners();

    if (!this.loansAccountTermsForm) {
      return;
    }

    const isLocProduct = this.isLocProduct();
    const newProductType: 'LOC' | 'STANDARD' = isLocProduct ? 'LOC' : 'STANDARD';

    // Only set up listeners if product type has changed or is being set for the first time
    if (this.currentProductType === newProductType) {
      return;
    }

    this.currentProductType = newProductType;
    this.doSetupLoanTermListeners(isLocProduct);
  }

  /**
   * Forces setup of loan term listeners even if product type hasn't changed
   * This is useful when specific LOC selection changes within the same product type
   */
  private forceSetupLoanTermListeners(): void {
    this.clearLoanTermListeners();

    if (!this.loansAccountTermsForm) {
      return;
    }

    const isLocProduct = this.isLocProduct();
    this.doSetupLoanTermListeners(isLocProduct);
  }

  /**
   * Actually sets up the loan term listeners
   */
  private doSetupLoanTermListeners(isLocProduct: boolean): void {
    if (isLocProduct) {
      // For LOC products: sync loanTermFrequency with repaymentEvery (bidirectional)
      const loanTermSub = this.loansAccountTermsForm
        .get('loanTermFrequency')
        ?.valueChanges.subscribe((loanTermFrequency) => {
          this.loansAccountTermsForm.patchValue({ repaymentEvery: loanTermFrequency }, { emitEvent: false });
        });

      const repaymentEverySub = this.loansAccountTermsForm
        .get('repaymentEvery')
        ?.valueChanges.subscribe((repaymentEvery) => {
          this.loansAccountTermsForm.patchValue({ loanTermFrequency: repaymentEvery }, { emitEvent: false });
        });

      if (loanTermSub) {
        this.loanTermSubscriptions.push(loanTermSub);
      }
      if (repaymentEverySub) {
        this.loanTermSubscriptions.push(repaymentEverySub);
      }
    } else {
      // For standard loans: calculate loan term from number of repayments and repayment frequency
      const numberOfRepaymentsSub = this.loansAccountTermsForm
        .get('numberOfRepayments')
        ?.valueChanges.subscribe((numberOfRepayments) => {
          const repaymentEvery: number = this.loansAccountTermsForm.value.repaymentEvery;
          this.calculateLoanTerm(numberOfRepayments, repaymentEvery);
        });

      const repaymentEverySub = this.loansAccountTermsForm
        .get('repaymentEvery')
        ?.valueChanges.subscribe((repaymentEvery) => {
          const numberOfRepayments: number = this.loansAccountTermsForm.value.numberOfRepayments;
          this.calculateLoanTerm(numberOfRepayments, repaymentEvery);
        });

      const loanTermFrequencyTypeSub = this.loansAccountTermsForm
        .get('loanTermFrequencyType')
        ?.valueChanges.subscribe((loanTermFrequencyType) => {
          this.loansAccountTermsForm.patchValue(
            { repaymentFrequencyType: loanTermFrequencyType },
            { emitEvent: false }
          );
        });

      const amortizationTypeSub = this.loansAccountTermsForm
        .get('amortizationType')
        ?.valueChanges.subscribe((amortizationType) => {
          if (amortizationType === 0) {
            // Equal Principal Payments
            this.loansAccountTermsForm.addControl('fixedPrincipalPercentagePerInstallment', new UntypedFormControl(''));
          } else {
            // Equal Installments
            this.loansAccountTermsForm.removeControl('fixedPrincipalPercentagePerInstallment');
          }
        });

      // Add all subscriptions to the array
      if (numberOfRepaymentsSub) {
        this.loanTermSubscriptions.push(numberOfRepaymentsSub);
      }
      if (repaymentEverySub) {
        this.loanTermSubscriptions.push(repaymentEverySub);
      }
      if (loanTermFrequencyTypeSub) {
        this.loanTermSubscriptions.push(loanTermFrequencyTypeSub);
      }
      if (amortizationTypeSub) {
        this.loanTermSubscriptions.push(amortizationTypeSub);
      }
    }
  }

  /**
   * Component cleanup
   */
  ngOnDestroy(): void {
    this.clearLoanTermListeners();
  }

  setAdvancedPaymentStrategyControls(): void {
    // Fixed Length validation
    if (this.loansAccountTermsData) {
      this.loansAccountTermsForm.removeControl('interestRatePerPeriod');
      this.loansAccountTermsForm.removeControl('fixedLength');
      if (this.loansAccountTermsData.product.fixedLength) {
        this.loansAccountTermsForm.addControl(
          'interestRatePerPeriod',
          new UntypedFormControl({ value: 0, disabled: true }, Validators.required)
        );
        this.loansAccountTermsForm.addControl(
          'fixedLength',
          new UntypedFormControl(this.loansAccountTermsData.product.fixedLength)
        );
      } else {
        // For LOC products, use the LOC-specific interest rate if available
        let interestRateValue = this.loansAccountTermsData.interestRatePerPeriod;
        let frequencyTypeId = this.loansAccountTermsData.interestRateFrequencyType.id;

        if (this.isLocProduct()) {
          const locInterestRate = this.getInterestRateForLoc();
          if (locInterestRate !== null) {
            interestRateValue = locInterestRate;
          }

          const perAnnumFrequencyTypeId = this.getPerAnnumInterestRateFrequencyTypeId();
          if (perAnnumFrequencyTypeId !== null) {
            frequencyTypeId = perAnnumFrequencyTypeId;
          }
        }
        this.loansAccountTermsForm.addControl(
          'interestRatePerPeriod',
          new UntypedFormControl(interestRateValue, Validators.required)
        );

        this.loansAccountTermsForm.addControl(
          'interestRateFrequencyType',
          new UntypedFormControl(frequencyTypeId, Validators.required)
        );
      }
    }
  }

  hasFixedLength(): boolean {
    if (this.loansAccountTermsData) {
      return this.loansAccountTermsData.product?.fixedLength ? true : false;
    }
    return false;
  }

  isEqualPrincipalPayments(): boolean {
    return this.loansAccountTermsForm.value.amortizationType === 0;
  }

  /** Create Loans Account Terms Form */
  createloansAccountTermsForm() {
    this.loansAccountTermsForm = this.formBuilder.group({
      factorRate: [''],
      factorRateEnabled: [false],
      principalAmount: [
        '',
        Validators.required
      ],
      loanTermFrequency: [
        '',
        Validators.required
      ],
      loanTermFrequencyType: [
        '',
        Validators.required
      ],
      numberOfRepayments: [
        '',
        Validators.required
      ],
      repaymentEvery: [
        '',
        Validators.required
      ],
      repaymentFrequencyType: [
        { value: '', disabled: true },
        Validators.required
      ],
      repaymentFrequencyNthDayType: [''],
      repaymentFrequencyDayOfWeekType: [''],
      repaymentsStartingFromDate: [''],
      interestChargedFromDate: [''],
      interestRatePerPeriod: [''],
      interestType: [''],
      isFloatingInterestRate: [''],
      isEqualAmortization: [''],
      amortizationType: [
        '',
        Validators.required
      ],
      interestCalculationPeriodType: [''],
      allowPartialPeriodInterestCalculation: [''],
      inArrearsTolerance: [''],
      graceOnInterestCharged: [''],
      graceOnPrincipalPayment: [''],
      graceOnInterestPayment: [''],
      graceOnArrearsAgeing: [''],
      loanIdToClose: [''],
      fixedEmiAmount: [''],
      isTopup: [''],
      maxOutstandingLoanBalance: [''],
      interestRateDifferential: [''],
      transactionProcessingStrategyCode: [
        '',
        Validators.required
      ],
      multiDisburseLoan: [false],
      interestRateFrequencyType: [''],
      balloonRepaymentAmount: [''],
      interestRecognitionOnDisbursementDate: [false]
    });
  }

  calculateLoanTerm(numberOfRepayments: number, repaymentEvery: number): void {
    const loanTerm = numberOfRepayments * repaymentEvery;
    this.loansAccountTermsForm.patchValue({ loanTermFrequency: loanTerm });
  }

  /**
   * Gets the Disbursement Data array.
   * @returns {Array} Disbursement Data array.
   */
  get disbursementData() {
    return {
      disbursementData: this.disbursementDataSource
    };
  }

  /**
   * Adds the Disbursement Data entry form to given Disbursement Data entry.
   */
  addDisbursementDataEntry() {
    const currentPrincipalAmount = this.loansAccountTermsForm.get('principalAmount').value;
    const formfields: FormfieldBase[] = [
      new DatepickerBase({
        controlName: 'expectedDisbursementDate',
        label: 'Expected Disbursement Date',
        value: new Date() || '',
        type: 'datetime-local',
        minDate: this.minDate,
        maxDate: this.maxDate,
        required: true,
        order: 1
      }),
      new InputBase({
        controlName: 'principal',
        label: `Principal(It should be less than equal to the ${currentPrincipalAmount})`,
        value: '',
        type: 'number',
        required: true,
        order: 2
      })

    ];
    const data = {
      title: 'Add Disbursement Details',
      layout: { addButtonText: 'Add' },
      formfields: formfields
    };
    const disbursementDialogRef = this.dialog.open(FormDialogComponent, { data });
    disbursementDialogRef.afterClosed().subscribe((response: any) => {
      if (response.data) {
        const principal = response.data.value.principal * 1;
        if (this.totalMultiDisbursed + principal <= currentPrincipalAmount) {
          this.disbursementDataSource = this.disbursementDataSource.concat(response.data.value);
          this.totalMultiDisbursed += principal;
          this.isMultiDisbursedCompleted = this.totalMultiDisbursed === currentPrincipalAmount;
          this.pristine = false;
        }
      }
    });
  }

  /**
   * Removes the Disbursement Data entry form from given Disbursement Data entry form array at given index.
   * @param {number} index Array index from where Disbursement Data entry form needs to be removed.
   */
  removeDisbursementDataEntry(index: number) {
    const currentPrincipalAmount = this.loansAccountTermsForm.get('principalAmount').value;
    const dialogRef = this.dialog.open(DeleteDialogComponent, {
      data: { deleteContext: `this` }
    });
    dialogRef.afterClosed().subscribe((response: any) => {
      if (response.delete) {
        const principal = (this.disbursementDataSource[index] as any)['principal'] * 1;
        this.disbursementDataSource.splice(index, 1);
        this.disbursementDataSource = this.disbursementDataSource.concat([]);
        this.totalMultiDisbursed -= principal;
        this.isMultiDisbursedCompleted = this.totalMultiDisbursed === currentPrincipalAmount;
      }
    });
  }

  /**
   * Add a Collateral to the loan
   */
  addCollateral() {
    const addCollateralDialogRef = this.dialog.open(LoansAccountAddCollateralDialogComponent, {
      data: { collateralOptions: this.collateralOptions }
    });
    addCollateralDialogRef.afterClosed().subscribe((response: any) => {
      if (response.data) {
        const collateralData = {
          type: response.data.value.collateral,
          value: response.data.value.quantity
        };
        this.totalCollateralValue +=
          (collateralData.type.pctToBase * collateralData.type.basePrice * collateralData.value) / 100;
        this.collateralDataSource = this.collateralDataSource.concat(collateralData);
        this.collateralOptions = this.collateralOptions.filter(
          (user: any) => user.collateralId !== response.data.value.collateral.collateralId
        );
        if (this.loanPrincipal < this.totalCollateralValue) {
          this.isCollateralSufficient = true;
        } else {
          this.isCollateralSufficient = false;
        }
      }
    });
  }
  /**
   * Delete a added collateral from loan
   * @param id ID od the collateral to be deleted
   */
  deleteCollateral(id: any) {
    const deleteCollateralDialogRef = this.dialog.open(DeleteDialogComponent, {
      data: { deleteContext: `collateral` }
    });
    deleteCollateralDialogRef.afterClosed().subscribe((response: any) => {
      if (response.delete) {
        const removed: any = this.collateralDataSource.splice(id, 1);
        this.collateralOptions = this.collateralOptions.concat(removed[0].type);
        this.totalCollateralValue -= (removed[0].type.pctToBase * removed[0].type.basePrice * removed[0].value) / 100;
        this.collateralDataSource = this.collateralDataSource.concat([]);
        this.pristine = false;
        if (this.loanPrincipal < this.totalCollateralValue) {
          this.isCollateralSufficient = true;
        } else {
          this.isCollateralSufficient = false;
        }
      }
    });
  }

  /**
   * Sets all select dropdown options.
   */
  setOptions() {
    this.termFrequencyTypeData = this.loansAccountProductTemplate.termFrequencyTypeOptions;
    this.repaymentFrequencyNthDayTypeData = this.loansAccountProductTemplate.repaymentFrequencyNthDayTypeOptions;
    this.repaymentFrequencyDaysOfWeekTypeData =
      this.loansAccountProductTemplate.repaymentFrequencyDaysOfWeekTypeOptions;
    this.interestTypeData = this.loansAccountProductTemplate.interestTypeOptions;
    this.amortizationTypeData = this.loansAccountProductTemplate.amortizationTypeOptions;
    this.interestCalculationPeriodTypeData = this.loansAccountProductTemplate.interestCalculationPeriodTypeOptions;
    this.clientActiveLoanData = this.loansAccountProductTemplate.clientActiveLoanOptions;
    this.loanScheduleType = this.loansAccountProductTemplate.loanScheduleType;
    this.transactionProcessingStrategyOptions = [];
    if (
      this.loanScheduleType.code === LoanProducts.LOAN_SCHEDULE_TYPE_CUMULATIVE ||
      this.loanScheduleType.code === LoanProducts.LINE_OF_CREDIT
    ) {
      // Filter Advanced Payment Allocation Strategy
      this.transactionProcessingStrategyOptions =
        this.loansAccountProductTemplate.transactionProcessingStrategyOptions.filter(
          (cn: CodeName) => !LoanProducts.isAdvancedPaymentAllocationStrategy(cn.code)
        );
      this.repaymentStrategyDisabled = false;
    } else {
      // Only Advanced Payment Allocation Strategy
      this.loansAccountProductTemplate.transactionProcessingStrategyOptions.some((cn: CodeName) => {
        if (LoanProducts.isAdvancedPaymentAllocationStrategy(cn.code)) {
          this.transactionProcessingStrategyOptions.push(cn);
        }
      });
      this.repaymentStrategyDisabled = true;
    }
  }

  isDelinquencyEnabled(): boolean {
    return !!this.loanProduct?.delinquencyBucket?.name;
  }

  /**
   * Returns loans account terms form value.
   */
  get loansAccountTerms() {
    return this.loansAccountTermsForm.getRawValue();
  }

  get loanCollateral() {
    return {
      collateral: this.collateralDataSource
    };
  }

  /** Dynamic label for principal field */
  get principalLabel(): string {
    return this.locSelected ? 'Principal/Invoice Amount' : 'Principal';
  }

  /**
   * Checks if the current product is a LOC product
   */
  private isLocProduct(): boolean {
    // Check if LOC is enabled in the product template
    return !!(
      this.loansAccountProductTemplate?.additionalProperties?.isLocEnabled ||
      this.loansAccountTemplate?.additionalProperties?.isLocEnabled ||
      (this.locOptions && this.locOptions.length > 0)
    );
  }

  /**
   * Gets interest rate for LOC products from additionalProperties
   */
  private getInterestRateForLoc(): number | null {
    if (!this.locOptions || this.locOptions.length === 0 || !this.selectedLocId) {
      return null;
    }

    // Use loose equality to handle potential string/number mismatches
    const selectedLoc = this.locOptions.find((loc: any) => loc.id == this.selectedLocId);
    return selectedLoc?.interestRate !== undefined ? selectedLoc.interestRate : null;
  }

  /**
   * Gets the "Per Year" (annual) interest rate frequency type ID
   */
  private getPerAnnumInterestRateFrequencyTypeId(): number | null {
    const frequencyTypeOptions =
      this.loansAccountProductTemplate?.interestRateFrequencyTypeOptions ||
      this.loansAccountTermsData?.interestRateFrequencyTypeOptions;

    if (!frequencyTypeOptions) {
      return null;
    }
    // Find the "Per Year" option (typically code 'PER_YEAR' or value 'Per year' or id 3)
    const perYearOption = frequencyTypeOptions.find(
      (option: any) => option.code === 'interestRateFrequency.periodFrequencyType.years'
    );

    return perYearOption?.id || null;
  }

  /**
   * Gets tenor days for LOC products from additional properties or selected LOC
   */
  private getTenorDaysForLoc(): number | null {
    // First, try to get tenor days from selected LOC
    const tenorFromSelectedLoc = this.getTenorDaysFromSelectedLoc();
    if (tenorFromSelectedLoc) {
      return tenorFromSelectedLoc;
    }

    // For edit mode - check additionalProperties first
    if (this.loansAccountTemplate?.additionalProperties?.tenorDays) {
      return this.loansAccountTemplate.additionalProperties.tenorDays;
    }

    // For create mode - check product template
    if (this.loansAccountProductTemplate?.additionalProperties?.tenorDays) {
      return this.loansAccountProductTemplate.additionalProperties.tenorDays;
    }

    // Check if available in the main template data
    if (this.loansAccountTermsData?.tenorDays) {
      return this.loansAccountTermsData.tenorDays;
    }

    return null;
  }

  /**
   * Gets tenor days from the currently selected LOC
   */
  private getTenorDaysFromSelectedLoc(): number | null {
    if (!this.locOptions || this.locOptions.length === 0 || !this.selectedLocId) {
      return null;
    }

    // Use loose equality to handle potential string/number mismatches
    const selectedLoc = this.locOptions.find((loc: any) => loc.id == this.selectedLocId);
    return selectedLoc?.tenorDays || null;
  }

  /**
   * Updates loan term frequency when LOC selection changes
   */
  private updateLoanTermForSelectedLoc(): void {
    if (!this.isLocProduct() || !this.loansAccountTermsForm) {
      return;
    }

    const tenorDays = this.getTenorDaysFromSelectedLoc();
    if (tenorDays) {
      // Find the ID for "DAYS" frequency type
      const daysFrequencyType = this.loansAccountProductTemplate?.termFrequencyTypeOptions?.find(
        (option: any) => option.code === 'DAYS' || option.value === 'Days'
      );

      // Update the form with the new tenor days, but preserve user input if they've modified values
      this.patchFormPreservingUserInput({
        loanTermFrequency: tenorDays,
        loanTermFrequencyType: daysFrequencyType?.id || this.loansAccountTermsForm.get('loanTermFrequencyType')?.value
      });
    }

    // Ensure fields remain enabled for LOC products (users can still edit)
    this.handleLocProductTerms();

    this.forceSetupLoanTermListeners();
  }

  /**
   * Handles loan term and frequency restrictions for LOC products
   */
  private handleLocProductTerms(): void {
    const isLocProduct = this.isLocProduct();

    if (isLocProduct) {
      // For LOC products, set frequency type to days but keep fields editable
      const daysFrequencyType = this.loansAccountProductTemplate?.termFrequencyTypeOptions?.find(
        (option: any) => option.code === 'DAYS' || option.value === 'Days'
      );
      if (daysFrequencyType) {
        // Only set to DAYS if user hasn't specifically chosen a different frequency type
        const currentFrequencyType = this.loansAccountTermsForm.get('loanTermFrequencyType');
        if (currentFrequencyType && (currentFrequencyType.pristine || !currentFrequencyType.value)) {
          this.loansAccountTermsForm.patchValue({
            loanTermFrequencyType: daysFrequencyType.id
          });
        }
      }
    }

    // Always ensure loan term fields are enabled for both LOC and non-LOC products
    this.loansAccountTermsForm.get('loanTermFrequency')?.enable();
    this.loansAccountTermsForm.get('loanTermFrequencyType')?.enable();
  }

  /**
   * Patches form values while preserving user input.
   * Only updates fields that haven't been modified by the user.
   */
  private patchFormPreservingUserInput(newValues: any): void {
    if (!this.loansAccountTermsForm) {
      return;
    }

    const patchData: any = {};

    // Go through each field in newValues
    Object.keys(newValues).forEach((key) => {
      const control = this.loansAccountTermsForm.get(key);
      if (control) {
        const currentValue = control.value;
        const newValue = newValues[key];

        // Preserve user input by checking if the field has been touched/modified
        // Only patch if:
        // 1. Form is pristine (no user interaction) OR
        // 2. Control is pristine (this specific field not touched) OR
        // 3. Current value is empty/null/undefined (no user input to preserve)
        const shouldPatch =
          this.loansAccountTermsForm.pristine ||
          control.pristine ||
          currentValue === null ||
          currentValue === undefined ||
          currentValue === '' ||
          this.isInitialLoad;

        if (shouldPatch) {
          patchData[key] = newValue;
        }
      } else {
        // If control doesn't exist, always include it
        patchData[key] = newValues[key];
      }
    });

    // Apply the patch
    if (Object.keys(patchData).length > 0) {
      this.loansAccountTermsForm.patchValue(patchData, { emitEvent: false });
    }
  }
}
