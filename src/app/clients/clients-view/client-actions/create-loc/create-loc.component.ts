/** Angular Imports */
import { Component, OnInit, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ValidatorFn, AbstractControl, FormArray } from '@angular/forms';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { MatStepper } from '@angular/material/stepper';
import { ClientsService } from '../../../clients.service';
import { SettingsService } from 'app/settings/settings.service';

/**
 * Create LOC component.
 */
@Component({
  selector: 'mifosx-create-loc',
  templateUrl: './create-loc.component.html',
  styleUrls: ['./create-loc.component.scss']
})
export class CreateLocComponent implements OnInit {
  locForm!: FormGroup;
  @ViewChild('locStepper') locStepper?: MatStepper;
  clientId: string;
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
  creationError: string | null = null;
  isSubmitting = false;
  // Settlement account options (client savings)
  savingsAccounts: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private formBuilder: FormBuilder,
    private clientsService: ClientsService,
    private settingsService: SettingsService
  ) {
    this.clientId = this.route.parent?.snapshot.paramMap.get('clientId') || '';
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

  // Return the appropriate label for buyers/suppliers based on product type
  get buyerSupplierLabel(): string {
    const productType = this.locForm?.get([
      'basicInfo',
      'productType'
    ])?.value;
    return productType === 'payable' ? 'Supplier' : 'Buyer';
  }

  // Return the appropriate label for approved buyers/suppliers based on product type
  get approvedBuyerSupplierLabel(): string {
    const productType = this.locForm?.get([
      'basicInfo',
      'productType'
    ])?.value;
    return productType === 'payable' ? 'Approved Supplier' : 'Approved Buyer';
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

  ngOnInit() {
    this.createForm();
    // Mock fetching client data
    of({ id: this.clientId, displayName: 'John Doe' })
      .pipe(delay(500))
      .subscribe((client) => {
        this.clientName = client.displayName;
      });
    // react to reviewPeriod changes to compute nextReviewDate (example computed field)
    this.locForm
      .get([
        'limitsTerms',
        'reviewPeriod'
      ])
      ?.valueChanges.subscribe((val) => {
        this.computeInterimReviewDate();
      });
    // also recompute when start date changes
    this.locForm
      .get([
        'limitsTerms',
        'startDate'
      ])
      ?.valueChanges.subscribe((val) => {
        this.computeInterimReviewDate();
        this.computeExpiryDate();
      });

    // Resolve charges (fetched via resolver) and keep only LOC applicable (chargeAppliesTo.id === 5)
    const chargesResolved = this.route.snapshot.data['charges'] || this.route.parent?.snapshot.data['charges'];
    if (chargesResolved) {
      const extracted = this.extractChargesArray(chargesResolved);
      this.allLocCharges = extracted.filter((c) => c?.chargeAppliesTo?.id === 5);
      this.updateFilteredCharges();
    }

    // read resolved LOC template if present on parent route
    const resolved =
      this.route.snapshot.data['clientLocTemplate'] || this.route.parent?.snapshot.data['clientLocTemplate'];
    if (resolved) {
      this.locTemplate = resolved;
      this.productTypeOptions = resolved.productTypeOptions || [];
      this.reviewPeriodsOptions = resolved.reviewPeriodsOptions || [];
      this.activationStatusOptions = resolved.activationStatusOptions || [];
    }

    // Update available charges when currency changes
    this.locForm
      .get([
        'basicInfo',
        'currencyCode'
      ])
      ?.valueChanges.subscribe(() => this.updateFilteredCharges());

    // read resolved currencies from route (resolved before page load)
    const currenciesResolved = this.route.snapshot.data['currencies'] || this.route.parent?.snapshot.data['currencies'];
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
      // default the currency control if not set: prefer template.currency.code -> first currency
      const preferred = this.locTemplate?.currency?.code || (this.currencyOptions[0] && this.currencyOptions[0].code);
      if (preferred) {
        this.locForm
          .get([
            'basicInfo',
            'currencyCode'
          ])
          ?.setValue(preferred);
      }
    }

    // Load client savings accounts for settlement account dropdown from resolver data if available
    const clientAccountsData =
      this.route.snapshot.data['clientAccountsData'] || this.route.parent?.snapshot.data['clientAccountsData'];
    if (clientAccountsData) {
      this.savingsAccounts = clientAccountsData?.savingsAccounts || clientAccountsData?.savingAccounts || [];
    }

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
      });
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

  // Validator to ensure maxPerDrawdown is not greater than maxCreditLimit
  maxPerDrawdownValidator: ValidatorFn = (group: AbstractControl) => {
    const maxCtrl = group.get('maxCreditLimit');
    const perCtrl = group.get('maxPerDrawdown');
    if (!maxCtrl || !perCtrl) {
      return null;
    }
    const max = maxCtrl.value;
    const per = perCtrl.value;
    if (max !== null && max !== '' && per !== null && per !== '' && Number(per) > Number(max)) {
      return { perDrawdownExceedsLimit: true };
    }
    return null;
  };

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
        va: [''],
        externalId: [
          '',
          Validators.required
        ],
        specialConditions: ['']
      }),
      // Vendors step (list of vendor objects { name })
      vendorsSection: this.formBuilder.group({
        distributionPartner: [''],
        vendorName: [''],
        vendors: this.formBuilder.array([])
      }),
      limitsTerms: this.formBuilder.group(
        {
          maxCreditLimit: [
            '',
            Validators.required
          ],
          maxPerDrawdown: [''],
          startDate: [
            new Date().toISOString().slice(0, 10),
            Validators.required
          ],
          expiryDate: [''],
          reviewPeriod: [''],
          interimReviewDate: [{ value: '', disabled: true }],
          rateType: ['FLAT'],
          interestPaymentType: ['POST_DISBURSEMENT'],
          annualInterestRate: [''],
          latePaymentFee: [''],
          tenorDays: [''],
          advancePercentage: ['100'],
          cashMarginType: ['FLAT'],
          cashMarginValue: [''],
          loanOfficer: [
            '',
            Validators.required
          ],
          repaymentStrategy: [
            '',
            Validators.required
          ]
        },
        { validators: this.maxPerDrawdownValidator }
      ),
      // feesSettings group removed per requirement
      // Root-level control for settlement account selection (drives visibility of charges UI)
      settlementSavingsAccountId: ['']
    });

    // Set initial expiry date based on default start date
    this.computeExpiryDate();

    // Set initial advance percentage based on default product type
    this.updateAdvancePercentage('payable');
  }

  selectProductType(type: string) {
    const control = this.locForm.get([
      'basicInfo',
      'productType'
    ]);
    control?.setValue(type);
  }

  // Example computed interim review date based on activationDate + reviewPeriod months
  computeInterimReviewDate() {
    const activation = this.locForm.get([
      'limitsTerms',
      'startDate'
    ])?.value;
    const period = this.locForm.get([
      'limitsTerms',
      'reviewPeriod'
    ])?.value;
    const control = this.locForm.get([
      'limitsTerms',
      'interimReviewDate'
    ]);
    if (activation && period) {
      const d = new Date(activation);
      d.setMonth(d.getMonth() + Number(period));
      control?.setValue(d.toISOString().slice(0, 10));
    } else {
      control?.setValue('');
    }
  }

  // Compute expiry date as 1 year after start date to be default but editable
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
    this.router.navigate(['../'], { relativeTo: this.route });
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
    // Prevent double submission
    if (this.isSubmitting) {
      return;
    }

    if (this.locForm.valid) {
      this.isSubmitting = true;
      // Flatten the nested groups into a single payload
      const value: any = this.locForm.value;
      const payload = {
        ...value.basicInfo,
        // include limits & terms but map maxCreditLimit -> maximumAmount
        ...value.limitsTerms,
        // include vendors if any
        ...(value.vendorsSection?.distributionPartner
          ? { distributionPartner: value.vendorsSection.distributionPartner }
          : {}),
        ...(value.vendorsSection?.vendors?.length ? { vendors: value.vendorsSection.vendors } : {}),
        // include settlement account if selected
        ...(value.settlementSavingsAccountId ? { settlementSavingsAccountId: value.settlementSavingsAccountId } : {}),
        charges: this.chargesDataSource
      };
      // Rename JSON field maxCreditLimit -> maximumAmount for backend
      if (payload.hasOwnProperty('maxCreditLimit')) {
        payload.maximumAmount = payload.maxCreditLimit;
        delete payload.maxCreditLimit;
      }
      // Ensure startDate is present in payload (map activationDate if previously set)
      if (payload.hasOwnProperty('activationDate') && !payload.hasOwnProperty('startDate')) {
        payload.startDate = payload.activationDate;
        delete payload.activationDate;
      }
      // Rename expiryDate -> endDate for backend
      if (payload.hasOwnProperty('expiryDate')) {
        payload.endDate = payload.expiryDate;
        delete payload.expiryDate;
      }

      // Attach system locale and dateFormat from settings
      try {
        const dateFormat = this.settingsService.dateFormat || 'yyyy-MM-dd';
        const locale = this.settingsService.language?.code || this.settingsService.languageCode || 'en';
        // Format date fields according to user's dateFormat and locale before sending
        try {
          const dp = new DatePipe(locale);
          const dateKeys = [
            'startDate',
            'endDate',
            'activationDate',
            'interimReviewDate'
          ];
          dateKeys.forEach((k) => {
            if (!payload.hasOwnProperty(k)) {
              return;
            }
            const raw = payload[k];
            if (!raw && raw !== 0) {
              // no value provided -> ensure endDate is not sent
              if (k === 'endDate' && payload.hasOwnProperty('endDate')) {
                delete payload.endDate;
              }
              return;
            }
            const parsed = new Date(raw);
            if (!isNaN(parsed.getTime())) {
              const formatted = dp.transform(parsed, dateFormat);
              if (formatted) {
                payload[k] = formatted;
              } else {
                // If DatePipe couldn't format the date, drop endDate only; keep others as-is
                if (k === 'endDate') {
                  delete payload.endDate;
                }
                // else leave original value for other date keys
              }
            } else {
              // parsed is invalid -> do not send endDate
              if (k === 'endDate' && payload.hasOwnProperty('endDate')) {
                delete payload.endDate;
              }
            }
          });
        } catch (e) {
          // formatting failed — proceed without formatting
          console.warn('Date formatting failed', e);
        }

        if (dateFormat) {
          payload.dateFormat = dateFormat;
        }
        if (locale) {
          payload.locale = locale;
        }
      } catch (e) {
        // swallow - settings unavailable in rare cases
      }

      // Call backend API to create the credit line
      // clientsService will be injected lazily via route resolver in future; import here instead
      // For now, we'll obtain the ClientsService via the route injector
      this.creationError = null;
      this.clientsService.createClientCreditLine(this.clientId, payload).subscribe(
        (response: any) => {
          this.isSubmitting = false;
          const resourceId = response?.resourceId || response?.id || response?.creditLineId;
          // Navigate to the existing LOC view route (clients/:clientId/loc/:locId)
          this.router.navigate([
            '/clients',
            this.clientId,
            'loc',
            resourceId
          ]);
        },
        (err: any) => {
          this.isSubmitting = false;
          // Do not navigate on error. Surface error to UI via creationError.
          console.error('Create LOC failed', err);
          this.creationError = err?.error?.developerMessage || err?.message || 'Failed to create line of credit';
        }
      );
    }
  }

  // Build a flattened payload for preview
  get previewPayload() {
    const v: any = this.locForm.value;
    const payload: any = {
      ...v.basicInfo,
      ...v.limitsTerms
    };
    if (v.vendorsSection?.distributionPartner) {
      payload.distributionPartner = v.vendorsSection.distributionPartner;
    }
    if (v.vendorsSection?.vendors?.length) {
      payload.vendors = v.vendorsSection.vendors;
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
    return payload;
  }

  // Called from the preview step Confirm button
  confirm() {
    // reuse submit flow (uses locForm.valid check)
    this.submit();
  }

  // ---- Vendors helpers ----
  get vendorsArray(): FormArray {
    return this.locForm.get([
      'vendorsSection',
      'vendors'
    ]) as FormArray;
  }

  addVendor() {
    const nameControl = this.locForm.get([
      'vendorsSection',
      'vendorName'
    ]);
    const raw = (nameControl?.value || '').trim();
    if (!raw) {
      return;
    }
    // Prevent exact duplicates
    const exists = this.vendorsArray.controls.some((c) => (c.value?.name || '').toLowerCase() === raw.toLowerCase());
    if (exists) {
      nameControl?.setValue('');
      return;
    }
    this.vendorsArray.push(this.formBuilder.control({ name: raw }));
    nameControl?.setValue('');
  }

  removeVendor(index: number) {
    if (index > -1 && index < this.vendorsArray.length) {
      this.vendorsArray.removeAt(index);
    }
  }
}
