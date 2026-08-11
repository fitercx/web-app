/** Angular Imports */
import { Component, OnInit, Input } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, UntypedFormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

/** RxJS Imports */
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** Custom Services */
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import { Currency } from 'app/shared/models/general.model';
import { AlertService } from 'app/core/alert/alert.service';

/**
 * Loan Make Repayment Component
 */
@Component({
  selector: 'mifosx-make-repayment',
  templateUrl: './make-repayment.component.html',
  styleUrls: ['./make-repayment.component.scss']
})
export class MakeRepaymentComponent implements OnInit {
  @Input() dataObject: any;
  /** Loan Id */
  loanId: string;
  /** Payment Type Options */
  paymentTypes: any;
  /** Show payment details */
  showPaymentDetails = false;
  /**
   * Minimum Date allowed — backend-computed per loan: MAX_BACKDATE_DAYS (30) before the business date, or the
   * loan's disbursement date if that is later (see BackdatedRepaymentValidator#computeEarliestAllowedTransactionDate
   * on the server). Defaults to 30 days back until the resolver-loaded penalty template's
   * `earliestAllowedTransactionDate` is applied in ngOnInit, so the calendar never lets an operator pick a date the
   * server will reject anyway.
   */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed — extended 1 year ahead to allow future repayment date selection. */
  maxDate = new Date();
  /** Clear, on-screen explanation of why minDate is where it is — shown next to the transaction date field. */
  backdateLimitMessage = '';
  /** Repayment Loan Form */
  repaymentLoanForm: UntypedFormGroup;
  currency: Currency | null = null;

  penaltyTemplate: Number;

  /**
   * Baseline principal/interest outstanding captured from the resolver's initial
   * penalty template (loaded for business date). The /template/penalties endpoint
   * returns 0 for these fields when no installment falls on the selected future date,
   * so we always fall back to these resolver-loaded values for display.
   */
  private baselinePrincipalOutstanding: number = 0;
  private baselineInterestOutstanding: number = 0;
  /** Baseline penalty/LPI due (business date), used to detect waived/accrued charges on date change. */
  private baselinePenaltyAmountDue: number = 0;

  /**
   * Clear, user-facing messages describing how the currently selected transaction date affects
   * interest and charges, compared to the amounts due on today's business date. Populated only
   * after the operator actually changes the date (see refreshPenaltyTemplate).
   */
  dateImpactMessages: string[] = [];

  /** Shown when pending LPI is due on the selected date and will be paid with this repayment. */
  lpiPaymentMessage: string | null = null;

  /**
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {LoansService} loanService Loan Service.
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
    private settingsService: SettingsService,
    private alertService: AlertService
  ) {
    this.loanId = this.route.snapshot.params['loanId'];
  }

  /**
   * Creates the repayment loan form
   * and initialize with the required values
   */
  ngOnInit() {
    const businessDate = this.settingsService.businessDate;
    this.maxDate = new Date(businessDate);
    this.maxDate.setFullYear(this.maxDate.getFullYear() + 1);
    this.createRepaymentLoanForm();
    this.setRepaymentLoanDetails();
    if (this.dataObject.repaymentTemplate.currency) {
      this.currency = this.dataObject.repaymentTemplate.currency;
    }

    // Capture resolver-loaded outstanding amounts as baseline fallback values.
    if (this.dataObject.penaltyTemplate) {
      this.baselinePrincipalOutstanding = this.dataObject.penaltyTemplate.principalOutstanding || 0;
      this.baselineInterestOutstanding = this.dataObject.penaltyTemplate.interestOutstanding || 0;
      this.baselinePenaltyAmountDue = this.dataObject.penaltyTemplate.penaltyAmountDue || 0;
      this.applyEarliestAllowedDate(this.dataObject.penaltyTemplate.earliestAllowedTransactionDate);
    }

    this.repaymentLoanForm.get('transactionDate')?.valueChanges.subscribe((newDate: Date) => {
      if (newDate) {
        const formattedDate = this.dateUtils.formatDate(newDate, this.settingsService.dateFormat);
        this.refreshPenaltyTemplate(formattedDate);
      }
    });

    const initialDate = this.dateUtils.formatDate(this.settingsService.businessDate, this.settingsService.dateFormat);
    this.refreshPenaltyTemplate(initialDate);
  }

  /**
   * Creates the create close form.
   */
  createRepaymentLoanForm() {
    this.repaymentLoanForm = this.formBuilder.group({
      transactionDate: [
        this.settingsService.businessDate,
        Validators.required
      ],
      transactionAmount: [
        '',
        Validators.required
      ],
      externalId: '',
      paymentTypeId: '',
      note: ''
    });
  }

  setRepaymentLoanDetails() {
    this.paymentTypes = this.dataObject.repaymentTemplate.paymentTypeOptions;
  }

  /**
   * Add payment detail fields to the UI.
   */
  addPaymentDetails() {
    this.showPaymentDetails = !this.showPaymentDetails;
    if (this.showPaymentDetails) {
      this.repaymentLoanForm.addControl('accountNumber', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('checkNumber', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('routingCode', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('receiptNumber', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('bankNumber', new UntypedFormControl(''));
    } else {
      this.repaymentLoanForm.removeControl('accountNumber');
      this.repaymentLoanForm.removeControl('checkNumber');
      this.repaymentLoanForm.removeControl('routingCode');
      this.repaymentLoanForm.removeControl('receiptNumber');
      this.repaymentLoanForm.removeControl('bankNumber');
    }
  }

  /** Submits the repayment form */
  submit() {
    const repaymentLoanFormData = this.repaymentLoanForm.value;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const prevTransactionDate: Date = this.repaymentLoanForm.value.transactionDate;
    if (repaymentLoanFormData.transactionDate instanceof Date) {
      repaymentLoanFormData.transactionDate = this.dateUtils.formatDate(prevTransactionDate, dateFormat);
    }
    const data = {
      ...repaymentLoanFormData,
      dateFormat,
      locale
    };
    const command = this.dataObject.repaymentTemplate.type.code.split('.')[1];
    data['transactionAmount'] = data['transactionAmount'] * 1;
    this.loanService.submitLoanActionButton(this.loanId, data, command).subscribe((response: any) => {
      this.notifyBackdatedLpiWaived(response?.changes);
      this.router.navigate(['../../transactions'], { relativeTo: this.route });
    });
  }

  /**
   * When a backdated repayment auto-waives LPI accrued on/after the value date, the backend returns the
   * summary in `changes`. Surface it so the operator knows the waiver was recorded on the loan (Charges tab
   * and repayment schedule show the waived rows/amounts after refresh).
   */
  private notifyBackdatedLpiWaived(changes: any): void {
    const chargesWaived = Number(changes?.chargesWaived || 0);
    if (!chargesWaived) {
      return;
    }
    const currencyLabel = this.currency?.displaySymbol || this.currency?.code || '';
    const amount = this.roundAmount(Number(changes?.totalAmountWaived || 0));
    const days = Number(changes?.daysCovered || 0);
    const dayText = days === 1 ? '1 day' : `${days} days`;
    this.alertService.alert({
      type: 'Backdated Settlement',
      message:
        `Backdated repayment: ${currencyLabel} ${amount.toFixed(2)} of late-payment interest ` +
        `(${chargesWaived} charge(s) over ${dayText}) was automatically waived. ` +
        `See the Charges tab and repayment schedule Waived column for details.`
    });
  }

  private refreshPenaltyTemplate(transactionDate: string): void {
    const businessDate = this.settingsService.businessDate;
    const selectedDate = this.dateUtils.parseDate(transactionDate);
    const isFutureDate = selectedDate && businessDate && selectedDate.getTime() > businessDate.getTime();

    this.loanService
      .getLoanPenaltiesTemplate(this.loanId, transactionDate)
      .pipe(
        switchMap((template: any) => {
          this.dataObject.penaltyTemplate = template;
          if (isFutureDate) {
            return this.loanService
              .getFutureLPICharges(this.loanId, transactionDate)
              .pipe(switchMap((futureLPI: any) => of({ template, futureLPI })));
          }
          return of({ template, futureLPI: null as any });
        })
      )
      .subscribe(({ template, futureLPI }: { template: any; futureLPI: any }) => {
        // /template/penalties returns 0 for principal/interest when no installment falls
        // on the selected date (always the case for future dates). Fall back to the
        // baseline values captured from the resolver so the display stays correct.
        const principalAmount = template.principalOutstanding || this.baselinePrincipalOutstanding;
        const interestAmount = template.interestOutstanding || this.baselineInterestOutstanding;
        const feesAmount = Number(this.dataObject.repaymentTemplate.feeChargesPortion || 0);
        const taxAmount = Number(this.dataObject.repaymentTemplate.taxChargesPortion || 0);
        const penaltyAmount = template.penaltyAmountDue || 0;
        const additionalLPIAmount = Number(futureLPI?.totalLPIAmount || 0);
        const totalPenaltyAmount = penaltyAmount + additionalLPIAmount;

        this.dataObject.penaltyTemplate.principalOutstanding = principalAmount;
        this.dataObject.penaltyTemplate.interestOutstanding = interestAmount;
        this.dataObject.penaltyTemplate.penaltyAmountDue = totalPenaltyAmount;

        this.dateImpactMessages = this.buildDateImpactMessages(interestAmount, totalPenaltyAmount, transactionDate);
        this.lpiPaymentMessage = this.buildLpiPaymentMessage(totalPenaltyAmount, transactionDate);

        const totalAmount = principalAmount + interestAmount + feesAmount + taxAmount + totalPenaltyAmount;
        this.repaymentLoanForm.patchValue({
          transactionAmount: this.roundAmount(totalAmount)
        });
      });
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
      `This repayment can be backdated no earlier than ${formatted} (30 days before today, or this loan's ` +
      `disbursement date if later) — this protects the repayment schedule and balances from being distorted by ` +
      `very old backdated entries.`;
  }

  /**
   * Builds clear, plain-language messages explaining how the selected transaction date changes the
   * interest and penalty/LPI amounts due, compared to what would be due if repaid on today's business date.
   */
  private buildDateImpactMessages(
    interestAmount: number,
    totalPenaltyAmount: number,
    transactionDate: string
  ): string[] {
    const messages: string[] = [];
    const round = (value: number) => Math.round(value * 100) / 100;
    const currencyLabel = this.currency?.displaySymbol || this.currency?.code || '';
    const formattedDate = transactionDate;

    const interestDelta = round(this.baselineInterestOutstanding - interestAmount);
    if (interestDelta > 0.01) {
      messages.push(
        `Interest due is reduced by ${currencyLabel} ${interestDelta.toFixed(2)} for repaying on ${formattedDate} ` +
          `instead of today, since this is before the installment's due date (early repayment discount).`
      );
    }

    const penaltyDelta = round(this.baselinePenaltyAmountDue - totalPenaltyAmount);
    if (penaltyDelta > 0.01) {
      messages.push(
        `${currencyLabel} ${penaltyDelta.toFixed(2)} of accrued penalty/late-payment charges will be waived ` +
          `by backdating this transaction to ${formattedDate}.`
      );
    } else if (penaltyDelta < -0.01) {
      messages.push(
        `Selecting a future date (${formattedDate}) adds ${currencyLabel} ${Math.abs(penaltyDelta).toFixed(2)} ` +
          `of additional late-payment interest that will accrue between today and then.`
      );
    }

    return messages;
  }

  /**
   * Builds a clear notice when pending LPI is due on the selected date so the operator knows it
   * is included in the suggested transaction amount and will be paid with this repayment.
   */
  private buildLpiPaymentMessage(totalPenaltyAmount: number, transactionDate: string): string | null {
    if (totalPenaltyAmount <= 0.01) {
      return null;
    }
    const currencyLabel = this.currency?.displaySymbol || this.currency?.code || '';
    return (
      `Late payment interest (LPI) of ${currencyLabel} ${totalPenaltyAmount.toFixed(2)} accrued up to ` +
      `${transactionDate} is included in the transaction amount and will be paid with this repayment.`
    );
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
