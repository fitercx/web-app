import { Component, Input, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { LoansService } from 'app/loans/loans.service';
import { ActivatedRoute, Router } from '@angular/router';

/** Custom Services */
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';

@Component({
  selector: 'mifosx-foreclosure',
  templateUrl: './foreclosure.component.html',
  styleUrls: ['./foreclosure.component.scss']
})
export class ForeclosureComponent implements OnInit {
  @Input() dataObject: any;

  loanId: any;
  foreclosureForm: UntypedFormGroup;
  /** Minimum Date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed. */
  maxDate = new Date();
  foreclosuredata: any;
  /** Linked Savings Account fields (from foreclosure template additionalAttributes) */
  linkedSavingsAccountId?: number;
  linkedSavingsAccountAccountNo?: string;
  linkedSavingsAccountProductName?: string;
  linkedSavingsAccountAvailableBalance?: number;
  isReceivableLineOfCredit?: boolean = false;
  currencySymbol?: string;

  /**
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {LoansService} systemService Loan Service.
   * @param {ActivatedRoute} route Activated Route.
   * @param {Router} router Router for navigation.
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private loanService: LoansService,
    private route: ActivatedRoute,
    private router: Router,
    private dateUtils: Dates,
    private settingsService: SettingsService
  ) {
    this.loanId = this.route.snapshot.params['loanId'];
  }

  ngOnInit() {
    this.maxDate = this.settingsService.businessDate;
    this.createforeclosureForm();
    this.onChanges();
    this.setupMutualExclusion(); // 👈 Added here
    // Capture linked account from initial resolver-provided template (dataObject)
    this.captureLinkedAccount(this.dataObject);
  }

  createforeclosureForm() {
    this.foreclosureForm = this.formBuilder.group({
      transactionDate: [
        this.dataObject.date && new Date(this.dataObject.date),
        Validators.required
      ],
      outstandingPrincipalPortion: [{ value: this.dataObject.principalPortion || 0, disabled: true }],
      outstandingInterestPortion: [{ value: this.dataObject.interestPortion || 0, disabled: true }],
      outstandingFeeChargesPortion: [{ value: this.dataObject.feeChargesPortion || 0, disabled: true }],
      outstandingPenaltyChargesPortion: [{ value: this.dataObject.penaltyChargesPortion || 0, disabled: true }],
      outstandingTaxChargesPortion: [{ value: this.dataObject.taxChargesPortion || 0, disabled: true }],
      transactionAmount: [{ value: this.dataObject.amount, disabled: true }],
      isForcedClosure: [false],
      isRestructured: [false],
      note: [
        '',
        Validators.required
      ]
    });
  }

  onChanges(): void {
    this.foreclosureForm.get('transactionDate').valueChanges.subscribe((val) => {
      this.retrieveLoanForeclosureTemplate(val);
    });
  }

  retrieveLoanForeclosureTemplate(val: any) {
    const dateFormat = this.settingsService.dateFormat;
    const transactionDateFormatted = this.dateUtils.formatDate(val, dateFormat);
    const data = {
      command: 'foreclosure',
      dateFormat: this.settingsService.dateFormat,
      locale: this.settingsService.language.code,
      transactionDate: transactionDateFormatted
    };
    this.loanService.getForeclosureData(this.loanId, data).subscribe((response: any) => {
      this.foreclosuredata = response;
      // Capture linked account from refreshed template
      this.captureLinkedAccount(this.foreclosuredata);

      this.foreclosureForm.patchValue({
        outstandingPrincipalPortion: this.foreclosuredata.principalPortion,
        outstandingInterestPortion: this.foreclosuredata.interestPortion,
        outstandingFeeChargesPortion: this.foreclosuredata.feeChargesPortion,
        outstandingPenaltyChargesPortion: this.foreclosuredata.penaltyChargesPortion,
        outstandingTaxChargesPortion: this.foreclosuredata.taxChargesPortion,
        transactionAmount: this.foreclosuredata.amount
      });
    });
  }

  /** Extract linked savings account details (if present) from a foreclosure template source object. */
  private captureLinkedAccount(source: any): void {
    if (!source) {
      return;
    }
    const additional = source.additionalAttributes;
    if (additional) {
      this.currencySymbol = source.currency?.displaySymbol;
      this.linkedSavingsAccountId = additional.linkedSavingsAccountId;
      this.linkedSavingsAccountAccountNo = additional.linkedSavingsAccountAccountNo;
      this.linkedSavingsAccountProductName = additional.linkedSavingsAccountProductName;
      this.linkedSavingsAccountAvailableBalance = additional.linkedSavingsAccountAvailableBalance;
      this.isReceivableLineOfCredit = additional.isReceivableLineOfCredit;
    }
  }

  submit() {
    const foreclosureFormData = this.foreclosureForm.value;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const prevTransactionDate = this.foreclosureForm.value.transactionDate;
    if (foreclosureFormData.transactionDate instanceof Date) {
      foreclosureFormData.transactionDate = this.dateUtils.formatDate(prevTransactionDate, dateFormat);
    }
    const data = {
      ...foreclosureFormData,
      dateFormat,
      locale
    };

    this.loanService.loanForclosureData(this.loanId, data).subscribe(() => {
      this.router.navigate([`../../general`], { relativeTo: this.route });
    });
  }

  private setupMutualExclusion(): void {
    const forcedControl = this.foreclosureForm.get('isForcedClosure');
    const restructuredControl = this.foreclosureForm.get('isRestructured');

    forcedControl.valueChanges.subscribe((isForced) => {
      if (isForced && restructuredControl.value) {
        restructuredControl.setValue(false, { emitEvent: false });
      }
    });

    restructuredControl.valueChanges.subscribe((isRestructured) => {
      if (isRestructured && forcedControl.value) {
        forcedControl.setValue(false, { emitEvent: false });
      }
    });
  }
}
