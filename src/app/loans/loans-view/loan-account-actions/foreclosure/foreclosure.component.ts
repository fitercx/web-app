import { Component, Input, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { LoansService } from 'app/loans/loans.service';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

/** Custom Services */
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import {
  computeAuthoritativeSettlementCap,
  computePenaltyWaivedByBackdate,
  computeProjectedOverpayment,
  computeSavingsBalanceAsOf,
  computeScheduleCloseCap,
  computeSettlementRequired,
  computeUnearnedInterest,
  isRealEmiDueOnDate,
  isSameCalendarDate,
  reconcilePenaltyWithLedger,
  roundAmount,
  SchedulePeriod
} from 'app/loans/common/backdated-settlement.util';
import {
  SettlementSummaryFootnote,
  SettlementSummaryLine
} from 'app/shared/settlement-summary-card/settlement-summary-card.component';
import { SavingsService } from 'app/savings/savings.service';

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
  /** Policy text shown inside the collapsible hint (not date-specific). */
  readonly staticFutureDatePolicy =
    'A future date can be selected to preview amounts, but foreclosure cannot be recorded with a future date — the backend does not support it.';
  foreclosuredata: any;
  /** Linked Savings Account fields (from foreclosure template additionalAttributes) */
  linkedSavingsAccountId?: number;
  linkedSavingsAccountAccountNo?: string;
  linkedSavingsAccountProductName?: string;
  linkedSavingsAccountAvailableBalance?: number;
  /** Running balance of the linked savings account as of the selected transaction date. */
  availableBalanceAsOfDate = 0;
  private savingsTransactions: any[] = [];
  private savingsAccountLoadStarted = false;
  private savingsTransactionsLoaded = false;
  isReceivableLineOfCredit?: boolean = false;
  /** True when this drawdown belongs to a line of credit (payable or receivable). */
  isLineOfCreditDrawdown = false;
  /** Earliest unpaid installment due date — foreclosure blocked on/after this for LOC loans. */
  earliestUnpaidDueDate: Date | null = null;
  /** Selected date is on/past earliest unpaid due date; show repayment-style preview only. */
  foreclosureBlockedByDueDate = false;
  currencySymbol?: string;

  /** Baseline interest/penalty portions (business date), captured from the initial foreclosure template. */
  private baselineInterestPortion = 0;
  private baselinePenaltyChargesPortion = 0;
  /** Loan's scheduled maturity date — injected by the resolver alongside the foreclosure template. */
  maturityDate: Date | null = null;
  /** Product penalty grace days after maturity before daily LPI stops (RBF / factor-rate). */
  penaltyGracePeriodDays: number | null = null;
  /** Backend hint: closure quote is post-maturity grace-period LPI only. */
  postMaturityGracePeriodLpiClosure = false;
  /** Whether the selected date constitutes a true early foreclosure or a normal on-due-date closure. */
  closureTypeInfo: { type: 'foreclosure' | 'normal_closure'; message: string } | null = null;
  /** Full loan summary and schedule — used for due-EMI hints and outstanding reconciliation. */
  private loanSummary: any;
  private repaymentSchedule: any;
  fullLoanOutstanding = 0;
  dueEmis: Array<{ period: number; dueDate: any; amount: number; state: 'overdue' | 'due' }> = [];
  isTemplateLoading = false;
  /** Projected LPI from /future-charges when a future date is selected (preview only). */
  private additionalFutureLpiAmount = 0;
  /** Authoritative LPI as of the selected date (from /template/penalties). */
  private penaltyTemplateData: any;
  /** Outcome notice when foreclosure quote would close the loan but move it to Overpaid. */
  foreclosureOutcomeNotice: string | null = null;

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
    private settingsService: SettingsService,
    private savingsService: SavingsService
  ) {
    this.loanId = this.route.snapshot.params['loanId'];
  }

  ngOnInit() {
    // Allow selecting a future date for amount/LPI preview. Foreclosure cannot be recorded in the future —
    // backend rejects it — so Submit stays disabled while a future date is selected.
    const business = new Date(this.settingsService.businessDate);
    this.maxDate = new Date(business.getFullYear() + 5, business.getMonth(), business.getDate());
    this.createforeclosureForm();
    this.onChanges();
    // Capture linked account from initial resolver-provided template (dataObject)
    this.captureLinkedAccount(this.dataObject);
    this.currencySymbol =
      this.currencySymbol || this.dataObject.currency?.displaySymbol || this.dataObject.currency?.code;
    this.baselineInterestPortion = Number(this.dataObject.interestPortion || 0);
    this.baselinePenaltyChargesPortion = Number(this.dataObject.penaltyChargesPortion || 0);
    this.foreclosuredata = this.dataObject;
    this.captureTemplateMetadata(this.dataObject);
    this.maturityDate = this.parseDateField(this.dataObject.expectedMaturityDate) || this.maturityDate;
    // Show the closure-type banner immediately on open for the default (business-date) selection, not only
    // after the operator changes the date. valueChanges does not fire for the form's initial value.
    this.updateClosureTypeInfo();
    this.loadLoanContext();
    this.dueEmis = this.getDueEmisForDate(this.foreclosureForm.get('transactionDate').value);
  }

  /** After schedule/LOC context loads, refresh settlement for the default transaction date. */
  private refreshSettlementForSelectedDate(): void {
    const transactionDate = this.foreclosureForm.get('transactionDate').value;
    const formatted = this.dateUtils.formatDate(transactionDate, this.settingsService.dateFormat);
    const selected = this.toComparableDate(transactionDate);
    const businessDate = this.toComparableDate(this.settingsService.businessDate);
    const isFutureDate = !!(selected && businessDate && selected.getTime() > businessDate.getTime());

    if (this.applyDueDateForeclosureBlock(transactionDate)) {
      this.loadPenaltiesSettlementPreview(transactionDate, formatted, isFutureDate);
      return;
    }
    this.fetchPenaltiesForInitialDate();
  }

  /** Loads /template/penalties for the default date so LPI matches make-repayment / transfer. */
  private fetchPenaltiesForInitialDate(): void {
    const transactionDate = this.foreclosureForm.get('transactionDate').value;
    const formatted = this.dateUtils.formatDate(transactionDate, this.settingsService.dateFormat);
    this.loanService
      .getLoanPenaltiesTemplate(String(this.loanId), formatted)
      .pipe(catchError(() => of(null)))
      .subscribe((penaltyTemplate: any) => {
        this.penaltyTemplateData = penaltyTemplate;
        this.patchForeclosureFormFromTemplate(transactionDate);
        this.updateClosureTypeInfo();
        this.updateForeclosureOverpaymentPreview();
        this.dueEmis = this.getDueEmisForDate(transactionDate);
      });
  }

  /** Loads authoritative loan summary/schedule for outstanding reconciliation and EMI hints. */
  private loadLoanContext(): void {
    this.loanService
      .getLoanAccountResource(String(this.loanId), 'summary,repaymentSchedule,timeline')
      .subscribe((loanDetails: any) => {
        this.loanSummary = loanDetails?.summary || null;
        this.repaymentSchedule = loanDetails?.repaymentSchedule || null;
        this.isLineOfCreditDrawdown = !!(
          loanDetails?.lineOfCreditId || loanDetails?.additionalProperties?.lineOfCreditId
        );
        this.earliestUnpaidDueDate = this.resolveEarliestUnpaidDueDate();
        this.applyMaturityDate(loanDetails?.timeline?.expectedMaturityDate);
        if (loanDetails?.penaltyGracePeriod != null) {
          this.penaltyGracePeriodDays = Number(loanDetails.penaltyGracePeriod);
        }
        this.fullLoanOutstanding = roundAmount(Number(this.loanSummary?.totalOutstanding || 0));
        this.refreshSettlementForSelectedDate();
      });
  }

  /** First unpaid installment due date — mirrors LocForeclosureValidator on the server. */
  private resolveEarliestUnpaidDueDate(): Date | null {
    const periods = this.repaymentSchedule?.periods;
    if (!Array.isArray(periods)) {
      return null;
    }
    const earliest = periods
      .filter((period: any) => this.isRealOutstandingInstallment(period))
      .sort((a: any, b: any) => Number(a.period) - Number(b.period))[0];
    return earliest ? this.toComparableDate(earliest.dueDate) : null;
  }

  private isForeclosureBlockedByDueDate(selected: Date | null): boolean {
    if (!this.isLineOfCreditDrawdown || !selected || !this.earliestUnpaidDueDate) {
      return false;
    }
    return selected.getTime() >= this.earliestUnpaidDueDate.getTime();
  }

  private buildDueDateForeclosureBlockMessage(selectedDateValue: any): string {
    const dueLabel = this.dateUtils.formatDate(this.earliestUnpaidDueDate, this.settingsService.dateFormat);
    const selectedLabel = this.dateUtils.formatDate(selectedDateValue, this.settingsService.dateFormat);
    return (
      `Loan ${this.loanId} cannot be foreclosed on ${selectedLabel} because it is on or past its earliest ` +
      `unpaid installment due date (${dueLabel}). Foreclosure is only allowed before the loan is due; record a repayment instead.`
    );
  }

  /** Sets dateErrorMessage when LOC foreclosure is blocked on/after the earliest unpaid due date. */
  private applyDueDateForeclosureBlock(selectedDateValue: any): boolean {
    const blocked = this.isForeclosureBlockedByDueDate(this.toComparableDate(selectedDateValue));
    this.foreclosureBlockedByDueDate = blocked;
    if (blocked) {
      this.dateErrorMessage = this.buildDueDateForeclosureBlockMessage(selectedDateValue);
    }
    return blocked;
  }

  private isDueDateForeclosureErrorMessage(message: string): boolean {
    return /cannot be foreclosed on/i.test(message) && /earliest unpaid installment due date/i.test(message);
  }

  private applyMaturityDate(raw: any): void {
    const parsed = this.parseDateField(raw);
    if (parsed) {
      this.maturityDate = parsed;
    }
  }

  /** Parses a Fineract date value — either a [year, month, day] array or an ISO string. */
  private parseDateField(raw: any): Date | null {
    if (!raw) {
      return null;
    }
    if (Array.isArray(raw) && raw.length >= 3) {
      return new Date(raw[0], raw[1] - 1, raw[2]);
    }
    const parsed = this.dateUtils.parseDate(raw);
    return parsed || null;
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
      // Optional manual-amount entry for the ops team (off by default). Kept OUT of the submit payload on purpose —
      // submit() posts only transactionDate + note, so enabling this never changes what the backend collects; it only
      // drives the settlement-card preview below for verification against an externally-calculated figure.
      manualAmountEnabled: [false],
      manualAmount: [null],
      note: [
        '',
        Validators.required
      ]
    });
  }

  /** True when the operator has toggled manual entry on and typed a positive amount. */
  get manualAmountActive(): boolean {
    return !!this.foreclosureForm?.get('manualAmountEnabled')?.value && this.manualAmountValue > 0;
  }

  get manualAmountValue(): number {
    return roundAmount(Number(this.foreclosureForm?.get('manualAmount')?.value || 0));
  }

  /** Manual entered amount minus the system-computed settlement (positive = operator entered more). */
  get manualVsComputedDelta(): number {
    return roundAmount(this.manualAmountValue - this.dueAsOfDateTotal);
  }

  /** Headline total for the settlement card — the entered value when manual mode is active, else the computed total. */
  get settlementCardTotal(): number {
    return this.manualAmountActive ? this.manualAmountValue : this.dueAsOfDateTotal;
  }

  /** Eyebrow shown on the card — flags a manual figure so it is never mistaken for the computed quote. */
  get settlementCardEyebrow(): string | null {
    return this.manualAmountActive ? 'Manual amount entered' : null;
  }

  /**
   * Card breakdown lines. Hidden in manual mode: the computed component lines sum to the computed total, not the
   * entered one, so showing them beside a manual headline would look inconsistent.
   */
  get settlementCardLines(): SettlementSummaryLine[] {
    return this.manualAmountActive ? [] : this.settlementLines;
  }

  /** Footnotes for the card — in manual mode, show the computed settlement, the delta, and the collection caveat. */
  get settlementCardFootnotes(): Array<string | SettlementSummaryFootnote> {
    if (!this.manualAmountActive) {
      return this.summaryFootnotes;
    }
    const notes: Array<string | SettlementSummaryFootnote> = [
      {
        text: `Computed settlement: ${this.currencySymbol} ${this.formatAmount(this.dueAsOfDateTotal)}`,
        tone: 'default'
      }
    ];
    const delta = this.manualVsComputedDelta;
    if (Math.abs(delta) > 0.01) {
      const sign = delta > 0 ? '+' : '−';
      notes.push({
        text: `Difference vs computed: ${sign}${this.currencySymbol} ${this.formatAmount(Math.abs(delta))}`,
        tone: 'negative'
      });
    }
    notes.push('Manual amount is for reference/verification only — foreclosure collects the system-computed amount.');
    return notes;
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
    this.foreclosureBlockedByDueDate = false;
    this.isTemplateLoading = true;
    const selectedDate = this.toComparableDate(val);
    const businessDate = this.toComparableDate(this.settingsService.businessDate);
    const isFutureDate = !!(selectedDate && businessDate && selectedDate.getTime() > businessDate.getTime());

    if (this.applyDueDateForeclosureBlock(val)) {
      this.loadPenaltiesSettlementPreview(val, transactionDateFormatted, isFutureDate);
      return;
    }

    this.loanService
      .getForeclosureData(this.loanId, data)
      .pipe(
        switchMap((response: any) => {
          const penaltyTemplate$ = this.loanService
            .getLoanPenaltiesTemplate(String(this.loanId), transactionDateFormatted)
            .pipe(catchError(() => of(null)));
          const futureLpi$ = isFutureDate
            ? this.loanService
                .getFutureLPICharges(String(this.loanId), transactionDateFormatted)
                .pipe(catchError(() => of(null)))
            : of(null);
          return forkJoin({ penaltyTemplate: penaltyTemplate$, futureLpi: futureLpi$ }).pipe(
            map(({ penaltyTemplate, futureLpi }) => ({ response, penaltyTemplate, futureLpi }))
          );
        })
      )
      .subscribe({
        next: ({ response, penaltyTemplate, futureLpi }: any) => {
          this.additionalFutureLpiAmount = Number(futureLpi?.totalLPIAmount || 0);
          this.penaltyTemplateData = penaltyTemplate;
          this.foreclosuredata = response;
          this.captureTemplateMetadata(this.foreclosuredata);
          this.applyMaturityDate(this.foreclosuredata?.expectedMaturityDate);
          this.captureLinkedAccount(this.foreclosuredata);
          this.currencySymbol =
            this.currencySymbol || this.foreclosuredata.currency?.displaySymbol || this.foreclosuredata.currency?.code;

          this.patchForeclosureFormFromTemplate(val);
          this.updateClosureTypeInfo();
          this.updateForeclosureOverpaymentPreview();
          this.dueEmis = this.getDueEmisForDate(val);
          this.refreshSavingsBalanceAsOfDate(val);
          this.isTemplateLoading = false;
        },
        error: (err: any) => {
          const message =
            err?.error?.errors?.[0]?.defaultUserMessage ||
            err?.error?.defaultUserMessage ||
            'This foreclosure date is not allowed for this loan. Please choose a different date.';
          this.dateErrorMessage = message;
          this.isTemplateLoading = false;
          if (this.isDueDateForeclosureErrorMessage(message)) {
            this.foreclosureBlockedByDueDate = true;
            this.loadPenaltiesSettlementPreview(val, transactionDateFormatted, isFutureDate);
          }
        }
      });
  }

  /** Settlement preview from /template/penalties when foreclosure is blocked on/after the due date. */
  private loadPenaltiesSettlementPreview(val: any, transactionDateFormatted: string, isFutureDate: boolean): void {
    this.isTemplateLoading = true;
    const penaltyTemplate$ = this.loanService
      .getLoanPenaltiesTemplate(String(this.loanId), transactionDateFormatted)
      .pipe(catchError(() => of(null)));
    const futureLpi$ = isFutureDate
      ? this.loanService
          .getFutureLPICharges(String(this.loanId), transactionDateFormatted)
          .pipe(catchError(() => of(null)))
      : of(null);

    forkJoin({ penaltyTemplate: penaltyTemplate$, futureLpi: futureLpi$ }).subscribe({
      next: ({ penaltyTemplate, futureLpi }: any) => {
        this.additionalFutureLpiAmount = Number(futureLpi?.totalLPIAmount || 0);
        this.penaltyTemplateData = penaltyTemplate;
        this.patchDisplayFromPenaltiesTemplate(val);
        this.updateForeclosureOverpaymentPreview();
        this.dueEmis = this.getDueEmisForDate(val);
        this.refreshSavingsBalanceAsOfDate(val);
        this.isTemplateLoading = false;
      },
      error: () => {
        this.isTemplateLoading = false;
      }
    });
  }

  /** Patches display-only breakdown fields from the foreclosure template (not penalties / ledger reconcile). */
  private patchForeclosureFormFromTemplate(transactionDateValue?: any): void {
    if (!this.foreclosuredata || !this.foreclosureForm) {
      return;
    }
    if (this.foreclosureBlockedByDueDate) {
      this.patchDisplayFromPenaltiesTemplate(transactionDateValue);
      return;
    }
    this.foreclosureForm.patchValue({
      outstandingPrincipalPortion: this.foreclosuredata.principalPortion,
      outstandingInterestPortion: this.foreclosuredata.interestPortion,
      outstandingFeeChargesPortion: this.foreclosuredata.feeChargesPortion,
      outstandingPenaltyChargesPortion: this.foreclosuredata.penaltyChargesPortion,
      outstandingTaxChargesPortion: this.foreclosuredata.taxChargesPortion,
      transactionAmount: this.foreclosuredata.amount
    });
  }

  /** Authoritative as-of-date settlement from /template/penalties (repayment / transfer path). */
  private patchDisplayFromPenaltiesTemplate(transactionDateValue: any): void {
    if (!this.foreclosureForm) {
      return;
    }
    const principal = Number(
      this.penaltyTemplateData?.principalOutstanding ?? this.foreclosuredata?.principalPortion ?? 0
    );
    const interest = Number(
      this.penaltyTemplateData?.interestOutstanding ?? this.foreclosuredata?.interestPortion ?? 0
    );
    const fee = Number(this.loanSummary?.feeChargesOutstanding ?? this.foreclosuredata?.feeChargesPortion ?? 0);
    const tax = Number(this.loanSummary?.taxChargesOutstanding ?? this.foreclosuredata?.taxChargesPortion ?? 0);
    const templatePenalty = Number(this.penaltyTemplateData?.penaltyAmountDue || 0) + this.additionalFutureLpiAmount;
    const dueWithoutPenalty = roundAmount(principal + interest + fee + tax);
    const onBusinessDate = isSameCalendarDate(transactionDateValue, this.settingsService.businessDate, (value) =>
      this.toComparableDate(value)
    );
    const penaltyPortion = roundAmount(
      onBusinessDate
        ? templatePenalty
        : reconcilePenaltyWithLedger({
            penaltyFromTemplate: templatePenalty,
            penaltyInSummary: Number(this.loanSummary?.penaltyChargesOutstanding ?? this.baselinePenaltyChargesPortion),
            fullLoanOutstanding: this.fullLoanOutstanding,
            dueWithoutPenaltyReconcile: dueWithoutPenalty,
            isBusinessDate: onBusinessDate,
            onInstallmentDueDate: !!this.penaltyTemplateData?.onInstallmentDueDate,
            hasRealEmiDueOnDate: isRealEmiDueOnDate(this.repaymentSchedule?.periods, transactionDateValue, (value) =>
              this.toComparableDate(value)
            )
          })
    );
    const transactionAmount = roundAmount(dueWithoutPenalty + penaltyPortion);
    this.foreclosureForm.patchValue({
      outstandingPrincipalPortion: principal,
      outstandingInterestPortion: interest,
      outstandingFeeChargesPortion: fee,
      outstandingPenaltyChargesPortion: penaltyPortion,
      outstandingTaxChargesPortion: tax,
      transactionAmount
    });
  }

  /**
   * Sets closureTypeInfo based on whether the selected transaction date is before (foreclosure)
   * or on/after (normal closure) the loan's scheduled maturity date.
   */
  private updateClosureTypeInfo(): void {
    if (!this.maturityDate) {
      this.closureTypeInfo = null;
      return;
    }
    const selectedVal = this.foreclosureForm.get('transactionDate').value;
    if (!selectedVal) {
      this.closureTypeInfo = null;
      return;
    }
    const selected = selectedVal instanceof Date ? selectedVal : new Date(selectedVal);
    // Strip time-of-day for a pure date comparison.
    const selectedDay = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
    const maturityDay = new Date(
      this.maturityDate.getFullYear(),
      this.maturityDate.getMonth(),
      this.maturityDate.getDate()
    );
    const maturityFormatted = this.dateUtils.formatDate(this.maturityDate, this.settingsService.dateFormat);

    if (selectedDay < maturityDay) {
      this.closureTypeInfo = {
        type: 'foreclosure',
        message: `Before scheduled maturity (${maturityFormatted}) — early-repayment interest discount applies.`
      };
    } else {
      this.closureTypeInfo = {
        type: 'normal_closure',
        message: `On or after scheduled maturity (${maturityFormatted}) — regular closure, no early discount.`
      };
    }
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
      this.linkedSavingsAccountAvailableBalance = Number(additional.linkedSavingsAccountAvailableBalance || 0);
      this.isReceivableLineOfCredit = additional.isReceivableLineOfCredit;
      this.applyEarliestAllowedDate(additional.earliestAllowedTransactionDate);
      this.ensureLinkedSavingsTransactionsLoaded();
      this.refreshSavingsBalanceAsOfDate(this.foreclosureForm?.get('transactionDate')?.value);
    }
  }

  private ensureLinkedSavingsTransactionsLoaded(): void {
    if (!this.linkedSavingsAccountId || this.savingsAccountLoadStarted) {
      return;
    }
    this.savingsAccountLoadStarted = true;
    this.loadLinkedSavingsTransactions();
  }

  private loadLinkedSavingsTransactions(): void {
    if (!this.linkedSavingsAccountId) {
      return;
    }
    this.savingsService
      .getSavingsAccountData(String(this.linkedSavingsAccountId))
      .pipe(catchError(() => of(null)))
      .subscribe((savingsAccount: any) => {
        if (!savingsAccount) {
          this.savingsAccountLoadStarted = false;
          return;
        }
        this.captureSavingsTransactions(savingsAccount);
        this.refreshSavingsBalanceAsOfDate(this.foreclosureForm?.get('transactionDate')?.value);
      });
  }

  private captureSavingsTransactions(savingsAccount: any): void {
    if (!savingsAccount) {
      return;
    }
    this.savingsTransactions = Array.isArray(savingsAccount.transactions) ? savingsAccount.transactions : [];
    this.savingsTransactionsLoaded = true;
    const currentAvailable = Number(
      savingsAccount.summary?.availableBalance ??
        savingsAccount.summary?.accountBalance ??
        this.linkedSavingsAccountAvailableBalance ??
        0
    );
    if (!Number.isNaN(currentAvailable)) {
      this.linkedSavingsAccountAvailableBalance = currentAvailable;
    }
  }

  private refreshSavingsBalanceAsOfDate(
    transactionDateValue: Date = this.foreclosureForm?.get('transactionDate')?.value
  ): void {
    const asOf = this.toComparableDate(transactionDateValue);
    const isBusinessDate = isSameCalendarDate(transactionDateValue, this.settingsService.businessDate, (value) =>
      this.toComparableDate(value)
    );
    // Do not show today's balance as a stand-in for a backdate while transaction history is still loading.
    const fallback =
      this.savingsTransactionsLoaded || isBusinessDate ? Number(this.linkedSavingsAccountAvailableBalance || 0) : 0;
    this.availableBalanceAsOfDate = computeSavingsBalanceAsOf(
      this.savingsTransactions,
      asOf,
      (value) => this.toComparableDate(value),
      fallback
    );
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
    this.backdateLimitMessage = `Earliest allowed date: ${formatted}. Cannot be before the loan's last recorded transaction.`;
  }

  get isFutureDateSelected(): boolean {
    const raw = this.foreclosureForm?.value?.transactionDate;
    const selected =
      raw instanceof Date ? new Date(raw.getFullYear(), raw.getMonth(), raw.getDate()) : this.parseDateField(raw);
    const businessRaw = this.settingsService.businessDate;
    const business =
      businessRaw instanceof Date
        ? new Date(businessRaw.getFullYear(), businessRaw.getMonth(), businessRaw.getDate())
        : this.parseDateField(businessRaw);
    return !!(selected && business && selected.getTime() > business.getTime());
  }

  get selectedTransactionDateLabel(): string {
    const value = this.foreclosureForm?.value?.transactionDate;
    return value ? this.dateUtils.formatDate(value, this.settingsService.dateFormat) : '';
  }

  get isSelectedBusinessDate(): boolean {
    return isSameCalendarDate(
      this.foreclosureForm?.value?.transactionDate,
      this.settingsService.businessDate,
      (value) => this.toComparableDate(value)
    );
  }

  /** Non-future reasons Submit stays disabled (future date uses compact preview banner instead). */
  get submitBlockedReason(): string | null {
    if (this.isFutureDateSelected) {
      return null;
    }
    if (this.isTemplateLoading) {
      return 'Loading foreclosure details…';
    }
    if (this.dateErrorMessage) {
      return this.dateErrorMessage;
    }
    if (!this.foreclosureForm?.valid) {
      return 'Enter a Note before submitting.';
    }
    return null;
  }

  private get formRawValue(): Record<string, any> {
    return this.foreclosureForm?.getRawValue() || {};
  }

  /** Foreclosure amount as of the selected date (P + I + fees + tax + LPI still due). */
  get dueAsOfDateTotal(): number {
    return roundAmount(Number(this.formRawValue.transactionAmount || this.foreclosuredata?.amount || 0));
  }

  get penaltyAsOfDate(): number {
    return roundAmount(Number(this.formRawValue.outstandingPenaltyChargesPortion || 0));
  }

  get penaltyInSummary(): number {
    return roundAmount(Number(this.loanSummary?.penaltyChargesOutstanding ?? this.baselinePenaltyChargesPortion));
  }

  /** LPI on the loan today that is excluded when foreclosing on the selected (earlier) date. */
  get penaltyWaivedByBackdate(): number {
    return computePenaltyWaivedByBackdate(this.penaltyInSummary, this.penaltyAsOfDate);
  }

  get outstandingAfterWaiver(): number {
    return computeSettlementRequired({
      principal: Number(this.formRawValue.outstandingPrincipalPortion || 0),
      interest: Number(this.formRawValue.outstandingInterestPortion || 0),
      fee: Number(this.formRawValue.outstandingFeeChargesPortion || 0),
      tax: Number(this.formRawValue.outstandingTaxChargesPortion || 0),
      penalty: this.penaltyAsOfDate
    });
  }

  get settlementLines(): SettlementSummaryLine[] {
    const principalLabel = this.isReceivableLineOfCredit ? 'Disbursal' : 'Principal';
    const lines: SettlementSummaryLine[] = [
      { label: principalLabel, amount: Number(this.formRawValue.outstandingPrincipalPortion || 0) },
      { label: 'Interest', amount: Number(this.formRawValue.outstandingInterestPortion || 0) },
      { label: 'Fees', amount: Number(this.formRawValue.outstandingFeeChargesPortion || 0) },
      { label: 'Tax', amount: Number(this.formRawValue.outstandingTaxChargesPortion || 0) }
    ];
    const penalty = Number(this.formRawValue.outstandingPenaltyChargesPortion || 0);
    if (penalty > 0.01) {
      lines.splice(3, 0, { label: 'LPI', amount: penalty });
    }
    return lines.filter((line) => line.amount > 0.01);
  }

  /** Early foreclosure vs normal closure — hidden when due-date block applies. */
  get settlementBadge(): string | null {
    if (this.foreclosureBlockedByDueDate) {
      return null;
    }
    if (this.isPostMaturityGracePeriodClosure) {
      return 'Post-maturity LPI';
    }
    if (this.closureTypeInfo?.type === 'foreclosure') {
      return 'Early foreclosure';
    }
    if (this.closureTypeInfo?.type === 'normal_closure') {
      return 'Normal closure';
    }
    return null;
  }

  get settlementSubtitle(): string | null {
    if (this.foreclosureBlockedByDueDate) {
      return 'Foreclosure not allowed — record a repayment instead';
    }
    if (this.isPostMaturityGracePeriodClosure) {
      const graceHint =
        this.penaltyGracePeriodDays != null ? ` (${this.penaltyGracePeriodDays}-day penalty grace after maturity)` : '';
      return (
        `Post-maturity LPI closure${graceHint} — remaining grace-period LPI only; ` +
        'should close as Closed (obligations met), not Overpaid'
      );
    }
    if (this.willBecomeOverpaid) {
      return (
        `Quoted total exceeds schedule close cap by ~${this.currencySymbol} ${this.formatAmount(this.projectedOverpaymentAmount)} — ` +
        'loan may become Overpaid instead of Closed'
      );
    }
    return null;
  }

  /**
   * After scheduled maturity, RBF/factor-rate products accrue LPI through the penalty grace window.
   * The schedule shows a GRACE_PERIOD_APPLIED row (P/I zero, LPI only) — normal closure, not early foreclosure.
   */
  get isPostMaturityGracePeriodClosure(): boolean {
    if (this.postMaturityGracePeriodLpiClosure) {
      return true;
    }
    if (this.foreclosureBlockedByDueDate || !this.maturityDate) {
      return false;
    }
    const selected = this.toComparableDate(this.foreclosureForm?.value?.transactionDate);
    if (!selected || selected.getTime() <= this.maturityDate.getTime()) {
      return false;
    }
    const principal = Number(this.formRawValue.outstandingPrincipalPortion || 0);
    const interest = Number(this.formRawValue.outstandingInterestPortion || 0);
    return principal <= 0.01 && interest <= 0.01 && this.penaltyAsOfDate > 0.01;
  }

  private captureTemplateMetadata(source: any): void {
    const attrs = source?.additionalAttributes;
    if (!attrs) {
      return;
    }
    if (attrs.expectedMaturityDate) {
      this.maturityDate = this.parseDateField(attrs.expectedMaturityDate) || this.maturityDate;
    }
    if (attrs.penaltyGracePeriodDays != null) {
      this.penaltyGracePeriodDays = Number(attrs.penaltyGracePeriodDays);
    }
    this.postMaturityGracePeriodLpiClosure = !!attrs.postMaturityGracePeriodLpiClosure;
  }

  /** Overdue LPI on the schedule (repayment-schedule column), often higher than the foreclosure LPI line. */
  get scheduleOverduePenaltyOutstanding(): number {
    const periods = this.repaymentSchedule?.periods;
    if (!Array.isArray(periods)) {
      return 0;
    }
    const selected = this.toComparableDate(this.foreclosureForm?.value?.transactionDate);
    if (!selected) {
      return 0;
    }
    return roundAmount(
      periods
        .filter((period: any) => this.isRealOutstandingInstallment(period))
        .filter((period: any) => {
          const dueDate = this.toComparableDate(period.dueDate);
          return dueDate && dueDate.getTime() < selected.getTime();
        })
        .reduce((sum: number, period: any) => sum + this.getPeriodComponentOutstanding(period, 'penalty'), 0)
    );
  }

  /** Sum of every unpaid real installment — conservative cap for full close without Overpaid. */
  get scheduleFullRepaymentCap(): number {
    const periods = this.repaymentSchedule?.periods as SchedulePeriod[] | undefined;
    return computeScheduleCloseCap(periods);
  }

  /**
   * Maximum the backend can absorb on closure without moving the loan to Overpaid — same logic as Make Repayment.
   */
  get settlementCapWithoutOverpay(): number {
    if (this.foreclosureBlockedByDueDate) {
      return 0;
    }
    return computeAuthoritativeSettlementCap({
      outstandingAfterWaiver: this.outstandingAfterWaiver,
      fullLoanOutstanding: this.fullLoanOutstanding,
      scheduleCloseCap: this.scheduleFullRepaymentCap,
      datedRepaymentTemplateAmount: this.datedForeclosureTemplateAmount
    });
  }

  /** Raw foreclosure template amount before authoritative cap reconciliation. */
  get datedForeclosureTemplateAmount(): number {
    return roundAmount(Number(this.foreclosuredata?.amount || 0));
  }

  get projectedOverpaymentAmount(): number {
    return computeProjectedOverpayment(this.dueAsOfDateTotal, this.settlementCapWithoutOverpay);
  }

  get willBecomeOverpaid(): boolean {
    return this.projectedOverpaymentAmount > 0.01;
  }

  /** @deprecated Use projectedOverpaymentAmount — kept for settlement card footnotes. */
  get foreclosureOverpaymentRisk(): number {
    return this.projectedOverpaymentAmount;
  }

  private updateForeclosureOverpaymentPreview(): void {
    this.foreclosureOutcomeNotice = null;
    if (!this.willBecomeOverpaid || this.foreclosureBlockedByDueDate) {
      return;
    }
    const excess = this.projectedOverpaymentAmount;
    this.foreclosureOutcomeNotice =
      `After foreclosure the loan will become Overpaid by ${this.currencySymbol} ${this.formatAmount(excess)} ` +
      `(status Overpaid, not Closed).`;
  }

  get settlementClosesLoan(): boolean {
    return !this.foreclosureBlockedByDueDate;
  }

  get showSettlementPreview(): boolean {
    return !this.dateErrorMessage || this.foreclosureBlockedByDueDate;
  }

  /** Account-list reference on today, or waived-LPI context when backdating. */
  get settlementLedgerToday(): number {
    if (this.isSelectedBusinessDate) {
      return this.fullLoanOutstanding;
    }
    return this.penaltyWaivedByBackdate > 0.01 ? this.fullLoanOutstanding : 0;
  }

  get settlementLedgerDelta(): number {
    if (this.isSelectedBusinessDate) {
      const delta = this.fullOutstandingVsDueDelta;
      if (delta <= 0.01) {
        return 0;
      }
      if (this.unearnedInterest > 0.01 && this.penaltyAsOfDate <= 0.01) {
        return 0;
      }
      return Math.max(roundAmount(delta - this.unearnedInterest), 0);
    }
    return this.penaltyWaivedByBackdate > 0.01 ? this.penaltyWaivedByBackdate : 0;
  }

  get summaryFootnotes(): Array<string | SettlementSummaryFootnote> {
    const notes: Array<string | SettlementSummaryFootnote> = [];
    if (this.foreclosureBlockedByDueDate) {
      notes.push('Amounts shown are what would be due via repayment on this date, not a foreclosure quote.');
    }
    if (this.isPostMaturityGracePeriodClosure) {
      notes.push(
        'GRACE_PERIOD_APPLIED on the schedule is post-maturity penalty grace LPI (no principal/interest due). ' +
          'All EMIs are already paid — this payment clears remaining LPI only.'
      );
    }
    if (
      this.unearnedInterest > 0.01 &&
      this.closureTypeInfo?.type === 'foreclosure' &&
      !this.foreclosureBlockedByDueDate
    ) {
      notes.push({
        text: `Unearned interest: −${this.currencySymbol} ${this.formatAmount(this.unearnedInterest)}`,
        tone: 'negative'
      });
    }
    if (this.isRealEmiDueOnSelectedDate && this.penaltyAsOfDate <= 0.01 && this.settlementLedgerDelta <= 0.01) {
      notes.push('No LPI on installment due date');
    }
    const penaltyGap = roundAmount(this.scheduleOverduePenaltyOutstanding - this.penaltyAsOfDate);
    if (penaltyGap > 0.01 && !this.foreclosureBlockedByDueDate && !this.willBecomeOverpaid) {
      notes.push(
        `Schedule overdue LPI ${this.currencySymbol} ${this.formatAmount(this.scheduleOverduePenaltyOutstanding)} ` +
          `vs quote LPI ${this.currencySymbol} ${this.formatAmount(this.penaltyAsOfDate)} — ` +
          `paying the quoted total may overpay by ~${this.currencySymbol} ${this.formatAmount(penaltyGap)}`
      );
    }
    if (this.willBecomeOverpaid && !this.foreclosureBlockedByDueDate) {
      notes.push(
        `Quoted foreclosure total ${this.currencySymbol} ${this.formatAmount(this.dueAsOfDateTotal)} exceeds the ` +
          `schedule close cap ${this.currencySymbol} ${this.formatAmount(this.settlementCapWithoutOverpay)} by ` +
          `${this.currencySymbol} ${this.formatAmount(this.projectedOverpaymentAmount)}.`
      );
    }
    if (this.isFutureDateSelected && this.additionalFutureLpiAmount > 0.01) {
      notes.push(
        `+${this.currencySymbol} ${this.formatAmount(this.additionalFutureLpiAmount)} projected LPI (preview)`
      );
    }
    return notes;
  }

  get isRealEmiDueOnSelectedDate(): boolean {
    return isRealEmiDueOnDate(this.repaymentSchedule?.periods, this.foreclosureForm?.value?.transactionDate, (value) =>
      this.toComparableDate(value)
    );
  }

  get showDueEmiPills(): boolean {
    if (this.dueEmis.length === 0) {
      return false;
    }
    if (this.dueEmis.length === 1) {
      return Math.abs(Number(this.dueEmis[0].amount || 0) - this.dueAsOfDateTotal) > 0.01;
    }
    return true;
  }

  get businessDateLabel(): string {
    return this.dateUtils.formatDate(this.settingsService.businessDate, this.settingsService.dateFormat);
  }

  get fullOutstandingVsDueDelta(): number {
    return roundAmount(this.fullLoanOutstanding - this.dueAsOfDateTotal);
  }

  /**
   * Interest waived by early foreclosure — ledger full-period interest minus foreclosure quote interest,
   * or the account-list vs settlement gap when the template rolls discount into principal only.
   */
  get unearnedInterest(): number {
    const interestAsOfDate = Number(this.formRawValue.outstandingInterestPortion || 0);
    const fromSummary = computeUnearnedInterest(Number(this.loanSummary?.interestOutstanding ?? 0), interestAsOfDate);
    if (fromSummary > 0.01) {
      return fromSummary;
    }
    const fromBaseline = roundAmount(this.baselineInterestPortion - interestAsOfDate);
    if (fromBaseline > 0.01) {
      return fromBaseline;
    }
    if (
      this.closureTypeInfo?.type === 'foreclosure' &&
      !this.foreclosureBlockedByDueDate &&
      this.penaltyAsOfDate <= 0.01
    ) {
      return Math.max(this.fullOutstandingVsDueDelta, 0);
    }
    return 0;
  }

  private getDueEmisForDate(
    transactionDateValue: Date
  ): Array<{ period: number; dueDate: any; amount: number; state: 'overdue' | 'due' }> {
    const periods = this.repaymentSchedule?.periods;
    if (!Array.isArray(periods)) {
      return [];
    }

    const selected = this.toComparableDate(transactionDateValue);
    if (!selected) {
      return [];
    }

    let remainingPenalty = this.penaltyAsOfDate;
    return periods
      .filter((period: any) => this.isRealOutstandingInstallment(period))
      .filter((period: any) => {
        const dueDate = this.toComparableDate(period.dueDate);
        return dueDate && dueDate.getTime() <= selected.getTime();
      })
      .sort((a: any, b: any) => Number(a.period) - Number(b.period))
      .map((period: any) => {
        const dueDate = this.toComparableDate(period.dueDate);
        const schedulePenalty = this.getPeriodComponentOutstanding(period, 'penalty');
        const penalty = Math.min(schedulePenalty, remainingPenalty);
        remainingPenalty = roundAmount(remainingPenalty - penalty);
        const amount = roundAmount(
          this.getPeriodComponentOutstanding(period, 'principal') +
            this.getPeriodComponentOutstanding(period, 'interest') +
            this.getPeriodComponentOutstanding(period, 'fee') +
            this.getPeriodComponentOutstanding(period, 'tax') +
            penalty
        );
        const state: 'overdue' | 'due' = dueDate && dueDate.getTime() < selected.getTime() ? 'overdue' : 'due';
        return {
          period: Number(period.period),
          dueDate: period.dueDate,
          amount,
          state
        };
      })
      .filter((emi) => emi.amount > 0);
  }

  private isRealOutstandingInstallment(period: any): boolean {
    if (!period || period.complete || period.obligationsMetOnDate || period.downPaymentPeriod || period.isAdditional) {
      return false;
    }
    const periodNumber = Number(period.period);
    if (!periodNumber || periodNumber < 1 || Number(period.principalDisbursed || 0) > 0) {
      return false;
    }
    return this.getPeriodOutstandingAmount(period) > 0;
  }

  private getPeriodOutstandingAmount(period: any): number {
    const explicitOutstanding = Number(period.totalOutstandingForPeriod ?? 0);
    if (explicitOutstanding > 0) {
      return explicitOutstanding;
    }
    const due = Number(period.totalDueForPeriod ?? 0);
    const paid = Number(period.totalPaidForPeriod ?? 0);
    return Math.max(roundAmount(due - paid), 0);
  }

  private getPeriodComponentOutstanding(
    period: any,
    component: 'penalty' | 'fee' | 'tax' | 'interest' | 'principal'
  ): number {
    const fieldMap: Record<string, [string, string, string]> = {
      penalty: [
        'penaltyChargesOutstanding',
        'penaltyChargesDue',
        'penaltyChargesPaid'
      ],
      fee: [
        'feeChargesOutstanding',
        'feeChargesDue',
        'feeChargesPaid'
      ],
      tax: [
        'taxChargesOutstanding',
        'taxChargesDue',
        'taxChargesPaid'
      ],
      interest: [
        'interestOutstanding',
        'interestDue',
        'interestPaid'
      ],
      principal: [
        'principalOutstanding',
        'principalDue',
        'principalPaid'
      ]
    };
    const [
      outstandingField,
      dueField,
      paidField
    ] = fieldMap[component];
    const explicit = Number(period?.[outstandingField] ?? NaN);
    if (!Number.isNaN(explicit) && explicit > 0) {
      return roundAmount(explicit);
    }
    const due = Number(period?.[dueField] ?? 0);
    const paid = Number(period?.[paidField] ?? 0);
    return roundAmount(Math.max(due - paid, 0));
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

  private formatAmount(value: number): string {
    return roundAmount(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  submit() {
    if (this.isFutureDateSelected || this.dateErrorMessage) {
      return;
    }
    const formValue = this.foreclosureForm.value;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    let transactionDate = formValue.transactionDate;
    if (transactionDate instanceof Date) {
      transactionDate = this.dateUtils.formatDate(transactionDate, dateFormat);
    }
    // Disabled breakdown fields must not be posted.
    const data = {
      transactionDate,
      note: formValue.note,
      dateFormat,
      locale
    };

    this.loanService.loanForclosureData(this.loanId, data).subscribe(() => {
      this.router.navigate([`../../general`], { relativeTo: this.route });
    });
  }
}
