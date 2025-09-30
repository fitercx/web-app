/** Angular Imports */
import { Component, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/** Custom Services */
import { LoansService } from '../loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { ClientsService } from 'app/clients/clients.service';

/** Step Components */
import { LoansAccountDetailsStepComponent } from '../loans-account-stepper/loans-account-details-step/loans-account-details-step.component';
import { LoansAccountTermsStepComponent } from '../loans-account-stepper/loans-account-terms-step/loans-account-terms-step.component';
import { LoansAccountChargesStepComponent } from '../loans-account-stepper/loans-account-charges-step/loans-account-charges-step.component';
import { LoansAccountDatatableStepComponent } from '../loans-account-stepper/loans-account-datatable-step/loans-account-datatable-step.component';
import { LoansAccountLocDetailsStepComponent } from '../loans-account-stepper/loans-account-loc-details-step/loans-account-loc-details-step.component';

/**
 * Create loans account
 */
@Component({
  selector: 'mifosx-create-loans-account',
  templateUrl: './create-loans-account.component.html',
  styleUrls: ['./create-loans-account.component.scss']
})
export class CreateLoansAccountComponent {
  /** Imports all the step component */
  @ViewChild(LoansAccountDetailsStepComponent, { static: true })
  loansAccountDetailsStep: LoansAccountDetailsStepComponent;
  @ViewChild(LoansAccountTermsStepComponent, { static: true }) loansAccountTermsStep: LoansAccountTermsStepComponent;
  @ViewChild(LoansAccountChargesStepComponent, { static: true })
  loansAccountChargesStep: LoansAccountChargesStepComponent;
  @ViewChild(LoansAccountLocDetailsStepComponent, { static: false })
  loansAccountLocDetailsStep: LoansAccountLocDetailsStepComponent;
  /** Get handle on dtloan tags in the template */
  @ViewChildren('dtloan') loanDatatables: QueryList<LoansAccountDatatableStepComponent>;

  /** Loans Account Template */
  loansAccountTemplate: any;
  /** Loans Account Product Template */
  loansAccountProductTemplate: any | null = null;
  /** Collateral Options */
  collateralOptions: any;
  /** Multi Disburse Loan */
  multiDisburseLoan: any;
  /** Principal Amount */
  principal: any;
  datatables: any = [];
  /** Currency Code */
  currencyCode: string;
  /** Available Currencies */
  currencies: any[] = [];
  /** Optional Line of Credit context (drawdown) */
  lineOfCreditId?: string | null;
  /** Subscriptions cleanup */

  /**
   * Sets loans account create form.
   * @param {route} ActivatedRoute Activated Route.
   * @param {router} Router Router.
   * @param {loansService} LoansService Loans Service
   * @param {SettingsService} settingsService Settings Service
   * @param {ClientsService} clientService Client Service
   */
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private loansService: LoansService,
    private settingsService: SettingsService,
    private clientService: ClientsService
  ) {
    this.route.data.subscribe((data: { loansAccountTemplate: any; currencies: any }) => {
      this.loansAccountTemplate = data.loansAccountTemplate;
      this.currencies = data.currencies ? data.currencies.selectedCurrencyOptions || [] : [];
    });
    // capture LOC context (drawdown) if provided via query param from client LOC list
    this.lineOfCreditId = this.route.snapshot.queryParamMap.get('lineOfCreditId');
  }

  /**
   * Sets loans account product template and collateral template
   * @param {any} $event API response
   */
  setTemplate($event: any) {
    this.loansAccountProductTemplate = $event;
    this.currencyCode = this.loansAccountProductTemplate.currency.code;
    const clientId = this.loansAccountTemplate.clientId;

    // Set up LOC interest rate defaulting if LOC is enabled
    if ($event.additionalProperties?.isLocEnabled && $event.additionalProperties?.lineOfCreditOptions) {
      this.setupLocInterestRateDefaulting($event.additionalProperties.lineOfCreditOptions);
    }
    // If creating as drawdown, optionally restrict products here (future enhancement)
    if (!!clientId) {
      this.clientService.getCollateralTemplate(clientId).subscribe((response: any) => {
        this.collateralOptions = response;
      });
    } else {
      // Fineract API doesn't have "Group Collateral Management" endpoint; from the obsolete
      // community app it appears getCollateralTemplate(clientId) is called as well, but it's not clear how
      // the clientId is selected from the clientIds that belong to the group.
      console.error('No collateral data requested from Fineract, collateral might misbehave');
    }
    const entityId = this.loansAccountTemplate.clientId
      ? this.loansAccountTemplate.clientId
      : this.loansAccountTemplate.group.id;
    const isGroup = this.loansAccountTemplate.clientId ? false : true;
    const productId = this.loansAccountProductTemplate.loanProductId;
    this.loansService.getLoansAccountTemplateResource(entityId, isGroup, productId).subscribe((response: any) => {
      this.multiDisburseLoan = response.multiDisburseLoan;
    });
    this.setDatatables();
  }

  /**
   * Sets up LOC interest rate defaulting when LOC is selected
   * @param {any[]} lineOfCreditOptions Available LOC options
   */
  setupLocInterestRateDefaulting(lineOfCreditOptions: any[]) {
    // Watch for changes in the LOC selection
    this.loansAccountDetailsStep.loansAccountDetailsForm.get('lineOfCreditId')?.valueChanges.subscribe((locId: any) => {
      if (locId && lineOfCreditOptions) {
        const selectedLoc = lineOfCreditOptions.find((loc: any) => loc.id === locId);
        if (selectedLoc?.interestRate && this.loansAccountTermsStep) {
          // Set the interest rate from the selected LOC
          this.loansAccountTermsStep.loansAccountTermsForm.patchValue({
            interestRatePerPeriod: selectedLoc.interestRate
          });
        }
      }
    });
  }

  convertSnakeToPascalCase(snakeCase: string): string {
    return snakeCase
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  transformDatatableLabel(datatable: any): string {
    const separator = '_';
    // format: dt_loan_data_table_name
    const [
      dt,
      entityName,
      ...actualTableNameParts
    ] = datatable.registeredTableName.split(separator);

    // transform snake case "actualTableName" to pascal case
    const tableName = actualTableNameParts.join(separator);
    return this.convertSnakeToPascalCase(tableName);
  }

  setDatatables(): void {
    this.datatables = [];

    if (this.loansAccountProductTemplate.datatables) {
      this.loansAccountProductTemplate.datatables.forEach((datatable: any) => {
        datatable.viewLabel = this.transformDatatableLabel(datatable);
        this.datatables.push(datatable);
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

  /** Checks wheter all the forms in different steps are valid or not */
  get loansAccountFormValid() {
    const baseFormsValid = this.loansAccountDetailsForm.valid && this.loansAccountTermsForm.valid;

    // If LOC is enabled, also check if the LOC details form is valid
    if (this.isLocEnabled && this.locDetailsForm) {
      return baseFormsValid && this.locDetailsForm.valid;
    }

    return baseFormsValid;
  }

  get loansSavingsAccountLinked() {
    return this.loansAccountDetailsStep.loansAccountDetailsForm.get('linkAccountId').value;
  }

  /** Gets principal Amount */
  get loanPrincipal() {
    return this.loansAccountTermsStep.loansAccountTermsForm.value.principal;
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

    // Include LOC details flattened at root level if LOC is enabled and has meaningful data
    if (this.isLocEnabled && this.loansAccountLocDetailsStep) {
      const locDetails = this.loansAccountLocDetailsStep.locDetails;

      // Remove preview-specific fields that shouldn't be submitted
      const { locType, ...submissionLocDetails } = locDetails;

      // Only include LOC fields that have meaningful (non-empty, non-null) values
      const filteredLocDetails = this.filterEmptyValues(submissionLocDetails);

      // Only flatten LOC details if there are actually meaningful values
      if (Object.keys(filteredLocDetails).length > 0) {
        Object.assign(baseData, filteredLocDetails);
      }

      // For LOC loans, use the approved facility amount as principal
      const locId = this.loansAccountDetailsStep?.loansAccountDetailsForm?.get('lineOfCreditId')?.value;
      if (locId) {
        // Determine which approved amount to use based on LOC type
        const approvedReceivableAmount = filteredLocDetails.approvedReceivableAmount;
        const approvedPayableAmount = filteredLocDetails.amountInFacilityCurrency;
        const isReceivableType = filteredLocDetails.isReceivableType;

        // Use the appropriate approved facility amount as principal
        if (approvedReceivableAmount != null && approvedReceivableAmount > 0 && isReceivableType) {
          baseData.principalAmount = approvedReceivableAmount;
        } else if (approvedPayableAmount != null && approvedPayableAmount > 0 && !isReceivableType) {
          baseData.principalAmount = approvedPayableAmount;
        }
      }
    }

    return baseData;
  }

  /**
   * Filters out empty, null, undefined values and empty strings from an object
   */
  private filterEmptyValues(obj: any): any {
    const filtered: any = {};

    for (const [
      key,
      value
    ] of Object.entries(obj)) {
      // Include the value if it's meaningful (not empty, null, or undefined)
      if (value !== null && value !== undefined && value !== '') {
        // For numbers, include even if 0
        if (typeof value === 'number') {
          filtered[key] = value;
        }
        // For strings, include only if not empty
        else if (typeof value === 'string' && value.trim() !== '') {
          filtered[key] = value;
        }
        // For other types (dates, booleans, objects), include as is
        else if (typeof value !== 'string') {
          filtered[key] = value;
        }
      }
    }

    return filtered;
  }

  /**
   * Submits Data to create loan account
   */
  submit() {
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const loanAccountData = this.loansAccount;

    const payload = this.loansService.buildLoanRequestPayload(
      loanAccountData,
      this.loansAccountTemplate,
      this.loansAccountProductTemplate.calendarOptions,
      locale,
      dateFormat
    );

    // Attach line of credit context if present and meaningful (both common field names for compatibility)
    if (this.lineOfCreditId && this.lineOfCreditId.trim() !== '') {
      payload.lineOfCreditId = this.lineOfCreditId;
    }

    if (this.loansAccountProductTemplate.datatables && this.loansAccountProductTemplate.datatables.length > 0) {
      const datatables: any[] = [];
      this.loanDatatables.forEach((loanDatatable: LoansAccountDatatableStepComponent) => {
        datatables.push(loanDatatable.payload);
      });
      payload['datatables'] = datatables;
    }

    this.loansService.createLoansAccount(payload).subscribe((response: any) => {
      this.router.navigate(
        [
          '../',
          response.resourceId,
          'general'
        ],
        { relativeTo: this.route }
      );
    });
  }
}
