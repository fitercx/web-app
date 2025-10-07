/** Angular Imports */
import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ValidatorFn,
  AbstractControl,
  FormArray,
  ValidationErrors
} from '@angular/forms';
import { MatStepper } from '@angular/material/stepper';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';

/** Custom Services */
import { ClientsService } from '../../../clients.service';
import { SettingsService } from 'app/settings/settings.service';

/**
 * Edit LOC component.
 */
@Component({
  selector: 'mifosx-edit-loc',
  templateUrl: './edit-loc.component.html',
  styleUrls: ['./edit-loc.component.scss']
})
export class EditLocComponent implements OnInit {
  locForm!: FormGroup;
  @ViewChild('locStepper') locStepper?: MatStepper;
  clientId: string;
  locId: string;
  clientName: string = 'John Doe'; // Mocked client name
  currencyOptions: any[] = [];
  // Charges UI data (for compact charges step)
  chargeData: any[] = [];
  private allLocCharges: any[] = [];
  chargesDataSource: any[] = [];
  displayedColumns: string[] = [
    'name',
    'amount',
    'action'
  ];
  editingCharge: any = null;
  // template-driven option lists
  locTemplate: any = null;
  productTypeOptions: any[] = [];
  reviewPeriodsOptions: any[] = [];
  activationStatusOptions: any[] = [];
  updateError: string | null = null;
  // Settlement account options (client savings)
  savingsAccounts: any[] = [];
  /** Loan Officer Data */
  loanOfficerOptions: any[] = [];
  /** Cash Margin Type Options */
  cashMarginTypeOptions: any[] = [];
  /** Interest Charge Time Options */
  interestChargeTimeOptions: any[] = [];
  // Original LOC data for prepopulation
  originalLocData: any = null;

  // Dynamic labels for buyers/suppliers
  buyerSupplierLabel: string = 'Buyer';
  approvedBuyerSupplierLabel: string = 'Approved Buyer';

  // Vendor editing properties
  editingVendorIndex: number | null = null;
  editingVendorName: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private formBuilder: FormBuilder,
    private clientsService: ClientsService,
    private settingsService: SettingsService,
    private cdr: ChangeDetectorRef
  ) {
    this.clientId =
      this.route.parent?.parent?.snapshot.paramMap.get('clientId') ||
      this.route.parent?.snapshot.paramMap.get('clientId') ||
      '';
    this.locId = this.route.parent?.snapshot.paramMap.get('locId') || this.route.snapshot.paramMap.get('locId') || '';
  }

  // Return the currently selected currency code (used as suffix on currency fields)
  get selectedCurrencyCode(): string {
    try {
      const code = this.locForm?.get([
        'basicInfo',
        'currencyCode'
      ])?.value;
      if (code) {
        return code;
      }
      if (this.currencyOptions && this.currencyOptions.length) {
        return this.currencyOptions[0].code;
      }
    } catch (e) {
      // ignore
    }
    return '';
  }

  // Savings accounts filtered by the currently selected currency code
  get filteredSavingsAccounts(): any[] {
    const code = this.selectedCurrencyCode;
    if (!code) {
      return this.savingsAccounts;
    }
    return (this.savingsAccounts || []).filter((sa) => {
      // Common shapes: sa.currency.code OR sa.currencyCode
      const acctCode = sa?.currency?.code || sa?.currencyCode || sa?.currency;
      return acctCode === code;
    });
  }

  // Get display name for cash margin type
  getCashMarginTypeDisplay(typeCode: string): string {
    const type = this.cashMarginTypeOptions.find((cmt) => cmt.code === typeCode);
    return type?.value || typeCode || '';
  }

  // Get display name for interest charge time
  getInterestChargeTimeDisplay(timeIdOrCode: any): string {
    if (!this.interestChargeTimeOptions || timeIdOrCode === undefined) {
      return '';
    }

    // Try to find by ID first (for new integer-based values)
    let time = this.interestChargeTimeOptions.find((ict) => ict.id == timeIdOrCode);

    // Fallback to find by code (for legacy string-based values)
    if (!time) {
      time = this.interestChargeTimeOptions.find((ict) => ict.code === timeIdOrCode);
    }

    return time?.value || timeIdOrCode || '';
  }

  // Update buyer/supplier labels based on product type
  updateBuyerSupplierLabels(productType: any) {
    // Find the product type option to get its code/value
    let productTypeOption = this.productTypeOptions.find((pt) => pt.id == productType);
    if (!productTypeOption) {
      productTypeOption = this.productTypeOptions.find((pt) => pt.code === productType || pt.value === productType);
    }

    const productTypeCode = productTypeOption?.code || productTypeOption?.value || productType;

    // Check for payable variations (could be 'payable', 'PAYABLE', 'Payable', etc.)
    if (productTypeCode && productTypeCode.toString().toLowerCase().includes('payable')) {
      this.buyerSupplierLabel = 'Supplier';
      this.approvedBuyerSupplierLabel = 'Approved Supplier';
    } else if (productTypeCode && productTypeCode.toString().toLowerCase().includes('receivable')) {
      this.buyerSupplierLabel = 'Buyer';
      this.approvedBuyerSupplierLabel = 'Approved Buyer';
    } else {
      // Default fallback
      this.buyerSupplierLabel = 'Buyer';
      this.approvedBuyerSupplierLabel = 'Approved Buyer';
    }
  }

  // ---- Vendors helpers ----
  get approvedBuyersArray(): FormArray {
    return this.locForm.get([
      'approvedBuyersSection',
      'approvedBuyers'
    ]) as FormArray;
  }

  // Custom review period handling
  get isCustomReviewPeriod(): boolean {
    return (
      this.locForm?.get([
        'limitsTerms',
        'reviewPeriod'
      ])?.value === 'custom'
    );
  }

  ngOnInit() {
    this.createForm();

    // Load resolved data
    this.loadResolvedData();

    // Prepopulate form with existing LOC data
    this.prepopulateForm();

    // react to reviewPeriod changes to compute nextReviewDate (example computed field)
    this.locForm
      .get([
        'limitsTerms',
        'reviewPeriod'
      ])
      ?.valueChanges.subscribe((val) => {
        this.computeInterimReviewDate();
        this.handleReviewPeriodChange(val);
      });

    // also recompute when start date changes
    this.locForm
      .get([
        'limitsTerms',
        'startDate'
      ])
      ?.valueChanges.subscribe((val) => {
        this.computeExpiryDate();
      });

    // Update available charges when currency changes
    this.locForm
      .get([
        'basicInfo',
        'currencyCode'
      ])
      ?.valueChanges.subscribe(() => this.updateFilteredCharges());

    // Watch settlement account changes
    this.locForm.get('settlementSavingsAccountId')?.valueChanges.subscribe(() => this.onSettlementAccountChanged());

    // Watch product type changes to update advance percentage
    this.locForm
      .get([
        'basicInfo',
        'productType'
      ])
      ?.valueChanges.subscribe((productType) => {
        this.updateAdvancePercentage(productType);
        this.updateBuyerSupplierLabels(productType);
        this.updateInterestChargeTime(productType);
      });

    // Mock fetching client data
    of({ id: this.clientId, displayName: 'John Doe' })
      .pipe(delay(500))
      .subscribe((client) => {
        this.clientName = client.displayName;
      });
  }

  private loadResolvedData() {
    // Load original LOC data
    const locData = this.route.snapshot.data['locData'];
    if (locData) {
      this.originalLocData = locData;
    }

    // Resolve charges (fetched via resolver) and keep only LOC applicable (chargeAppliesTo.id === 5)
    const chargesResolved = this.route.snapshot.data['charges'];
    if (chargesResolved) {
      const extracted = this.extractChargesArray(chargesResolved);
      this.allLocCharges = extracted.filter((c) => c?.chargeAppliesTo?.id === 5);
      this.updateFilteredCharges();
    }

    // read resolved LOC template
    const locTemplate = this.route.snapshot.data['clientLocTemplate'];
    if (locTemplate) {
      this.locTemplate = locTemplate;
      this.productTypeOptions = locTemplate.productTypeOptions || [];
      this.reviewPeriodsOptions = locTemplate.reviewPeriodsOptions || [];
      this.activationStatusOptions = locTemplate.activationStatusOptions || [];
      this.loanOfficerOptions = locTemplate.loanOfficers || [];
      this.cashMarginTypeOptions = locTemplate.cashMarginTypeOptions || [];
      this.interestChargeTimeOptions = locTemplate.interestChargeTimeOptions || [];

      // Add custom option to review periods
      this.reviewPeriodsOptions.push({
        id: 'custom',
        value: 'Custom',
        code: 'CUSTOM'
      });

      // Update labels and interest charge time based on current product type now that options are loaded
      const currentProductType = this.locForm.get([
        'basicInfo',
        'productType'
      ])?.value;
      if (currentProductType) {
        this.updateBuyerSupplierLabels(currentProductType);
        this.updateInterestChargeTime(currentProductType);
      }
    }

    // read resolved currencies from route
    const currenciesResolved = this.route.snapshot.data['currencies'];
    if (currenciesResolved) {
      // Resolver usually returns an object with selectedCurrencyOptions array
      if (Array.isArray(currenciesResolved.selectedCurrencyOptions)) {
        this.currencyOptions = currenciesResolved.selectedCurrencyOptions;
      } else if (Array.isArray(currenciesResolved)) {
        // fallback: resolver returned an array directly
        this.currencyOptions = currenciesResolved as any[];
      } else if (Array.isArray(currenciesResolved.pageItems)) {
        // some endpoints return pageItems
        this.currencyOptions = currenciesResolved.pageItems;
      }
    }

    // Load client savings accounts for settlement account dropdown from resolver data
    const clientAccountsData = this.route.snapshot.data['clientAccountsData'];
    if (clientAccountsData) {
      this.savingsAccounts = clientAccountsData?.savingsAccounts || clientAccountsData?.savingAccounts || [];
    }
  }

  private prepopulateForm() {
    if (!this.originalLocData) return;

    const loc = this.originalLocData;

    // Prepopulate basic info
    this.locForm.patchValue({
      basicInfo: {
        productType: this.getProductTypeId(loc.productType),
        currencyCode: loc.currency || loc.currency?.code || loc.currencyCode || '',
        clientCompanyName: loc.clientCompanyName || '',
        clientContactPersonName: loc.clientContactPersonName || '',
        clientContactPersonPhone: loc.clientContactPersonPhone || '',
        clientContactPersonEmail: loc.clientContactPersonEmail || '',
        authorizedSignatoryName: loc.authorizedSignatoryName || '',
        authorizedSignatoryPhone: loc.authorizedSignatoryPhone || '',
        authorizedSignatoryEmail: loc.authorizedSignatoryEmail || '',
        virtualAccount: loc.virtualAccount || loc.va || '',
        externalId: loc.externalId || '',
        specialConditions: loc.specialConditions || ''
      },
      approvedBuyersSection: {
        distributionPartner: loc.distributionPartner || '',
        approvedBuyersName: ''
      },

      limitsTerms: {
        maxCreditLimit: loc.maximumAmount || loc.maxCreditLimit || '',
        startDate: this.formatDateForInput(loc.startDate || loc.activationDate),
        expiryDate: this.formatDateForInput(loc.endDate || loc.expiryDate),
        reviewPeriod: loc.reviewPeriod || '6', // Default to 6 months if not set
        annualInterestRate: loc.annualInterestRate || undefined,
        tenorDays: loc.tenorDays || undefined,
        advancePercentage: loc.advancePercentage || undefined,
        cashMarginType: this.getCashMarginTypeId(loc.cashMarginType),
        cashMarginValue: loc.cashMarginValue || '',
        interestChargeTime: this.getInterestChargeTimeId(loc.interestChargeTime),
        loanOfficerId: loc.loanOfficerId || ''
      },
      settlementSavingsAccountId: loc.settlementSavingsAccountId || ''
    });

    // Prepopulate charges if any
    if (loc.charges && Array.isArray(loc.charges)) {
      this.chargesDataSource = loc.charges.map((charge: any) => {
        // Find the charge definition in allLocCharges to get name and other properties
        const chargeDefinition = this.allLocCharges.find((c) => c.id === charge.chargeDefinitionId);

        return {
          ...charge,
          // Include name and other properties from charge definition
          name: chargeDefinition?.name || 'Unknown Charge',
          calculationType: chargeDefinition?.chargeCalculationType || {},
          chargeTimeType: chargeDefinition?.chargeTimeType || {},
          penalty: chargeDefinition?.penalty || false,
          active: chargeDefinition?.active || false,
          // Add editing state
          isEditing: false
        };
      });
    }

    // Update buyer/supplier labels and compute interim review date
    const productType = this.locForm.get([
      'basicInfo',
      'productType'
    ])?.value;
    this.updateBuyerSupplierLabels(productType);
    this.computeInterimReviewDate();

    // Set the correct interest charge time based on product type
    if (productType && this.interestChargeTimeOptions && this.interestChargeTimeOptions.length > 0) {
      this.updateInterestChargeTime(productType);
    }

    // Prepopulate approved buyers if any
    const approvedBuyersData = loc.approvedBuyers || loc.approvedBuyersList;
    if (approvedBuyersData && Array.isArray(approvedBuyersData)) {
      const approvedBuyersArray = this.approvedBuyersArray;
      approvedBuyersData.forEach((buyer: any) => {
        approvedBuyersArray.push(this.formBuilder.control({ name: buyer.name || buyer }));
      });
    }

    // Trigger change detection to ensure UI updates with prepopulated data
    this.cdr.detectChanges();

    // Compute interim review date after patching values
    this.computeInterimReviewDate();
  }

  getProductTypeLabel(productTypeId: any): string {
    if (!this.productTypeOptions || productTypeId === undefined) {
      return '';
    }

    const option = this.productTypeOptions.find((pt) => pt.id == productTypeId);
    return option ? option.value || option.code : '';
  }

  getCashMarginValueSuffix(cashMarginTypeId: any, cashMarginValue: any): string {
    if (!cashMarginValue || !this.cashMarginTypeOptions || cashMarginTypeId === undefined) {
      return '';
    }

    const option = this.cashMarginTypeOptions.find((cmt) => cmt.id == cashMarginTypeId);
    if (!option) return '';

    if (option.code === 'PERCENTAGE') {
      return '%';
    } else if (option.code === 'FLAT') {
      return ' ' + (this.selectedCurrencyCode || '');
    }

    return '';
  }

  isCashMarginTypeSelected(code: string): boolean {
    const selectedId = this.locForm.get([
      'limitsTerms',
      'cashMarginType'
    ])?.value;
    if (!this.cashMarginTypeOptions || selectedId === undefined) {
      return false;
    }

    const option = this.cashMarginTypeOptions.find((cmt) => cmt.id == selectedId);
    return option && option.code === code;
  }

  private getInterestChargeTimeId(interestChargeTime: string): any {
    if (!this.interestChargeTimeOptions || !interestChargeTime) {
      return '';
    }

    const option = this.interestChargeTimeOptions.find(
      (ict) =>
        ict.code === interestChargeTime ||
        ict.code === interestChargeTime.toUpperCase() ||
        ict.value === interestChargeTime
    );

    return option ? option.id : '';
  }

  private getCashMarginTypeId(cashMarginType: string): any {
    if (!this.cashMarginTypeOptions || !cashMarginType) {
      return '';
    }

    const option = this.cashMarginTypeOptions.find(
      (cmt) => cmt.code === cashMarginType || cmt.code === cashMarginType.toUpperCase() || cmt.value === cashMarginType
    );

    return option ? option.id : '';
  }

  private getProductTypeId(productType: string): any {
    if (!this.productTypeOptions || !productType) {
      return '';
    }

    const option = this.productTypeOptions.find(
      (pt) => pt.code === productType || pt.code === productType.toUpperCase() || pt.value === productType
    );

    return option ? option.id : '';
  }

  private formatDateForInput(dateValue: any): string {
    if (!dateValue) return '';

    // Handle backend date arrays [YYYY, M, D]
    if (Array.isArray(dateValue) && dateValue.length >= 3) {
      const [
        y,
        m,
        d
      ] = dateValue;
      return new Date(y, (m as number) - 1, d).toISOString().slice(0, 10);
    }

    // Handle ISO strings or Date objects
    try {
      const date = new Date(dateValue);
      return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    } catch (e) {
      return '';
    }
  }

  /** Safely extract array of charges from various backend response shapes */
  private extractChargesArray(raw: any): any[] {
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw;
    }
    if (Array.isArray(raw.pageItems)) {
      return raw.pageItems;
    }
    if (Array.isArray(raw.items)) {
      return raw.items;
    }
    return [];
  }

  /** Returns currency code for a charge object */
  private chargeCurrencyCode(charge: any): string {
    return charge?.currency?.code || charge?.currencyCode || charge?.currency || '';
  }

  /** Filter all LOC charges by currently selected currency and prune any added charges that no longer match */
  private updateFilteredCharges() {
    const code = this.selectedCurrencyCode;
    if (!code) {
      this.chargeData = [...this.allLocCharges];
    } else {
      this.chargeData = this.allLocCharges.filter((c) => this.chargeCurrencyCode(c) === code);
    }
    // Remove already added charges whose currency no longer matches selected currency
    const before = this.chargesDataSource.length;
    this.chargesDataSource = this.chargesDataSource.filter((c) => this.chargeCurrencyCode(c) === code);
    if (before !== this.chargesDataSource.length) {
      this.editingCharge = null;
    }
  }

  // Custom validator to ensure at least one approved buyer/supplier
  approvedBuyersValidator = (control: AbstractControl): ValidationErrors | null => {
    const approvedBuyersArray = control.get('approvedBuyers') as FormArray;
    if (!approvedBuyersArray || approvedBuyersArray.length === 0) {
      return { requiredApprovedBuyers: true };
    }
    return null;
  };

  /**
   * Removes empty/null/undefined values from an object to avoid sending them to backend
   * @param obj Object to clean
   * @returns Object with empty values removed
   */
  private removeEmptyValues(obj: any): any {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        // Only include non-empty values
        if (
          value !== null &&
          value !== undefined &&
          value !== '' &&
          !(Array.isArray(value) && value.length === 0) &&
          !(typeof value === 'object' && Object.keys(value).length === 0)
        ) {
          // For objects, recursively clean them
          if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
            const cleanedNested = this.removeEmptyValues(value);
            if (Object.keys(cleanedNested).length > 0) {
              cleaned[key] = cleanedNested;
            }
          } else {
            cleaned[key] = value;
          }
        }
      }
    }
    return cleaned;
  }

  /**
   * Formats dates according to system settings
   * @param dates Object containing date fields to format
   * @param formatType 'backend' for API submission (yyyy-MM-dd), 'display' for preview (dd MMMM yyyy)
   * @returns Object with formatted dates
   */
  private formatDates(dates: any, formatType: 'backend' | 'display' = 'backend'): any {
    try {
      const dateFormat =
        formatType === 'backend'
          ? this.settingsService.dateFormat || 'yyyy-MM-dd'
          : this.settingsService.dateFormat || 'dd MMMM yyyy';
      const locale = this.settingsService.language?.code || this.settingsService.languageCode || 'en';
      const dp = new DatePipe(locale);

      const result = { ...dates };
      const dateKeys = [
        'startDate',
        'endDate',
        'expiryDate',
        'activationDate',
        'interimReviewDate'
      ];

      dateKeys.forEach((k) => {
        if (result[k]) {
          const parsedDate = new Date(result[k]);
          if (!isNaN(parsedDate.getTime())) {
            const formatted = dp.transform(parsedDate, dateFormat);
            if (formatted) {
              result[k] = formatted;
            }
          }
        }
      });

      return result;
    } catch (e) {
      console.warn('Date formatting failed', e);
      return dates;
    }
  }

  createForm() {
    // Nested groups so each step can have its own validators
    this.locForm = this.formBuilder.group({
      basicInfo: this.formBuilder.group({
        productType: [
          'payable',
          Validators.required
        ],
        currencyCode: [''],
        clientCompanyName: [''],
        clientContactPersonName: [''],
        clientContactPersonPhone: [''],
        clientContactPersonEmail: [''],
        authorizedSignatoryName: [''],
        authorizedSignatoryPhone: [''],
        authorizedSignatoryEmail: [''],
        virtualAccount: [''],
        externalId: [
          '',
          Validators.required
        ],
        specialConditions: ['']
      }),
      // Vendors step (list of vendor objects { name })
      approvedBuyersSection: this.formBuilder.group(
        {
          distributionPartner: [''],
          approvedBuyersName: [''],
          approvedBuyers: this.formBuilder.array([])
        },
        { validators: [this.approvedBuyersValidator] }
      ),
      limitsTerms: this.formBuilder.group({
        maxCreditLimit: [
          '',
          Validators.required
        ],
        startDate: [''],
        expiryDate: [''],
        reviewPeriod: ['6'], // Default to 6 months
        interimReviewDate: [{ value: '', disabled: true }],
        interestPaymentType: [''],
        annualInterestRate: [
          '',
          Validators.required
        ],
        tenorDays: [
          '',
          Validators.required
        ],
        advancePercentage: [
          '100',
          Validators.required
        ],
        cashMarginType: [''],
        cashMarginValue: [''],
        interestChargeTime: [''],
        loanOfficerId: [
          ''
        ]
      }),
      settlementSavingsAccountId: ['']
    });

    // Set initial advance percentage based on default product type
    this.updateAdvancePercentage('payable');

    // Compute initial interim review date based on default review period
    this.computeInterimReviewDate();
  }

  selectProductType(type: string) {
    const control = this.locForm.get([
      'basicInfo',
      'productType'
    ]);
    control?.setValue(type);
  }

  // Handle review period change to enable/disable interim review date field
  handleReviewPeriodChange(value: string) {
    const interimReviewDateControl = this.locForm.get([
      'limitsTerms',
      'interimReviewDate'
    ]);

    if (value === 'custom') {
      interimReviewDateControl?.enable();
    } else {
      interimReviewDateControl?.disable();
      this.computeInterimReviewDate();
    }
  }

  // Example computed interim review date based on activationDate + reviewPeriod months
  computeInterimReviewDate() {
    const period = this.locForm.get([
      'limitsTerms',
      'reviewPeriod'
    ])?.value;
    const control = this.locForm.get([
      'limitsTerms',
      'interimReviewDate'
    ]);

    // Only compute for non-custom periods
    if (period && period !== 'custom') {
      const monthsToAdd = Number(period);

      if (!isNaN(monthsToAdd) && monthsToAdd > 0) {
        // Use today's date as the base for calculation
        const today = new Date();
        today.setMonth(today.getMonth() + monthsToAdd);
        const computedDate = today.toISOString().slice(0, 10);
        control?.setValue(computedDate);
      } else {
        control?.setValue('');
      }
    } else if (period === 'custom') {
      if (control?.disabled) {
        control?.setValue('');
      }
    } else {
      control?.setValue('');
    }
  }

  // Compute expiry date as 1 year after start date
  computeExpiryDate() {
    const startDate = this.locForm.get([
      'limitsTerms',
      'startDate'
    ])?.value;
    const expiryControl = this.locForm.get([
      'limitsTerms',
      'expiryDate'
    ]);

    if (startDate) {
      const start = new Date(startDate);
      const expiry = new Date(start);
      expiry.setFullYear(expiry.getFullYear() + 1);
      expiryControl?.setValue(expiry.toISOString().slice(0, 10));
    } else {
      expiryControl?.setValue('');
    }
  }

  // Update advance percentage based on product type
  updateAdvancePercentage(productType: string) {
    const advancePercentageControl = this.locForm.get([
      'limitsTerms',
      'advancePercentage'
    ]);

    if (productType === 'payable') {
      advancePercentageControl?.setValue('100');
    } else if (productType === 'receivable') {
      advancePercentageControl?.setValue('90');
    }
  }

  // Charges step helpers
  addCharge(chargeSelect: any) {
    if (chargeSelect && chargeSelect.value) {
      const c = { ...chargeSelect.value };
      // ensure editableAmount field for inline editing
      c.editableAmount = c.amount;
      this.chargesDataSource = this.chargesDataSource.concat([c]);
      chargeSelect.value = '';
    }
  }

  deleteCharge(charge: any) {
    const idx = this.chargesDataSource.indexOf(charge);
    if (idx > -1) {
      this.chargesDataSource.splice(idx, 1);
      this.chargesDataSource = this.chargesDataSource.concat([]);
    }
  }

  startEdit(charge: any) {
    this.editingCharge = charge;
    // copy current amount to editable field if not present
    charge.editableAmount = charge.editableAmount ?? charge.amount;
  }

  saveEdit(charge: any) {
    // apply edited value to charge.amount so it will be included in payload
    charge.amount = charge.editableAmount;
    this.editingCharge = null;
  }

  cancelEdit(charge: any) {
    // discard edits
    charge.editableAmount = charge.amount;
    this.editingCharge = null;
  }

  cancel() {
    this.router.navigate([
      '/clients',
      this.clientId,
      'loc',
      this.locId
    ]);
  }

  // React to settlement account selection (hide charges if removed)
  onSettlementAccountChanged() {
    const selected = this.locForm.get('settlementSavingsAccountId')?.value;
    if (!selected) {
      // Clear any previously added charges if no settlement account chosen
      this.chargesDataSource = [];
      this.editingCharge = null;
    }
  }

  submit() {
    if (this.locForm.valid) {
      // Flatten the nested groups into a single payload
      // Use getRawValue to include disabled controls (e.g., interimReviewDate)
      const value: any = this.locForm.getRawValue();

      // Clean up empty values before building payload
      const cleanBasicInfo = this.removeEmptyValues(value.basicInfo);
      const cleanLimitsTerms = this.removeEmptyValues(value.limitsTerms);

      const payload = {
        ...cleanBasicInfo,
        ...cleanLimitsTerms,
        // include vendors if any
        ...(value.approvedBuyersSection?.distributionPartner
          ? { distributionPartner: value.approvedBuyersSection.distributionPartner }
          : {}),
        ...(value.approvedBuyersSection?.approvedBuyers?.length
          ? { approvedBuyers: value.approvedBuyersSection.approvedBuyers }
          : {}),
        // include settlement account if selected
        ...(value.settlementSavingsAccountId ? { settlementSavingsAccountId: value.settlementSavingsAccountId } : {}),
        // Only include charges if there are any
        ...(this.chargesDataSource.length > 0 ? { charges: this.chargesDataSource } : {})
      };

      // Rename JSON field maxCreditLimit -> maximumAmount for backend
      if (payload.hasOwnProperty('maxCreditLimit')) {
        payload.maximumAmount = payload.maxCreditLimit;
        delete payload.maxCreditLimit;
      }

      // Rename expiryDate -> endDate for backend
      if (payload.hasOwnProperty('expiryDate')) {
        payload.endDate = payload.expiryDate;
        delete payload.expiryDate;
      }

      // Handle custom review period
      if (payload.reviewPeriod === 'custom') {
        delete payload.reviewPeriod;
      }

      // Format dates for backend submission and attach system locale and dateFormat
      try {
        const dateFormat = this.settingsService.dateFormat || 'yyyy-MM-dd';
        const locale = this.settingsService.language?.code || this.settingsService.languageCode || 'en';

        // Clean up empty dates first
        if (!payload.endDate) {
          delete payload.endDate;
        }

        // Format remaining dates
        const formattedPayload = this.formatDates(payload, 'backend');
        Object.assign(payload, formattedPayload);

        if (dateFormat) {
          payload.dateFormat = dateFormat;
        }
        if (locale) {
          payload.locale = locale;
        }
      } catch (e) {
        console.warn('Date formatting for backend failed', e);
      }

      // Call backend API to update the credit line
      this.updateError = null;
      this.clientsService.updateClientCreditLine(this.clientId, this.locId, payload).subscribe(
        (response: any) => {
          // Navigate back to LOC view
          this.router.navigate([
            '/clients',
            this.clientId,
            'loc',
            this.locId
          ]);
        },
        (err: any) => {
          console.error('Update LOC failed', err);
          this.updateError = err?.error?.developerMessage || err?.message || 'Failed to update line of credit';
        }
      );
    }
  }

  // Build a flattened payload for preview
  get previewPayload() {
    // Use getRawValue so disabled interimReviewDate is included in preview
    const v: any = this.locForm.getRawValue();
    const payload: any = {
      ...v.basicInfo,
      ...v.limitsTerms
    };
    if (v.approvedBuyersSection?.distributionPartner) {
      payload.distributionPartner = v.approvedBuyersSection.distributionPartner;
    }
    if (v.approvedBuyersSection?.approvedBuyers?.length) {
      payload.approvedBuyers = v.approvedBuyersSection.approvedBuyers;
    }
    if (v.settlementSavingsAccountId) {
      payload.settlementSavingsAccountId = v.settlementSavingsAccountId;
    }
    // Map preview fields to backend names so preview matches the eventual payload
    if (payload.hasOwnProperty('maxCreditLimit')) {
      payload.maximumAmount = payload.maxCreditLimit;
    }
    if (payload.hasOwnProperty('expiryDate')) {
      payload.endDate = payload.expiryDate;
    }
    if (payload.hasOwnProperty('activationDate')) {
      payload.startDate = payload.activationDate;
    }

    // Add review period display name
    if (payload.reviewPeriod && payload.reviewPeriod !== 'custom') {
      const reviewPeriodOption = this.reviewPeriodsOptions.find((rp) => rp.id === payload.reviewPeriod);
      payload.reviewPeriodDisplay = reviewPeriodOption?.value || payload.reviewPeriod;
    } else if (payload.reviewPeriod === 'custom') {
      payload.reviewPeriodDisplay = 'Custom';
    }

    // Format dates for preview display using system date format
    return this.formatDates(payload, 'display');
  }

  // Handle step changes to trigger validation
  onStepChange(event: any) {
    // When moving away from approved buyers step (index 1), mark it as touched to show validation errors
    if (event.previouslySelectedIndex === 1) {
      this.locForm.get('approvedBuyersSection')?.markAsTouched();
    }
  }

  // Called from the preview step Confirm button
  confirm() {
    // reuse submit flow (uses locForm.valid check)
    this.submit();
  }

  /**
   * Checks validity and pristinity of overall LOC form.
   */
  get locFormValidAndNotPristine() {
    return (
      this.locForm.valid &&
      (!this.locForm.get('basicInfo')?.pristine ||
        !this.locForm.get('limitsTerms')?.pristine ||
        this.chargesDataSource.length > 0)
    );
  }

  addApprovedBuyer() {
    const nameControl = this.locForm.get([
      'approvedBuyersSection',
      'approvedBuyersName'
    ]);
    const raw = (nameControl?.value || '').trim();
    if (!raw) {
      return;
    }
    // Prevent exact duplicates
    const exists = this.approvedBuyersArray.controls.some(
      (c) => (c.value?.name || '').toLowerCase() === raw.toLowerCase()
    );
    if (exists) {
      nameControl?.setValue('');
      return;
    }
    this.approvedBuyersArray.push(this.formBuilder.control({ name: raw }));
    nameControl?.setValue('');

    // Trigger validation update
    this.locForm.get('approvedBuyersSection')?.updateValueAndValidity();
  }

  removeVendor(index: number) {
    if (index > -1 && index < this.approvedBuyersArray.length) {
      this.approvedBuyersArray.removeAt(index);
      // Trigger validation update
      this.locForm.get('approvedBuyersSection')?.updateValueAndValidity();
    }
  }

  // Start editing a vendor/supplier name
  startEditVendor(index: number, currentName: string) {
    this.editingVendorIndex = index;
    this.editingVendorName = currentName;
  }

  // Save the edited vendor/supplier name
  saveEditVendor(index: number) {
    if (this.editingVendorName.trim()) {
      const control = this.approvedBuyersArray.at(index);
      control.patchValue({ name: this.editingVendorName.trim() });
      this.cancelEditVendor();
    }
  }

  // Cancel editing vendor/supplier
  cancelEditVendor() {
    this.editingVendorIndex = null;
    this.editingVendorName = '';
  }

  // Auto-select interest charge time based on product type
  updateInterestChargeTime(productType: Number) {
    // If no interest charge time options loaded yet, skip update
    if (!this.interestChargeTimeOptions || this.interestChargeTimeOptions.length === 0) {
      return;
    }

    const control = this.locForm.get([
      'limitsTerms',
      'interestChargeTime'
    ]);

    if (!control) {
      return;
    }

    if (productType && productType === 2) {
      // For payable (productType 2): set to "post disbursement"
      const postDisbursementOption = this.interestChargeTimeOptions.find((ict) => ict.code === 'POST_DISBURSEMENT');

      if (postDisbursementOption) {
        control?.setValue(postDisbursementOption.id);
      }
    } else if (productType && productType === 1) {
      // For receivable: set to "upfront"
      const upfrontOption = this.interestChargeTimeOptions.find((ict) => ict.code === 'UPFRONT');

      if (upfrontOption) {
        control?.setValue(upfrontOption.id);
      }
    }
  }
}
