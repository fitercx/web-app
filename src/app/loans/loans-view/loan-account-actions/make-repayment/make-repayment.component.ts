/** Angular Imports */
import { Component, OnInit, Input } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, UntypedFormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

/** RxJS Imports */
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

/** Custom Services */
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import { Currency } from 'app/shared/models/general.model';
import { AlertService } from 'app/core/alert/alert.service';
import { SavingsService } from 'app/savings/savings.service';
import {
  allocateSettlement,
  computePenaltyWaivedByBackdate,
  computeSavingsBalanceAsOf,
  computeSettlementRequired,
  computeUnearnedInterest,
  reconcileAsOfDateAmounts
} from 'app/loans/common/backdated-settlement.util';

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
   * on the server). Applied from the resolver-loaded penalty template's `earliestAllowedTransactionDate` in ngOnInit.
   * Maximum allows FUTURE dates so the ops team can preview the amount a customer would owe on a future pay date
   * (LPI keeps accruing until then). A repayment can never actually be recorded with a future date — the backend
   * rejects it — so the Submit button is disabled while a future date is selected (see isFutureDateSelected).
   */
  minDate = new Date(2000, 0, 1);
  maxDate = new Date();
  /** Clear, on-screen explanation of why minDate is where it is — shown next to the transaction date field. */
  backdateLimitMessage = '';
  /** Repayment Loan Form */
  repaymentLoanForm: UntypedFormGroup;
  currency: Currency | null = null;

  penaltyTemplate: Number;

  linkedSavingsAccountId?: number;
  linkedSavingsAccountAccountNo?: string;
  linkedSavingsAccountProductName?: string;
  linkedSavingsAccountAvailableBalance = 0;
  availableBalanceAsOfDate = 0;
  private savingsTransactions: any[] = [];
  private loanSummary: any;
  fullLoanOutstanding = 0;

  /**
   * Baseline principal/interest outstanding captured from the resolver's initial
   * penalty template (loaded for business date). The /template/penalties endpoint
   * returns 0 for these fields when no installment falls on the selected future date,
   * so we always fall back to these resolver-loaded values for display.
   */
  private baselinePrincipalOutstanding: number = 0;
  private baselineRemainingPrincipalOutstanding: number = 0;
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
  /** From /template/penalties — true when the selected date is an installment due date. */
  onInstallmentDueDate = false;
  /** How the entered amount will be applied — must match the principal/interest/fee/penalty fields. */
  settlementPreviewMessage: string | null = null;
  overpaymentWarning: string | null = null;
  closureRefundNotice: string | null = null;

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
    private alertService: AlertService,
    private savingsService: SavingsService
  ) {
    this.loanId = this.route.snapshot.params['loanId'];
  }

  /**
   * Creates the repayment loan form
   * and initialize with the required values
   */
  ngOnInit() {
    // Allow selecting a future date so ops can preview the amount due on a future pay date (LPI accrues until
    // then). Actual submission with a future date stays blocked — the backend rejects it and the Submit button is
    // disabled while a future date is selected (see isFutureDateSelected). Generous 5-year window covers any loan.
    const business = new Date(this.settingsService.businessDate);
    this.maxDate = new Date(business.getFullYear() + 5, business.getMonth(), business.getDate());
    this.createRepaymentLoanForm();
    this.setRepaymentLoanDetails();
    if (this.dataObject.repaymentTemplate.currency) {
      this.currency = this.dataObject.repaymentTemplate.currency;
    }

    // Capture resolver-loaded outstanding amounts as baseline fallback values.
    if (this.dataObject.penaltyTemplate) {
      this.baselinePrincipalOutstanding = this.dataObject.penaltyTemplate.principalOutstanding || 0;
      this.baselineRemainingPrincipalOutstanding =
        this.dataObject.penaltyTemplate.remainingPrincipalOutstanding || this.baselinePrincipalOutstanding;
      this.baselineInterestOutstanding = this.dataObject.penaltyTemplate.interestOutstanding || 0;
      this.baselinePenaltyAmountDue = this.dataObject.penaltyTemplate.penaltyAmountDue || 0;
      this.applyEarliestAllowedDate(this.dataObject.penaltyTemplate.earliestAllowedTransactionDate);
    }

    this.repaymentLoanForm.get('transactionDate')?.valueChanges.subscribe((newDate: Date) => {
      if (newDate) {
        const formattedDate = this.dateUtils.formatDate(newDate, this.settingsService.dateFormat);
        this.refreshPenaltyTemplate(formattedDate);
        this.refreshSavingsBalanceAsOfDate(newDate);
      }
    });

    this.repaymentLoanForm.get('transactionAmount')?.valueChanges.subscribe(() => {
      this.updateSettlementPreview();
    });

    const initialDate = this.dateUtils.formatDate(this.settingsService.businessDate, this.settingsService.dateFormat);
    this.refreshPenaltyTemplate(initialDate);
    this.loadLinkedSavingsAndSummary();
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
    if (this.isFutureDateSelected) {
      return;
    }
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
    const isBackdated = !!(selectedDate && businessDate && selectedDate.getTime() < businessDate.getTime());

    forkJoin({
      penaltyTemplate: this.loanService.getLoanPenaltiesTemplate(this.loanId, transactionDate),
      repaymentTemplate: this.loanService.getLoanRepaymentTemplate(this.loanId, transactionDate)
    })
      .pipe(
        switchMap(({ penaltyTemplate, repaymentTemplate }: any) => {
          this.dataObject.penaltyTemplate = penaltyTemplate;
          if (isFutureDate) {
            return this.loanService.getFutureLPICharges(this.loanId, transactionDate).pipe(
              switchMap((futureLPI: any) => of({ penaltyTemplate, repaymentTemplate, futureLPI })),
              catchError(() => of({ penaltyTemplate, repaymentTemplate, futureLPI: null as any }))
            );
          }
          return of({ penaltyTemplate, repaymentTemplate, futureLPI: null as any });
        })
      )
      .subscribe(({ penaltyTemplate, repaymentTemplate, futureLPI }: any) => {
        this.onInstallmentDueDate = !!penaltyTemplate?.onInstallmentDueDate;
        const additionalLPIAmount = Number(futureLPI?.totalLPIAmount || 0);
        const reconciled = reconcileAsOfDateAmounts({
          penaltyTemplate,
          repaymentTemplate,
          loanSummary: this.loanSummary,
          feeFallback: Number(this.dataObject.repaymentTemplate?.feeChargesPortion || 0),
          taxFallback: Number(this.dataObject.repaymentTemplate?.taxChargesPortion || 0),
          isBackdated,
          additionalPenalty: additionalLPIAmount
        });

        this.dataObject.penaltyTemplate.principalOutstanding = reconciled.principal;
        this.dataObject.penaltyTemplate.remainingPrincipalOutstanding = reconciled.remainingPrincipal;
        this.dataObject.penaltyTemplate.interestOutstanding = reconciled.interest;
        this.dataObject.penaltyTemplate.penaltyAmountDue = reconciled.penalty;

        this.dateImpactMessages = this.buildDateImpactMessages(
          reconciled.interest,
          reconciled.penalty,
          transactionDate
        );
        this.lpiPaymentMessage = this.buildLpiPaymentMessage(reconciled.penalty, transactionDate);

        const totalAmount = this.roundAmount(reconciled.defaultTransactionAmount + additionalLPIAmount);
        this.repaymentLoanForm.patchValue(
          {
            transactionAmount: totalAmount
          },
          { emitEvent: false }
        );
        this.updateSettlementPreview(transactionDate);
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
      `This repayment can be backdated no earlier than ${formatted} — this protects the repayment schedule ` +
      `and balances from being distorted by very old backdated entries. A future date can be selected to ` +
      `preview the amount due, but a repayment cannot be recorded with a future date.`;
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
    if (this.unearnedInterest <= 0.01 && interestDelta > 0.01) {
      messages.push(
        `Interest due is reduced by ${currencyLabel} ${interestDelta.toFixed(2)} for repaying on ${formattedDate} ` +
          `instead of today, since this is before the installment's due date (early repayment discount).`
      );
    }

    const penaltyDelta = round(this.baselinePenaltyAmountDue - totalPenaltyAmount);
    if (this.onInstallmentDueDate && totalPenaltyAmount <= 0.01) {
      messages.push(
        `This date is an installment due date — no late-payment interest (LPI) applies. ` +
          `Any LPI posted overnight after this due date will be automatically waived when you submit this repayment.`
      );
    } else if (penaltyDelta > 0.01) {
      messages.push(
        `${currencyLabel} ${penaltyDelta.toFixed(2)} of accrued penalty/late-payment charges will be waived ` +
          `by backdating this transaction to ${formattedDate}.`
      );
    } else if (penaltyDelta < -0.01) {
      const selected = this.toComparableDate(this.dateUtils.parseDate(transactionDate) || transactionDate);
      const business = this.toComparableDate(this.settingsService.businessDate);
      const daysAhead =
        selected && business && selected.getTime() > business.getTime()
          ? Math.round((selected.getTime() - business.getTime()) / (24 * 60 * 60 * 1000))
          : 0;
      const dayText = daysAhead === 1 ? '1 day' : `${Math.max(daysAhead, 0)} days`;
      messages.push(
        `Selecting a future date (${formattedDate}, ${dayText} after today) adds ${currencyLabel} ${Math.abs(penaltyDelta).toFixed(2)} ` +
          `of additional late-payment interest (LPI) that would accrue between today and then. Preview only — ` +
          `the backend cannot record a future-dated repayment.`
      );
    }

    return messages;
  }

  /**
   * Builds a clear notice when pending LPI is due on the selected date so the operator knows it
   * is included in the suggested transaction amount and will be paid with this repayment.
   * Hidden when penalty as of the selected date is 0 (e.g. settlement on the due date).
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

  private loadLinkedSavingsAndSummary(): void {
    this.loanService
      .getLoanAccountResource(this.loanId, 'summary,linkedAccount')
      .pipe(
        catchError(() => of(null)),
        switchMap((loanDetails: any) => {
          this.applyLoanSummary(loanDetails);
          this.captureLinkedSavingsFromLoanDetails(loanDetails);
          this.updateSettlementPreview();
          if (!this.linkedSavingsAccountId) {
            return of(null);
          }
          return this.savingsService
            .getSavingsAccountData(String(this.linkedSavingsAccountId))
            .pipe(catchError(() => of(null)));
        })
      )
      .subscribe({
        next: (savingsAccount: any) => {
          this.captureSavingsTransactions(savingsAccount);
          this.refreshSavingsBalanceAsOfDate();
        }
      });
  }

  private applyLoanSummary(loanDetails: any): void {
    this.loanSummary = loanDetails?.summary || null;
    this.fullLoanOutstanding = this.roundAmount(Number(this.loanSummary?.totalOutstanding || 0));
  }

  /** Linked savings from GET /loans/{id}?associations=linkedAccount — not foreclosure template (blocked when overdue). */
  private captureLinkedSavingsFromLoanDetails(loanDetails: any): void {
    const linked = loanDetails?.linkedAccount;
    if (!linked?.id) {
      return;
    }
    this.linkedSavingsAccountId = linked.id;
    this.linkedSavingsAccountAccountNo = linked.accountNo;
    this.linkedSavingsAccountProductName = linked.productName;
  }

  private captureSavingsTransactions(savingsAccount: any): void {
    if (!savingsAccount) {
      return;
    }
    this.savingsTransactions = Array.isArray(savingsAccount.transactions) ? savingsAccount.transactions : [];
    const currentAvailable = Number(
      savingsAccount.summary?.availableBalance ??
        savingsAccount.summary?.accountBalance ??
        this.linkedSavingsAccountAvailableBalance
    );
    if (!Number.isNaN(currentAvailable)) {
      this.linkedSavingsAccountAvailableBalance = currentAvailable;
    }
  }

  private refreshSavingsBalanceAsOfDate(
    transactionDateValue: Date = this.repaymentLoanForm?.value?.transactionDate
  ): void {
    this.availableBalanceAsOfDate = computeSavingsBalanceAsOf(
      this.savingsTransactions,
      this.toComparableDate(transactionDateValue),
      (value) => this.toComparableDate(value),
      this.linkedSavingsAccountAvailableBalance
    );
  }

  private toComparableDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (Array.isArray(value)) {
      return new Date(value[0], value[1] - 1, value[2]);
    }
    const parsed = this.dateUtils.parseDate(value);
    return parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null;
  }

  get selectedTransactionDateLabel(): string {
    const value = this.repaymentLoanForm?.value?.transactionDate;
    return value ? this.dateUtils.formatDate(value, this.settingsService.dateFormat) : '';
  }

  /**
   * True when the selected transaction date is after the business date. A future date is preview-only: the amounts
   * shown reflect what the customer would owe on that date (with LPI accrued until then), but a repayment cannot be
   * recorded in the future — the backend rejects it — so the Submit button is disabled while this is true.
   */
  get isFutureDateSelected(): boolean {
    const selected = this.toComparableDate(this.repaymentLoanForm?.value?.transactionDate);
    const business = this.toComparableDate(this.settingsService.businessDate);
    return !!(selected && business && selected.getTime() > business.getTime());
  }

  /** Principal of EMIs due on or before the selected date (the required due, not full remaining P). */
  get principalAsOfDate(): number {
    return Number(this.dataObject?.penaltyTemplate?.principalOutstanding || this.baselinePrincipalOutstanding || 0);
  }

  /** Remaining principal across every EMI — used as the close-amount / allocation cap. */
  get remainingPrincipalAsOfDate(): number {
    return Number(
      this.dataObject?.penaltyTemplate?.remainingPrincipalOutstanding ||
        this.loanSummary?.principalOutstanding ||
        this.baselineRemainingPrincipalOutstanding ||
        this.principalAsOfDate
    );
  }

  get interestAsOfDate(): number {
    return Number(this.dataObject?.penaltyTemplate?.interestOutstanding || 0);
  }

  /** Full-period interest on the ledger minus pro-rated interest due on the selected date. */
  get unearnedInterest(): number {
    return computeUnearnedInterest(Number(this.loanSummary?.interestOutstanding ?? 0), this.interestAsOfDate);
  }

  get feeAsOfDate(): number {
    return Number(this.dataObject?.repaymentTemplate?.feeChargesPortion || 0);
  }

  /** Tax from the repayment template — not date-scoped; /template/penalties does not return tax. */
  get taxAsOfDate(): number {
    return Number(this.dataObject?.repaymentTemplate?.taxChargesPortion || 0);
  }

  get penaltyAsOfDate(): number {
    return Number(this.dataObject?.penaltyTemplate?.penaltyAmountDue || 0);
  }

  get dueAsOfDateTotal(): number {
    return this.roundAmount(
      this.principalAsOfDate + this.interestAsOfDate + this.feeAsOfDate + this.taxAsOfDate + this.penaltyAsOfDate
    );
  }

  get penaltyInSummary(): number {
    return Number(this.loanSummary?.penaltyChargesOutstanding ?? this.baselinePenaltyAmountDue);
  }

  get penaltyWaivedByBackdate(): number {
    const fromTemplate = Number(this.dataObject?.penaltyTemplate?.lpiWaivedOnSettlement || 0);
    if (fromTemplate > 0.01) {
      return this.roundAmount(fromTemplate);
    }
    const penaltyAsOfToday = Math.max(this.penaltyInSummary, this.baselinePenaltyAmountDue);
    return computePenaltyWaivedByBackdate(penaltyAsOfToday, this.penaltyAsOfDate);
  }

  get outstandingAfterWaiver(): number {
    return computeSettlementRequired({
      principal: this.remainingPrincipalAsOfDate,
      interest: this.interestAsOfDate,
      fee: this.feeAsOfDate,
      tax: this.taxAsOfDate,
      penalty: this.penaltyAsOfDate
    });
  }

  get displayedPrincipal(): number {
    return this.currentSettlementAllocation.principal;
  }

  get displayedInterest(): number {
    return this.currentSettlementAllocation.interest;
  }

  get displayedFee(): number {
    return this.currentSettlementAllocation.fee;
  }

  get displayedPenalty(): number {
    return this.currentSettlementAllocation.penalty;
  }

  get displayedTax(): number {
    return this.currentSettlementAllocation.tax;
  }

  /**
   * Flat as-of-date allocation (no installment buckets). This screen does not load the repayment
   * schedule; transfer-from-savings uses buckets because it already has periods for the due-EMI list.
   * Component totals still use the same as-of-date budgets. Backend allocation on submit is authoritative.
   */
  private get currentSettlementAllocation() {
    const amount = Number(this.repaymentLoanForm?.get('transactionAmount')?.value || 0);
    return allocateSettlement(amount, {
      penalty: this.penaltyAsOfDate,
      fee: this.feeAsOfDate,
      tax: this.taxAsOfDate,
      interest: this.interestAsOfDate,
      principal: this.remainingPrincipalAsOfDate
    });
  }

  get currencyLabel(): string {
    return this.currency?.displaySymbol || this.currency?.code || '';
  }

  private updateSettlementPreview(transactionDate?: string): void {
    const dateLabel = transactionDate || this.selectedTransactionDateLabel;
    const amount = Number(this.repaymentLoanForm?.get('transactionAmount')?.value || 0);
    this.overpaymentWarning = null;
    this.closureRefundNotice = null;

    if (!amount || amount <= 0) {
      this.settlementPreviewMessage =
        'Enter an amount to see how it will be applied to principal, interest, fees and any late-payment interest still due on the selected date.';
      return;
    }

    const allocation = allocateSettlement(amount, {
      penalty: this.penaltyAsOfDate,
      fee: this.feeAsOfDate,
      tax: this.taxAsOfDate,
      interest: this.interestAsOfDate,
      principal: this.remainingPrincipalAsOfDate
    });

    const parts: string[] = [];
    if (allocation.penalty > 0.01) {
      parts.push(`${this.currencyLabel} ${allocation.penalty.toFixed(2)} to late payment interest (LPI)`);
    }
    if (allocation.fee > 0.01) {
      parts.push(`${this.currencyLabel} ${allocation.fee.toFixed(2)} to fees`);
    }
    if (allocation.tax > 0.01) {
      parts.push(`${this.currencyLabel} ${allocation.tax.toFixed(2)} to tax`);
    }
    if (allocation.interest > 0.01) {
      parts.push(`${this.currencyLabel} ${allocation.interest.toFixed(2)} to interest`);
    }
    if (allocation.principal > 0.01) {
      parts.push(`${this.currencyLabel} ${allocation.principal.toFixed(2)} to principal`);
    }

    const lines = [
      `Of the entered amount (${this.currencyLabel} ${amount.toFixed(2)}), ` +
        (parts.length
          ? `${parts.join(', ')} will be applied with this repayment (as at ${dateLabel}).`
          : `no outstanding balance remains to allocate (as at ${dateLabel}).`)
    ];

    const closesLoan =
      this.outstandingAfterWaiver > 0.01 && this.roundAmount(amount) + 0.01 >= this.outstandingAfterWaiver;
    if (allocation.unallocated > 0.01) {
      lines.push(
        `Excess of ${this.currencyLabel} ${allocation.unallocated.toFixed(2)} will overpay the loan. ` +
          `The required amount as of ${dateLabel} is ${this.currencyLabel} ${this.outstandingAfterWaiver.toFixed(2)}.`
      );
      this.overpaymentWarning = lines[lines.length - 1];
      this.closureRefundNotice = `This payment will close the loan overpaid by ${this.currencyLabel} ${allocation.unallocated.toFixed(2)}.`;
    } else if (closesLoan) {
      const closeLine =
        `This payment covers the amount required as of ${dateLabel} ` +
        `(${this.currencyLabel} ${this.outstandingAfterWaiver.toFixed(2)}) and will close the loan.`;
      if (this.penaltyWaivedByBackdate > 0.01) {
        lines.push(`${closeLine} Late-payment interest accrued after this date is waived and is not charged.`);
      } else {
        lines.push(closeLine);
      }
      this.closureRefundNotice = `This payment will close the loan (obligations met).`;
    } else if (this.dueAsOfDateTotal > 0.01 && this.roundAmount(amount) + 0.01 >= this.dueAsOfDateTotal) {
      const remaining = this.roundAmount(this.outstandingAfterWaiver - amount);
      lines.push(
        `This payment settles the amount due as of ${dateLabel}. The loan will remain Active with approximately ` +
          `${this.currencyLabel} ${Math.max(remaining, 0).toFixed(2)} still outstanding.`
      );
    }

    this.settlementPreviewMessage = lines.join(' ');
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
