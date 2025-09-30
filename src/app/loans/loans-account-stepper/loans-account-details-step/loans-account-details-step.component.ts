/** Angular Imports */
import { Component, OnInit, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, UntypedFormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SettingsService } from 'app/settings/settings.service';
import { TranslateService } from '@ngx-translate/core';

/** Custom Services */
import { LoansService } from '../../loans.service';
import { Commons } from 'app/core/utils/commons';
import { takeUntil } from 'rxjs/operators';
import { ReplaySubject, Subject } from 'rxjs';

/**
 * Loans Account Details Step
 */
@Component({
  selector: 'mifosx-loans-account-details-step',
  templateUrl: './loans-account-details-step.component.html',
  styleUrls: ['./loans-account-details-step.component.scss']
})
export class LoansAccountDetailsStepComponent implements OnInit, OnDestroy {
  //** Defining PlaceHolders for the search bar */
  placeHolderLabel = '';
  noEntriesFoundLabel = '';

  /** Loans Account Template */
  @Input() loansAccountTemplate: any;

  /** Minimum date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum date allowed. */
  maxDate = new Date(2100, 0, 1);
  /** Product Data */
  productList: any;
  /** Loan Officer Data */
  loanOfficerOptions: any;
  /** Loan Purpose Options */
  loanPurposeOptions: any;
  /** Fund Options */
  fundOptions: any;
  /** Account Linking Options */
  accountLinkingOptions: any;
  /** Line of Credit Options */
  lineOfCreditOptions: any;
  /** Is LOC Enabled */
  isLocEnabled = false;
  /** For edit loan accounts form */
  isFieldOfficerPatched = false;
  /** Loans Account Details Form */
  loansAccountDetailsForm: UntypedFormGroup;

  loanId: any = null;

  loanProductSelected = false;
  /** Currency data. */
  protected productData: ReplaySubject<string[]> = new ReplaySubject<string[]>(1);
  /** control for the filter select */
  protected filterFormCtrl: UntypedFormControl = new UntypedFormControl('');
  /** Subject that emits when the component has been destroyed. */
  protected _onDestroy = new Subject<void>();

  /** Loans Account Template with product data  */
  @Output() loansAccountProductTemplate = new EventEmitter();
  /**
   * Sets loans account details form.
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {LoansService} loansService Loans Service.
   * @param {SettingsService} settingsService SettingsService
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private loansService: LoansService,
    private route: ActivatedRoute,
    private translateService: TranslateService,
    private settingsService: SettingsService,
    private commons: Commons
  ) {
    this.loanId = this.route.snapshot.params['loanId'];
  }

  ngOnInit() {
    this.placeHolderLabel = this.translateService.instant('labels.text.Search');
    this.noEntriesFoundLabel = this.translateService.instant('labels.text.No data found');
    this.createLoansAccountDetailsForm();
    this.maxDate = this.settingsService.maxFutureDate;
    this.buildDependencies();
    if (this.loansAccountTemplate) {
      this.productList = this.loansAccountTemplate.productOptions.sort(this.commons.dynamicSort('name'));
      if (this.loansAccountTemplate.loanProductId) {
        // Set LOC-related properties from existing loan if available
        this.isLocEnabled = this.loansAccountTemplate.additionalProperties?.isLocEnabled || false;
        this.lineOfCreditOptions = this.loansAccountTemplate.additionalProperties?.lineOfCreditOptions || [];

        // Add conditional validation for line of credit in edit mode
        const lineOfCreditControl = this.loansAccountDetailsForm.get('lineOfCreditId');
        if (this.isLocEnabled && this.lineOfCreditOptions.length > 0) {
          lineOfCreditControl?.setValidators([Validators.required]);
        } else {
          lineOfCreditControl?.clearValidators();
        }
        lineOfCreditControl?.updateValueAndValidity();

        this.loansAccountDetailsForm.patchValue({
          productId: this.loansAccountTemplate.loanProductId,
          submittedOnDate:
            this.loansAccountTemplate.timeline.submittedOnDate &&
            new Date(this.loansAccountTemplate.timeline.submittedOnDate),
          loanOfficerId: this.loansAccountTemplate.loanOfficerId,
          loanPurposeId: this.loansAccountTemplate.loanPurposeId,
          fundId: this.loansAccountTemplate.fundId,
          expectedDisbursementDate:
            this.loansAccountTemplate.timeline.expectedDisbursementDate &&
            new Date(this.loansAccountTemplate.timeline.expectedDisbursementDate),
          externalId: this.loansAccountTemplate.externalId,
          linkAccountId: this.loansAccountTemplate.linkAccountId,
          createStandingInstructionAtDisbursement: this.loansAccountTemplate.createStandingInstructionAtDisbursement,
          lineOfCreditId: this.selectedLocId
        });

        // Default loan officer from LOC if not already set and LOC has loanOfficerId
        const currentLocId = this.selectedLocId;
        if (currentLocId && !this.loansAccountTemplate.loanOfficerId && this.lineOfCreditOptions) {
          const selectedLoc = this.lineOfCreditOptions.find((loc: any) => loc.id === currentLocId);
          if (selectedLoc?.loanOfficerId) {
            this.loansAccountDetailsForm.get('loanOfficerId')?.setValue(selectedLoc.loanOfficerId);
          }
        }
      }
    }
    this.filterFormCtrl.valueChanges.pipe(takeUntil(this._onDestroy)).subscribe(() => {
      this.searchItem();
    });
    this.productData.next(this.productList.slice());
  }

  ngOnDestroy(): void {
    this._onDestroy.next();
    this._onDestroy.complete();
  }

  searchItem(): void {
    if (this.productList) {
      const search: string = this.filterFormCtrl.value.toLowerCase();

      if (!search) {
        this.productData.next(this.productList.slice());
      } else {
        this.productData.next(
          this.productList.filter((option: any) => {
            return option['name'].toLowerCase().indexOf(search) >= 0;
          })
        );
      }
    }
  }

  /**
   * Creates loans account details form.
   */
  createLoansAccountDetailsForm() {
    this.loansAccountDetailsForm = this.formBuilder.group({
      productId: [
        '',
        Validators.required
      ],
      loanOfficerId: [''],
      loanPurposeId: [''],
      fundId: [''],
      submittedOnDate: [
        this.settingsService.businessDate,
        Validators.required
      ],
      expectedDisbursementDate: [
        '',
        Validators.required
      ],
      externalId: [''],
      linkAccountId: [''],
      createStandingInstructionAtDisbursement: [''],
      lineOfCreditId: ['']
    });
  }

  /**
   * Fetches loans account product template on productId value changes
   */
  buildDependencies() {
    const entityId = this.loansAccountTemplate.clientId
      ? this.loansAccountTemplate.clientId
      : this.loansAccountTemplate.group.id;
    const isGroup = this.loansAccountTemplate.clientId ? false : true;
    this.loansAccountDetailsForm.get('productId').valueChanges.subscribe((productId: string) => {
      this.loansService.getLoansAccountTemplateResource(entityId, isGroup, productId).subscribe((response: any) => {
        this.loansAccountProductTemplate.emit(response);
        this.loanOfficerOptions = response.loanOfficerOptions;
        this.loanPurposeOptions = response.loanPurposeOptions;
        this.fundOptions = response.fundOptions;
        this.accountLinkingOptions = response.accountLinkingOptions;
        this.loanProductSelected = true;

        // Handle Line of Credit options
        this.isLocEnabled = response.additionalProperties?.isLocEnabled || false;
        this.lineOfCreditOptions = response.additionalProperties?.lineOfCreditOptions || [];

        // Add conditional validation for line of credit
        const lineOfCreditControl = this.loansAccountDetailsForm.get('lineOfCreditId');
        if (this.isLocEnabled && this.lineOfCreditOptions.length > 0) {
          lineOfCreditControl?.setValidators([Validators.required]);
        } else {
          lineOfCreditControl?.clearValidators();
          // Clear LOC selection and reset loan officer if LOC is not enabled for this product
          lineOfCreditControl?.setValue(null);
          this.loansAccountDetailsForm.get('loanOfficerId')?.setValue(null);
        }
        lineOfCreditControl?.updateValueAndValidity();

        // After loading loan officer options, default loan officer from LOC if a LOC is already selected
        const currentLocId = this.selectedLocId;
        if (currentLocId) {
          const selectedLoc = this.lineOfCreditOptions.find((loc: any) => loc.id === currentLocId);
          if (selectedLoc?.loanOfficerId) {
            const locLoanOfficer = this.loanOfficerOptions.find(
              (officer: any) => officer.id === selectedLoc.loanOfficerId
            );
            if (locLoanOfficer) {
              this.loansAccountDetailsForm.get('loanOfficerId')?.setValue(selectedLoc.loanOfficerId);
            }
          }
        }

        if (response.createStandingInstructionAtDisbursement) {
          this.loansAccountDetailsForm
            .get('createStandingInstructionAtDisbursement')
            .patchValue(response.createStandingInstructionAtDisbursement);
        }
      });
    });

    // Watch for Line of Credit selection changes to default loan officer
    this.loansAccountDetailsForm.get('lineOfCreditId')?.valueChanges.subscribe((locId: number | null) => {
      const loanOfficerControl = this.loansAccountDetailsForm.get('loanOfficerId');
      if (!loanOfficerControl) return;

      if (locId && this.lineOfCreditOptions) {
        const selectedLoc = this.lineOfCreditOptions.find((loc: any) => loc.id === locId);
        if (selectedLoc?.loanOfficerId && this.loanOfficerOptions) {
          const locLoanOfficer = this.loanOfficerOptions.find(
            (officer: any) => officer.id === selectedLoc.loanOfficerId
          );
          if (locLoanOfficer) {
            loanOfficerControl.setValue(selectedLoc.loanOfficerId);
          } else {
            loanOfficerControl.setValue(null);
          }
        } else {
          loanOfficerControl.setValue(null);
        }
      } else {
        // No LOC selected, reset loan officer
        loanOfficerControl.setValue(null);
      }
    });
  }

  /**
   * Returns loans account details form value.
   */
  get loansAccountDetails() {
    return this.loansAccountDetailsForm.getRawValue();
  }

  /**
   * Returns whether to show the Line of Credit dropdown
   */
  get showLineOfCreditDropdown() {
    return this.isLocEnabled && this.lineOfCreditOptions && this.lineOfCreditOptions.length > 0;
  }

  /**
   * Gets the currently selected Line of Credit ID from various sources
   */
  get selectedLocId(): number | null {
    // First check form control value (for runtime changes)
    const formValue = this.loansAccountDetailsForm?.get('lineOfCreditId')?.value;
    if (formValue) {
      return formValue;
    }

    // Then check template data (for initialization/edit mode)
    if (this.loansAccountTemplate) {
      return (
        this.loansAccountTemplate.additionalProperties?.lineOfCreditId ||
        this.loansAccountTemplate.lineOfCreditId ||
        null
      );
    }

    return null;
  }
}
