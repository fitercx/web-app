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
  /**
   * Minimum Date allowed — backend-computed per loan: MAX_BACKDATE_DAYS (30) before the business date, or the
   * loan's disbursement date if that is later (see BackdatedRepaymentValidator#computeEarliestAllowedTransactionDate
   * on the server). Replaced with the real value once the foreclosure template loads (see captureLinkedAccount), so
   * the calendar never lets an operator pick a date the server would reject. Note: this is separate from (and
   * looser than) the "cannot be earlier than the loan's last non-waiver transaction date" rule the backend also
   * enforces unconditionally on every foreclosure - that rule changes after every transaction, so it is surfaced
   * only as a clear error message on submit/date-change instead of being folded into this minDate.
   */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed. */
  maxDate = new Date();
  /** Clear, on-screen explanation of why minDate is where it is — shown next to the transaction date field. */
  backdateLimitMessage = '';
  /** Set when the backend rejects the currently-selected date (e.g. before the loan's last transaction date). */
  dateErrorMessage: string | null = null;
  foreclosuredata: any;
  /** Linked Savings Account fields (from foreclosure template additionalAttributes) */
  linkedSavingsAccountId?: number;
  linkedSavingsAccountAccountNo?: string;
  linkedSavingsAccountProductName?: string;
  linkedSavingsAccountAvailableBalance?: number;
  isReceivableLineOfCredit?: boolean = false;
  currencySymbol?: string;

  /** Baseline interest/penalty portions (business date), captured from the initial foreclosure template. */
  private baselineInterestPortion = 0;
  private baselinePenaltyChargesPortion = 0;
  /**
   * Clear, user-facing messages describing how the currently selected transaction date affects
   * interest and charges, compared to the amounts due if foreclosed today.
   */
  dateImpactMessages: string[] = [];

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
    this.currencySymbol =
      this.currencySymbol || this.dataObject.currency?.displaySymbol || this.dataObject.currency?.code;
    this.baselineInterestPortion = Number(this.dataObject.interestPortion || 0);
    this.baselinePenaltyChargesPortion = Number(this.dataObject.penaltyChargesPortion || 0);
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
    this.dateErrorMessage = null;
    this.loanService.getForeclosureData(this.loanId, data).subscribe({
      next: (response: any) => {
        this.foreclosuredata = response;
        // Capture linked account from refreshed template
        this.captureLinkedAccount(this.foreclosuredata);
        this.currencySymbol =
          this.currencySymbol || this.foreclosuredata.currency?.displaySymbol || this.foreclosuredata.currency?.code;

        this.foreclosureForm.patchValue({
          outstandingPrincipalPortion: this.foreclosuredata.principalPortion,
          outstandingInterestPortion: this.foreclosuredata.interestPortion,
          outstandingFeeChargesPortion: this.foreclosuredata.feeChargesPortion,
          outstandingPenaltyChargesPortion: this.foreclosuredata.penaltyChargesPortion,
          outstandingTaxChargesPortion: this.foreclosuredata.taxChargesPortion,
          transactionAmount: this.foreclosuredata.amount
        });

        this.dateImpactMessages = this.buildDateImpactMessages(transactionDateFormatted);
      },
      // The backend unconditionally rejects a foreclosure date earlier than the loan's last non-waiver
      // transaction date (and now also the general MAX_BACKDATE_DAYS floor) - surface that clearly here instead
      // of leaving the operator looking at a stale, no-longer-matching quote with no explanation.
      error: (err: any) => {
        this.dateErrorMessage =
          err?.error?.errors?.[0]?.defaultUserMessage ||
          err?.error?.defaultUserMessage ||
          'This foreclosure date is not allowed for this loan. Please choose a different date.';
      }
    });
  }

  /**
   * Builds clear, plain-language messages explaining how the selected transaction date changes the
   * interest and penalty/LPI amounts due, compared to what would be due if foreclosed on today's business date.
   */
  private buildDateImpactMessages(transactionDate: string): string[] {
    const messages: string[] = [];
    const round = (value: number) => Math.round(value * 100) / 100;
    const currencyLabel = this.currencySymbol || '';
    const interestPortion = Number(this.foreclosuredata?.interestPortion || 0);
    const penaltyPortion = Number(this.foreclosuredata?.penaltyChargesPortion || 0);

    const interestDelta = round(this.baselineInterestPortion - interestPortion);
    if (interestDelta > 0.01) {
      messages.push(
        `Interest due is reduced by ${currencyLabel} ${interestDelta.toFixed(2)} for foreclosing on ${transactionDate} ` +
          `instead of today, since this is before the loan's scheduled maturity (early repayment discount).`
      );
    }

    const penaltyDelta = round(this.baselinePenaltyChargesPortion - penaltyPortion);
    if (penaltyDelta > 0.01) {
      messages.push(
        `${currencyLabel} ${penaltyDelta.toFixed(2)} of accrued penalty/late-payment charges will be waived ` +
          `by backdating this foreclosure to ${transactionDate}.`
      );
    } else if (penaltyDelta < -0.01) {
      messages.push(
        `Selecting a future date (${transactionDate}) adds ${currencyLabel} ${Math.abs(penaltyDelta).toFixed(2)} ` +
          `of additional late-payment interest that will accrue between today and then.`
      );
    }

    return messages;
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
      this.applyEarliestAllowedDate(additional.earliestAllowedTransactionDate);
    }
  }

  /**
   * Sets the calendar's minDate from the backend-computed `earliestAllowedTransactionDate` (see
   * BackdatedRepaymentValidator on the server) and a matching on-screen explanation, so an operator is stopped from
   * ever picking a date the server would reject, rather than finding out only after submitting.
   */
  private applyEarliestAllowedDate(earliestAllowedTransactionDate: any): void {
    if (!earliestAllowedTransactionDate) {
      return;
    }
    const parsed = this.dateUtils.parseDate(earliestAllowedTransactionDate);
    if (!parsed) {
      return;
    }
    this.minDate = parsed;
    const formatted = this.dateUtils.formatDate(parsed, this.settingsService.dateFormat);
    this.backdateLimitMessage =
      `This foreclosure can be backdated no earlier than ${formatted} (30 days before today, or this loan's ` +
      `disbursement date if later, and never before the loan's last recorded transaction) — this protects the ` +
      `repayment schedule and balances from being distorted by very old backdated entries.`;
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
