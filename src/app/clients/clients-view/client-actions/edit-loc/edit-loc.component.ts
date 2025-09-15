/** Angular Imports */
import { Component, OnInit, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ValidatorFn, AbstractControl } from '@angular/forms';
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
  // Original LOC data for prepopulation
  originalLocData: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private formBuilder: FormBuilder,
    private clientsService: ClientsService,
    private settingsService: SettingsService
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
      });

    // also recompute when start date changes
    this.locForm
      .get([
        'limitsTerms',
        'startDate'
      ])
      ?.valueChanges.subscribe((val) => {
        this.computeInterimReviewDate();
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
        productType: loc.productType === 'payable' ? 'payable' : 'receivable',
        currencyCode: loc.currency?.code || loc.currencyCode,
        clientCompanyName: loc.clientCompanyName || '',
        clientContactPersonName: loc.clientContactPersonName || '',
        clientContactPersonPhone: loc.clientContactPersonPhone || '',
        clientContactPersonEmail: loc.clientContactPersonEmail || '',
        authorizedSignatoryName: loc.authorizedSignatoryName || '',
        authorizedSignatoryPhone: loc.authorizedSignatoryPhone || '',
        authorizedSignatoryEmail: loc.authorizedSignatoryEmail || '',
        va: loc.va || '',
        name: loc.name || '',
        externalId: loc.externalId || '',
        specialConditions: loc.specialConditions || ''
      },
      limitsTerms: {
        maxCreditLimit: loc.maximumAmount || loc.maxCreditLimit || '',
        maxPerDrawdown: loc.maxPerDrawdown || '',
        approvedCreditFacility: loc.approvedCreditFacilityAmount || '',
        startDate: this.formatDateForInput(loc.startDate || loc.activationDate),
        expiryDate: this.formatDateForInput(loc.endDate || loc.expiryDate),
        reviewPeriod: loc.reviewPeriod || '',
        interestRateOverride: loc.interestRateOverride || loc.interestRate || ''
      },
      settlementSavingsAccountId: loc.settlementSavingsAccountId || ''
    });

    // Prepopulate charges if any
    if (loc.charges && Array.isArray(loc.charges)) {
      this.chargesDataSource = loc.charges.map((charge: any) => ({
        ...charge,
        editableAmount: charge.amount
      }));
    }
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
        name: [
          '',
          Validators.required
        ],
        externalId: [''],
        specialConditions: ['']
      }),
      limitsTerms: this.formBuilder.group(
        {
          maxCreditLimit: [
            '',
            Validators.required
          ],
          maxPerDrawdown: [''],
          approvedCreditFacility: [''],
          startDate: [
            new Date().toISOString().slice(0, 10),
            Validators.required
          ],
          expiryDate: [''],
          reviewPeriod: [''],
          interimReviewDate: [{ value: '', disabled: true }],
          interestRateOverride: ['']
        },
        { validators: this.maxPerDrawdownValidator }
      ),
      settlementSavingsAccountId: ['']
    });
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
      const value: any = this.locForm.value;
      const payload = {
        ...value.basicInfo,
        // include limits & terms but map maxCreditLimit -> maximumAmount
        ...value.limitsTerms,
        // include settlement account if selected
        ...(value.settlementSavingsAccountId ? { settlementSavingsAccountId: value.settlementSavingsAccountId } : {}),
        charges: this.chargesDataSource
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
                if (k === 'endDate') {
                  delete payload.endDate;
                }
              }
            } else {
              if (k === 'endDate' && payload.hasOwnProperty('endDate')) {
                delete payload.endDate;
              }
            }
          });
        } catch (e) {
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

      // Map approvedCreditFacility (form) -> approvedCreditFacilityAmount (payload)
      if (payload.hasOwnProperty('approvedCreditFacility')) {
        payload.approvedCreditFacilityAmount = payload.approvedCreditFacility;
        delete payload.approvedCreditFacility;
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
    const v: any = this.locForm.value;
    const payload: any = {
      ...v.basicInfo,
      ...v.limitsTerms
    };
    if (v.settlementSavingsAccountId) {
      payload.settlementSavingsAccountId = v.settlementSavingsAccountId;
    }
    // Map preview fields to backend names so preview matches the eventual payload
    if (payload.hasOwnProperty('maxCreditLimit')) {
      payload.maximumAmount = payload.maxCreditLimit;
    }
    if (payload.hasOwnProperty('approvedCreditFacility')) {
      payload.approvedCreditFacilityAmount = payload.approvedCreditFacility;
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
}
