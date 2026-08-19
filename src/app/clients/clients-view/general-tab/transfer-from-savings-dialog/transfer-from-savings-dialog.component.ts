import { Component, Inject, OnInit } from '@angular/core';
import { AbstractControl, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { forkJoin, of, throwError, TimeoutError } from 'rxjs';
import { catchError, finalize, switchMap, timeout } from 'rxjs/operators';

import { AccountTransfersService } from 'app/account-transfers/account-transfers.service';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import {
  allocateSettlement,
  computePenaltyWaivedByBackdate,
  computeSavingsBalanceAsOf,
  computeSettlementRequired,
  computeUnearnedInterest,
  isRealEmiDueOnDate,
  isSameCalendarDate,
  reconcilePenaltyWithLedger
} from 'app/loans/common/backdated-settlement.util';
import { SettingsService } from 'app/settings/settings.service';
import { AlertService } from 'app/core/alert/alert.service';
import { SavingsService } from 'app/savings/savings.service';
import {
  SettlementSummaryFootnote,
  SettlementSummaryLine
} from 'app/shared/settlement-summary-card/settlement-summary-card.component';

@Component({
  selector: 'mifosx-transfer-from-savings-dialog',
  templateUrl: './transfer-from-savings-dialog.component.html',
  styleUrls: ['./transfer-from-savings-dialog.component.scss']
})
export class TransferFromSavingsDialogComponent implements OnInit {
  transferForm: UntypedFormGroup;
  /**
   * Minimum Date allowed — backend-computed per loan: MAX_BACKDATE_DAYS before the business date, or the
   * loan's disbursement date if that is later (see BackdatedRepaymentValidator#computeEarliestAllowedTransactionDate
   * on the server). Replaced with the real value once the initial template loads (see loadInitialTemplate).
   * Maximum allows FUTURE dates so ops can preview LPI that would accrue until a future pay date.
   * A transfer cannot actually be recorded with a future date — the backend rejects it — so Submit is
   * disabled while a future date is selected (see isFutureDateSelected).
   */
  minDate = new Date(2000, 0, 1);
  maxDate: Date;
  /** Clear, on-screen explanation of why minDate is where it is — shown next to the transaction date field. */
  backdateLimitMessage = '';
  currency: any;
  currencySymbol = '';
  linkedSavingsAccountId?: number;
  linkedSavingsAccountAccountNo?: string;
  linkedSavingsAccountProductName?: string;
  linkedSavingsAccountAvailableBalance = 0;
  /** Running balance of the linked savings account as of the selected transaction date. */
  availableBalanceAsOfDate = 0;
  private savingsTransactions: any[] = [];
  /**
   * Component amounts due as of the selected transaction date (from /template/penalties + schedule).
   * These are NOT the full loan outstanding — see fullLoanOutstanding.
   */
  principalOutstanding = 0;
  remainingPrincipalOutstanding = 0;
  interestOutstanding = 0;
  feeOutstanding = 0;
  penaltyOutstanding = 0;
  taxOutstanding = 0;
  /**
   * Authoritative full loan outstanding from GET /loans/{id}?associations=summary.
   * Closure messaging and overpayment checks MUST use this — never due-EMI template amounts.
   * The client general-tab loan row has no `summary` (only loanBalance), which previously caused
   * false "will close the loan" banners when settling a single due EMI.
   */
  fullLoanOutstanding = 0;
  dueEmis: any[] = [];
  transferTemplate: any;
  isLoading = false;
  isTemplateLoading = false;
  /** Inline message when POST /accounttransfers fails or times out. */
  submitErrorMessage: string | null = null;

  /** Baseline amounts from the initial penalties template (business date) for date-change deltas. */
  private baselinePrincipalOutstanding = 0;
  private baselineRemainingPrincipalOutstanding = 0;
  private baselineInterestOutstanding = 0;
  private baselinePenaltyOutstanding = 0;
  private repaymentTemplateData: any;
  /** Full loan summary loaded from the loan API (not the client accounts list row). */
  private loanSummary: any;
  /** Shown when pending LPI is due on the selected date and will be paid with this settlement. */
  /**
   * Set when the selected (backdated) transaction date is not allowed for this loan's product
   * configuration - mirrors the server-side validateBackdatedRepaymentAllowed guard so the operator
   * is told proactively, before submitting, rather than only after a rejected API call.
   */
  backdateBlockedMessage: string | null = null;
  /** Policy text shown inside the collapsible hint (not date-specific). */
  readonly staticFutureDatePolicy =
    'A future date can be selected to preview how much late-payment interest (LPI) would accrue, but a transfer cannot be recorded with a future date — the backend does not support it.';
  /**
   * Warning shown when the entered amount would leave the loan in an overpaid state (amount >
   * total outstanding). This is a WARNING, not an error — the operator can still submit if they
   * explicitly want to overpay, but must see clearly what will happen (loan closes and excess is
   * auto-refunded to the linked savings account).
   */
  overpaymentWarning: string | null = null;
  /**
   * Visible notice when the entered amount fully settles (or overpays) the loan — the last payment
   * that drives loan closure. Always includes the refundable excess amount when amount > outstanding.
   */
  closureRefundNotice: string | null = null;
  /** From /template/penalties — true when value date equals a real EMI due date. */
  private onInstallmentDueDate = false;
  /** Settlement card: date-based due amounts vs waterfall preview for the entered amount. */
  settlementPreviewMode: 'date' | 'manual' = 'date';

  constructor(
    private formBuilder: UntypedFormBuilder,
    private loanService: LoansService,
    private accountTransfersService: AccountTransfersService,
    private savingsService: SavingsService,
    private dateUtils: Dates,
    private settingsService: SettingsService,
    private alertService: AlertService,
    private dialogRef: MatDialogRef<TransferFromSavingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { loan: any; clientId: any }
  ) {}

  ngOnInit(): void {
    // Allow selecting a future date so ops can preview LPI that would accrue until then. Submission with a
    // future date stays blocked — the backend rejects it and Submit is disabled (see isFutureDateSelected).
    const business = new Date(this.settingsService.businessDate);
    this.maxDate = new Date(business.getFullYear() + 5, business.getMonth(), business.getDate());
    this.createForm();
    this.loadInitialTemplate();
    this.transferForm.get('transactionDate')?.valueChanges.subscribe((value: Date) => {
      if (value) {
        this.recomputeForTransactionDate(value);
      }
    });
    this.transferForm.get('transactionAmount')?.valueChanges.subscribe(() => {
      this.onTransactionAmountEdited();
    });
  }

  private onTransactionAmountEdited(): void {
    this.submitErrorMessage = null;
    this.validateTransactionAmount();
    if (this.canUseManualPreview) {
      this.settlementPreviewMode = 'manual';
    } else {
      this.settlementPreviewMode = 'date';
    }
  }

  onManualPreviewToggle(useManual: boolean): void {
    this.settlementPreviewMode = useManual ? 'manual' : 'date';
    if (!useManual) {
      this.patchDefaultTransactionAmount();
      this.validateTransactionAmount(true);
    }
  }

  private createForm(): void {
    this.transferForm = this.formBuilder.group({
      transactionDate: [
        this.settingsService.businessDate,
        Validators.required
      ],
      transactionAmount: [
        '',
        Validators.required
      ],
      note: [
        'Settlement transfer from linked savings',
        [
          Validators.required,
          this.notBlankValidator
        ]
      ]
    });
  }

  private loadInitialTemplate(): void {
    const loanId = String(this.data.loan.id);
    const transactionDate = this.formatDate(this.transferForm.value.transactionDate);
    this.isTemplateLoading = true;

    forkJoin({
      repaymentTemplate: this.loanService.getLoanActionTemplate(loanId, 'repayment'),
      penaltyTemplate: this.loanService.getLoanPenaltiesTemplate(loanId, transactionDate),
      foreclosureTemplate: this.loanService.getLoanForeclosureActionTemplate(loanId),
      // Client general-tab loan rows have no summary — always load authoritative outstanding here.
      loanDetails: this.loanService.getLoanAccountResource(loanId, 'summary,repaymentSchedule')
    })
      .pipe(
        switchMap((templates: any) => {
          this.currency = templates.repaymentTemplate?.currency || templates.foreclosureTemplate?.currency;
          this.currencySymbol = this.currency?.displaySymbol || this.currency?.code || '';
          this.repaymentTemplateData = templates.repaymentTemplate;
          this.captureLinkedSavingsAccount(templates.foreclosureTemplate);
          this.applyLoanSummary(templates.loanDetails);
          // Remaining-principal baseline for full settlement (all EMIs), not current-installment only.
          this.baselinePrincipalOutstanding = Number(templates.penaltyTemplate?.principalOutstanding || 0);
          this.baselineRemainingPrincipalOutstanding = Number(
            templates.penaltyTemplate?.remainingPrincipalOutstanding ||
              templates.loanDetails?.summary?.principalOutstanding ||
              templates.penaltyTemplate?.principalOutstanding ||
              0
          );
          this.baselineInterestOutstanding = Number(templates.penaltyTemplate?.interestOutstanding || 0);
          this.baselinePenaltyOutstanding = Number(templates.penaltyTemplate?.penaltyAmountDue || 0);
          this.applyPenaltyTemplateForDate(templates.penaltyTemplate, 0);
          this.applyEarliestAllowedDate(templates.penaltyTemplate?.earliestAllowedTransactionDate);
          this.data.loan.repaymentSchedule =
            templates.loanDetails?.repaymentSchedule || this.data.loan.repaymentSchedule;
          this.dueEmis = this.getDueEmisForDate(this.transferForm.value.transactionDate);
          this.patchDefaultTransactionAmount();
          this.validateTransactionAmount(true);

          if (!this.linkedSavingsAccountId) {
            this.refreshSavingsBalanceAsOfDate();
            return of(null);
          }
          return forkJoin({
            transferTemplate: this.accountTransfersService.newAccountTranferResource(this.linkedSavingsAccountId, '2', {
              toAccountType: 1,
              toAccountId: this.data.loan.id
            }),
            savingsAccount: this.savingsService
              .getSavingsAccountData(String(this.linkedSavingsAccountId))
              .pipe(catchError(() => of(null)))
          });
        })
      )
      .subscribe({
        next: (result: any) => {
          this.transferTemplate = result?.transferTemplate ?? result;
          this.captureSavingsTransactions(result?.savingsAccount);
          this.refreshSavingsBalanceAsOfDate();
          this.isTemplateLoading = false;
          this.validateTransactionAmount(true);
        },
        error: () => {
          this.isTemplateLoading = false;
          this.validateTransactionAmount(true);
        }
      });
  }

  /** Additional future LPI returned by /future-charges for the selected date (0 when not future). */
  private additionalFutureLpiAmount = 0;

  private recomputeForTransactionDate(transactionDateValue: Date): void {
    const loanId = String(this.data.loan.id);
    const transactionDate = this.formatDate(transactionDateValue);
    const businessDate = this.settingsService.businessDate;
    const selectedDate = this.dateUtils.parseDate(transactionDate);
    const isFutureDate = selectedDate && businessDate && selectedDate.getTime() > businessDate.getTime();
    const isBackdated = !!(selectedDate && businessDate && selectedDate.getTime() < businessDate.getTime());

    this.backdateBlockedMessage =
      isBackdated && this.data.loan?.isInterestRecalculationEnabled
        ? 'This date is in the past (backdated). Backdated settlements are NOT allowed for this loan because ' +
          "interest recalculation is enabled on its product - the server will reject this. Please use today's " +
          'date instead.'
        : null;

    this.isTemplateLoading = true;
    this.loanService
      .getLoanPenaltiesTemplate(loanId, transactionDate)
      .pipe(
        switchMap((penaltyTemplate: any) => {
          if (isFutureDate) {
            return this.loanService
              .getFutureLPICharges(loanId, transactionDate)
              .pipe(switchMap((futureLpi: any) => of({ penaltyTemplate, futureLpi })));
          }
          return of({ penaltyTemplate, futureLpi: null });
        })
      )
      .subscribe({
        next: ({ penaltyTemplate, futureLpi }: any) => {
          this.additionalFutureLpiAmount = Number(futureLpi?.totalLPIAmount || 0);
          this.applyPenaltyTemplateForDate(penaltyTemplate, this.additionalFutureLpiAmount);
          this.dueEmis = this.getDueEmisForDate(transactionDateValue);
          this.refreshSavingsBalanceAsOfDate(transactionDateValue);
          this.patchDefaultTransactionAmount();
          this.isTemplateLoading = false;
          this.validateTransactionAmount(true);
        },
        error: () => {
          this.additionalFutureLpiAmount = 0;
          this.isTemplateLoading = false;
          this.validateTransactionAmount(true);
        }
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
    const formatted = this.formatDate(parsed);
    this.backdateLimitMessage = `Earliest allowed date: ${formatted}. Cannot be before the loan's last recorded transaction.`;
  }

  private captureLinkedSavingsAccount(source: any): void {
    const additional = source?.additionalAttributes;
    if (!additional) {
      return;
    }
    this.linkedSavingsAccountId = additional.linkedSavingsAccountId;
    this.linkedSavingsAccountAccountNo = additional.linkedSavingsAccountAccountNo;
    this.linkedSavingsAccountProductName = additional.linkedSavingsAccountProductName;
    this.linkedSavingsAccountAvailableBalance = Number(additional.linkedSavingsAccountAvailableBalance || 0);
    this.availableBalanceAsOfDate = this.linkedSavingsAccountAvailableBalance;
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

  private refreshSavingsBalanceAsOfDate(transactionDateValue: Date = this.transferForm?.value?.transactionDate): void {
    this.availableBalanceAsOfDate = computeSavingsBalanceAsOf(
      this.savingsTransactions,
      this.toComparableDate(transactionDateValue),
      (value) => this.toComparableDate(value),
      this.linkedSavingsAccountAvailableBalance
    );
  }

  /** Captures full-loan outstanding from the loan API — never from the client accounts list row. */
  private applyLoanSummary(loanDetails: any): void {
    this.loanSummary = loanDetails?.summary || null;
    const fromSummary = Number(this.loanSummary?.totalOutstanding || 0);
    const fromListBalance = Number(this.data.loan?.loanBalance || 0);
    this.fullLoanOutstanding = this.roundAmount(fromSummary || fromListBalance || 0);
    // Keep summary on the dialog loan object so fee/tax helpers can read it.
    if (this.loanSummary) {
      this.data.loan.summary = this.loanSummary;
    }
  }

  private applyPenaltyTemplateForDate(penaltyTemplate: any, additionalPenalty = 0): void {
    this.onInstallmentDueDate = !!penaltyTemplate?.onInstallmentDueDate;
    // Amount due = EMIs on or before the selected date. Overnight LPI posted after a due date is
    // already excluded from penaltyAmountDue. Remaining principal is only for the close amount.
    this.principalOutstanding = Number(penaltyTemplate?.principalOutstanding || 0) || this.baselinePrincipalOutstanding;
    this.remainingPrincipalOutstanding =
      Number(penaltyTemplate?.remainingPrincipalOutstanding || 0) ||
      Number(this.loanSummary?.principalOutstanding || 0) ||
      this.baselineRemainingPrincipalOutstanding ||
      this.principalOutstanding;
    this.interestOutstanding = Number(penaltyTemplate?.interestOutstanding || 0) || this.baselineInterestOutstanding;
    this.feeOutstanding = Number(
      this.loanSummary?.feeChargesOutstanding ||
        this.data.loan?.summary?.feeChargesOutstanding ||
        this.repaymentTemplateData?.feeChargesPortion ||
        0
    );
    this.taxOutstanding = Number(this.repaymentTemplateData?.taxChargesPortion || 0);

    const templatePenalty = Number(penaltyTemplate?.penaltyAmountDue || 0) + additionalPenalty;
    const dueWithoutPenalty = this.roundAmount(
      this.principalOutstanding + this.interestOutstanding + this.feeOutstanding + this.taxOutstanding
    );
    this.penaltyOutstanding = reconcilePenaltyWithLedger({
      penaltyFromTemplate: templatePenalty,
      penaltyInSummary: this.penaltyInSummary,
      fullLoanOutstanding: this.fullLoanOutstanding,
      dueWithoutPenaltyReconcile: dueWithoutPenalty,
      isBusinessDate: isSameCalendarDate(
        this.transferForm?.value?.transactionDate,
        this.settingsService.businessDate,
        (value) => this.toComparableDate(value)
      ),
      onInstallmentDueDate: this.onInstallmentDueDate,
      hasRealEmiDueOnDate: isRealEmiDueOnDate(
        this.data.loan?.repaymentSchedule?.periods,
        this.transferForm?.value?.transactionDate,
        (value) => this.toComparableDate(value)
      )
    });
  }

  /** True when entered amount covers outstanding as of the selected date (after LPI waiver). */
  willCloseLoan(amount: number): boolean {
    return this.outstandingAfterWaiver > 0.01 && this.roundAmount(amount) + 0.01 >= this.outstandingAfterWaiver;
  }

  private buildExcessRefundSentence(excess: number): string {
    return `Excess ${this.currencySymbol} ${this.formatAmount(excess)} refunded to linked savings on closure.`;
  }

  private buildClosureRefundNotice(amount: number): string | null {
    if (!this.willCloseLoan(amount)) {
      return null;
    }
    const excess = this.roundAmount(amount - this.outstandingAfterWaiver);
    if (excess > 0.01) {
      return `Closes loan · refund ${this.currencySymbol} ${this.formatAmount(excess)} to linked savings`;
    }
    return `Closes loan at ${this.currencySymbol} ${this.formatAmount(this.outstandingAfterWaiver)}`;
  }

  private simulateSettlementAllocation(
    amount: number,
    transactionDateValue: Date
  ): { penalty: number; fee: number; tax: number; interest: number; principal: number; unallocated: number } {
    return allocateSettlement(
      amount,
      {
        penalty: this.penaltyOutstanding,
        fee: this.feeOutstanding,
        tax: this.taxOutstanding,
        interest: this.interestOutstanding,
        principal: this.remainingPrincipalOutstanding
      },
      this.getOutstandingInstallmentBuckets(transactionDateValue)
    );
  }

  private getOutstandingInstallmentBuckets(
    transactionDateValue: Date
  ): Array<{ period: number; penalty: number; fee: number; tax: number; interest: number; principal: number }> {
    const periods = this.data.loan?.repaymentSchedule?.periods;
    if (!Array.isArray(periods)) {
      return [];
    }

    const selected = this.toComparableDate(transactionDateValue);
    if (!selected) {
      return [];
    }

    return periods
      .filter((period: any) => this.isRealOutstandingInstallment(period))
      .filter((period: any) => {
        const dueDate = this.toComparableDate(period.dueDate);
        return dueDate && dueDate.getTime() <= selected.getTime();
      })
      .map((period: any) => ({
        period: Number(period.period),
        penalty: this.getPeriodComponentOutstanding(period, 'penalty'),
        fee: this.getPeriodComponentOutstanding(period, 'fee'),
        tax: this.getPeriodComponentOutstanding(period, 'tax'),
        interest: this.getPeriodComponentOutstanding(period, 'interest'),
        principal: this.getPeriodComponentOutstanding(period, 'principal')
      }))
      .filter((bucket) => bucket.penalty + bucket.fee + bucket.tax + bucket.interest + bucket.principal > 0.01)
      .sort((a, b) => a.period - b.period);
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
      return this.roundAmount(explicit);
    }
    const due = Number(period?.[dueField] ?? 0);
    const paid = Number(period?.[paidField] ?? 0);
    return this.roundAmount(Math.max(due - paid, 0));
  }

  private patchDefaultTransactionAmount(): void {
    this.settlementPreviewMode = 'date';
    const componentTotal = this.roundAmount(
      this.principalOutstanding +
        this.interestOutstanding +
        this.feeOutstanding +
        this.penaltyOutstanding +
        this.taxOutstanding
    );
    if (componentTotal > 0) {
      this.transferForm.patchValue({ transactionAmount: componentTotal }, { emitEvent: false });
      return;
    }
    const emiTotal = this.roundAmount(this.dueEmis.reduce((sum: number, emi: any) => sum + Number(emi.amount || 0), 0));
    this.transferForm.patchValue({ transactionAmount: emiTotal || '' }, { emitEvent: false });
  }

  private getDueEmisForDate(transactionDateValue: Date): any[] {
    const periods = this.data.loan?.repaymentSchedule?.periods;
    if (!Array.isArray(periods)) {
      return [];
    }

    const selected = this.toComparableDate(transactionDateValue);
    if (!selected) {
      return [];
    }

    let remainingPenalty = this.penaltyOutstanding;
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
        remainingPenalty = this.roundAmount(remainingPenalty - penalty);
        const amount = this.roundAmount(
          this.getPeriodComponentOutstanding(period, 'principal') +
            this.getPeriodComponentOutstanding(period, 'interest') +
            this.getPeriodComponentOutstanding(period, 'fee') +
            this.getPeriodComponentOutstanding(period, 'tax') +
            penalty
        );
        return {
          period: period.period,
          dueDate: period.dueDate,
          amount,
          state: dueDate && dueDate.getTime() < selected.getTime() ? 'overdue' : 'due'
        };
      })
      .filter((emi: any) => emi.amount > 0);
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
    return Math.max(this.roundAmount(due - paid), 0);
  }

  /** Remaining principal + interest/fees/tax/LPI still due as of the selected date (full settlement). */
  get totalOutstanding(): number {
    return this.dueAsOfDateTotal;
  }

  get dueAsOfDateTotal(): number {
    return this.roundAmount(
      this.principalOutstanding +
        this.interestOutstanding +
        this.penaltyOutstanding +
        this.feeOutstanding +
        this.taxOutstanding
    );
  }

  /** Business-date label — the "as of today" reference for the full posted loan balance. */
  get businessDateLabel(): string {
    return this.formatDate(this.settingsService.businessDate);
  }

  /**
   * How much more the loan's full posted balance (fullLoanOutstanding, the number shown on the
   * client/account-list page) is than the amount due as of the selected date. When positive, it is
   * late-payment interest already posted to the ledger but not yet in the settlement "due" window —
   * this reconciles the account-list "Outstanding Balance" with the amount pre-filled here.
   */
  get fullOutstandingVsDueDelta(): number {
    return this.roundAmount(this.fullLoanOutstanding - this.dueAsOfDateTotal);
  }

  /** Full-period interest on the ledger minus pro-rated interest due on the selected date. */
  get unearnedInterest(): number {
    return computeUnearnedInterest(
      Number(this.loanSummary?.interestOutstanding ?? this.data.loan?.summary?.interestOutstanding ?? 0),
      this.interestOutstanding
    );
  }

  /** Ledger reconciliation line — LPI gap only, not unearned interest when paying before due date. */
  get settlementLedgerDelta(): number {
    const delta = this.fullOutstandingVsDueDelta;
    if (delta <= 0.01) {
      return 0;
    }
    if (this.unearnedInterest > 0.01 && this.penaltyOutstanding <= 0.01) {
      return 0;
    }
    return Math.max(this.roundAmount(delta - this.unearnedInterest), 0);
  }

  /** Penalty currently on the loan summary (as of today) — used to compute what backdating will waive. */
  get penaltyInSummary(): number {
    return Number(
      this.loanSummary?.penaltyChargesOutstanding ??
        this.data.loan?.summary?.penaltyChargesOutstanding ??
        this.baselinePenaltyOutstanding
    );
  }

  get penaltyWaivedByBackdate(): number {
    return computePenaltyWaivedByBackdate(this.penaltyInSummary, this.penaltyOutstanding);
  }

  /**
   * Amount that actually closes the loan as of the selected date: remaining principal + interest
   * due that day + fees + tax + LPI still due. Does not include future EMI interest.
   */
  get outstandingAfterWaiver(): number {
    return computeSettlementRequired({
      principal: this.remainingPrincipalOutstanding,
      interest: this.interestOutstanding,
      fee: this.feeOutstanding,
      tax: this.taxOutstanding,
      penalty: this.penaltyOutstanding
    });
  }

  get settlementLines(): SettlementSummaryLine[] {
    return [
      { label: 'Principal', amount: this.principalOutstanding },
      { label: 'Interest', amount: this.interestOutstanding },
      { label: 'Fees', amount: this.feeOutstanding },
      { label: 'LPI', amount: this.penaltyOutstanding },
      { label: 'Tax', amount: this.taxOutstanding }
    ].filter((line) => line.amount > 0.01);
  }

  get settlementClosesLoan(): boolean {
    return this.outstandingAfterWaiver <= this.dueAsOfDateTotal + 0.01;
  }

  get summaryFootnotes(): Array<string | SettlementSummaryFootnote> {
    const notes: Array<string | SettlementSummaryFootnote> = [];
    if (this.unearnedInterest > 0.01) {
      notes.push({
        text: `Unearned interest: −${this.currencySymbol} ${this.formatAmount(this.unearnedInterest)}`,
        tone: 'negative'
      });
    } else {
      const interestSaved = this.roundAmount(this.baselineInterestOutstanding - this.interestOutstanding);
      if (interestSaved > 0.01) {
        notes.push({
          text: `Unearned interest: −${this.currencySymbol} ${this.formatAmount(interestSaved)}`,
          tone: 'negative'
        });
      }
    }
    if (this.isFutureDateSelected && this.additionalFutureLpiAmount > 0.01) {
      notes.push(
        `+${this.currencySymbol} ${this.formatAmount(this.additionalFutureLpiAmount)} projected LPI (preview)`
      );
    }
    if (this.outstandingAfterWaiver > this.dueAsOfDateTotal + 0.01) {
      notes.push(`To close: ${this.currencySymbol} ${this.formatAmount(this.outstandingAfterWaiver)}`);
    }

    return notes;
  }

  get enteredTransactionAmount(): number {
    return Number(this.transferForm?.get('transactionAmount')?.value || 0);
  }

  get canUseManualPreview(): boolean {
    return (
      this.enteredTransactionAmount > 0.01 && Math.abs(this.enteredTransactionAmount - this.dueAsOfDateTotal) > 0.01
    );
  }

  get isManualSettlementPreview(): boolean {
    return this.settlementPreviewMode === 'manual' && this.canUseManualPreview;
  }

  get displaySettlementEyebrow(): string | null {
    return this.isManualSettlementPreview ? 'Payment allocation (entered amount)' : null;
  }

  get displaySettlementTotal(): number {
    return this.isManualSettlementPreview ? this.enteredTransactionAmount : this.dueAsOfDateTotal;
  }

  get displaySettlementLines(): SettlementSummaryLine[] {
    return this.isManualSettlementPreview ? this.paymentAllocationLines : this.settlementLines;
  }

  get displaySettlementSubtitle(): string | null {
    if (this.isManualSettlementPreview) {
      return this.paymentAllocationSubtitle;
    }
    return null;
  }

  get displaySettlementFootnotes(): Array<string | SettlementSummaryFootnote> {
    return this.isManualSettlementPreview ? this.paymentAllocationFootnotes : this.summaryFootnotes;
  }

  get displaySettlementClosesLoan(): boolean {
    return this.isManualSettlementPreview ? this.paymentClosesLoan : this.settlementClosesLoan;
  }

  get displayLedgerToday(): number {
    return this.isManualSettlementPreview ? 0 : this.fullLoanOutstanding;
  }

  get displayLedgerDelta(): number {
    return this.isManualSettlementPreview ? 0 : this.settlementLedgerDelta;
  }

  get paymentAllocationLines(): SettlementSummaryLine[] {
    const allocation = this.currentSettlementAllocation;
    return [
      { label: 'LPI', amount: allocation.penalty },
      { label: 'Fees', amount: allocation.fee },
      { label: 'Tax', amount: allocation.tax },
      { label: 'Interest', amount: allocation.interest },
      { label: 'Principal', amount: allocation.principal }
    ].filter((line) => line.amount > 0.01);
  }

  get paymentAllocationSubtitle(): string | null {
    const amount = this.enteredTransactionAmount;
    if (this.willCloseLoan(amount)) {
      return this.buildClosureRefundNotice(amount);
    }
    return 'Partial payment — loan stays active';
  }

  get paymentAllocationFootnotes(): string[] {
    const notes: string[] = [];
    const amount = this.enteredTransactionAmount;
    const allocation = this.currentSettlementAllocation;

    if (!this.willCloseLoan(amount) && this.outstandingAfterWaiver > 0.01) {
      const remaining = this.roundAmount(this.outstandingAfterWaiver - amount);
      if (remaining > 0.01) {
        notes.push(`Remaining ~${this.currencySymbol} ${this.formatAmount(remaining)} after submit`);
      }
    }
    if (allocation.unallocated > 0.01) {
      notes.push(this.buildExcessRefundSentence(allocation.unallocated));
    } else if (this.overpaymentWarning) {
      notes.push(this.overpaymentWarning);
    }
    return notes;
  }

  get paymentClosesLoan(): boolean {
    return this.willCloseLoan(this.enteredTransactionAmount);
  }

  /** Hide EMI pills when they only repeat the settlement total. */
  get showDueEmiPills(): boolean {
    if (this.dueEmis.length === 0) {
      return false;
    }
    if (this.dueEmis.length === 1) {
      return Math.abs(Number(this.dueEmis[0].amount || 0) - this.dueAsOfDateTotal) > 0.01;
    }
    return true;
  }

  private get currentSettlementAllocation(): {
    penalty: number;
    fee: number;
    tax: number;
    interest: number;
    principal: number;
    unallocated: number;
  } {
    const amount = Number(this.transferForm?.get('transactionAmount')?.value || 0);
    if (!amount || !this.transferForm) {
      return { penalty: 0, fee: 0, tax: 0, interest: 0, principal: 0, unallocated: 0 };
    }
    return this.simulateSettlementAllocation(amount, this.transferForm.value.transactionDate);
  }

  /** Full remaining outstanding as of the selected date — used for closure / overpayment. */
  get effectiveSettlementOutstanding(): number {
    return this.outstandingAfterWaiver > 0.01 ? this.outstandingAfterWaiver : this.dueAsOfDateTotal;
  }

  get selectedTransactionDateLabel(): string {
    const value = this.transferForm?.value?.transactionDate;
    return value ? this.formatDate(value) : '';
  }

  /**
   * True when the selected transaction date is after the business date. Preview-only: amounts reflect what
   * would be owed on that date (with LPI accrued until then), but a transfer cannot be recorded in the future.
   */
  get isFutureDateSelected(): boolean {
    const selected = this.toComparableDate(this.transferForm?.value?.transactionDate);
    const business = this.toComparableDate(this.settingsService.businessDate);
    return !!(selected && business && selected.getTime() > business.getTime());
  }

  /** Explains why Submit is disabled so closure banners never look actionable when they are not. */
  get submitBlockedReason(): string | null {
    if (this.isLoading) {
      return 'Submitting transfer…';
    }
    if (this.isTemplateLoading) {
      return 'Loading settlement details…';
    }
    if (this.isFutureDateSelected) {
      return null;
    }
    if (!this.linkedSavingsAccountId) {
      return 'No linked savings account is available for this loan — transfer cannot be submitted.';
    }
    if (!this.transferTemplate) {
      return 'Transfer template is still loading or failed — Submit stays disabled until it is ready.';
    }
    if (this.backdateBlockedMessage) {
      return 'Backdated settlement is not allowed for this loan product — change the transaction date to today.';
    }
    if (this.transferForm.get('note')?.invalid) {
      return 'Enter a Note before submitting.';
    }
    if (this.transferForm.get('transactionAmount')?.invalid || this.transferForm.get('transactionDate')?.invalid) {
      return 'Correct the highlighted fields before submitting.';
    }
    if (this.transferForm.invalid) {
      return 'Complete all required fields before submitting.';
    }
    return null;
  }

  get amountErrorMessage(): string {
    const control = this.transferForm.get('transactionAmount');
    if (control?.hasError('positiveAmount')) {
      return 'Transaction Amount must be greater than 0';
    }
    if (control?.hasError('availableBalanceExceeded')) {
      return `Amount exceeds Available Balance as of the selected date (${this.currencySymbol} ${this.formatAmount(
        this.availableBalanceAsOfDate
      )})`;
    }
    return '';
  }

  /**
   * @param showFieldErrors when true, marks the amount control touched/dirty so mat-error is visible
   * immediately after a programmatic amount update (e.g. transaction date change) without requiring
   * the operator to click into the field first.
   */
  private validateTransactionAmount(showFieldErrors = false): void {
    const control = this.transferForm.get('transactionAmount');
    if (!control) {
      return;
    }
    const currentErrors = { ...(control.errors || {}) };
    delete currentErrors.positiveAmount;
    delete currentErrors.availableBalanceExceeded;
    delete currentErrors.totalOutstandingExceeded;

    const amount = Number(control.value || 0);
    if (!amount || amount <= 0) {
      currentErrors.positiveAmount = true;
      this.overpaymentWarning = null;
      this.closureRefundNotice = null;
    } else if (amount > this.availableBalanceAsOfDate) {
      currentErrors.availableBalanceExceeded = true;
      this.overpaymentWarning = null;
      this.closureRefundNotice = null;
    } else if (this.outstandingAfterWaiver > 0 && amount > this.outstandingAfterWaiver) {
      const excess = this.roundAmount(amount - this.outstandingAfterWaiver);
      this.overpaymentWarning = `Overpayment by ${this.currencySymbol} ${this.formatAmount(excess)}`;
      this.closureRefundNotice = this.buildClosureRefundNotice(amount);
      // Intentionally NOT adding totalOutstandingExceeded to errors — overpayment is allowed but warned.
    } else {
      this.overpaymentWarning = null;
      this.closureRefundNotice = this.buildClosureRefundNotice(amount);
    }

    control.setErrors(Object.keys(currentErrors).length ? currentErrors : null);

    if (showFieldErrors) {
      control.markAsDirty();
      control.markAsTouched();
    }
  }

  submit(): void {
    this.submitErrorMessage = null;
    this.validateTransactionAmount(true);
    if (
      this.transferForm.invalid ||
      this.isLoading ||
      !this.transferTemplate ||
      !this.linkedSavingsAccountId ||
      this.backdateBlockedMessage ||
      this.isFutureDateSelected
    ) {
      return;
    }

    this.isLoading = true;
    const dateFormat = this.settingsService.dateFormat;
    const payload = {
      fromOfficeId: this.transferTemplate.fromOffice?.id,
      fromClientId: this.transferTemplate.fromClient?.id,
      fromAccountType: 2,
      fromAccountId: this.linkedSavingsAccountId,
      toOfficeId: this.transferTemplate.toOffice?.id,
      toClientId: this.transferTemplate.toClient?.id,
      toAccountType: 1,
      toAccountId: this.data.loan.id,
      transferDate: this.formatDate(this.transferForm.value.transactionDate),
      transferAmount: String(Number(this.transferForm.value.transactionAmount)),
      transferDescription: String(this.transferForm.value.note || '').trim(),
      dateFormat,
      locale: this.settingsService.language.code
    };

    this.accountTransfersService
      .createAccountTransfer(payload)
      .pipe(
        timeout(120000),
        catchError((err: any) => {
          if (err instanceof TimeoutError) {
            return throwError(() => ({
              error: {
                defaultUserMessage:
                  'Transfer request timed out after 2 minutes. Check loan/savings transactions before retrying — the transfer may still have posted.'
              }
            }));
          }
          return throwError(() => err);
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: (response: any) => {
          this.notifyBackdatedLpiWaived(response?.changes);
          this.dialogRef.close({ submitted: true });
        },
        error: (err: any) => {
          this.submitErrorMessage =
            err?.error?.errors?.[0]?.defaultUserMessage ||
            err?.error?.defaultUserMessage ||
            err?.message ||
            'Account transfer failed. Please try again.';
          this.alertService.alert({
            type: 'Transfer failed',
            message: this.submitErrorMessage
          });
        }
      });
  }

  /**
   * When a backdated settlement auto-waives the LPI accrued for the in-between days, the backend returns the
   * summary in `changes`. Surface it to the operator so the waiver is visible (it is also fully audited on the
   * loan with proper waive transactions and journal entries).
   */
  private notifyBackdatedLpiWaived(changes: any): void {
    const chargesWaived = Number(changes?.chargesWaived || 0);
    if (!chargesWaived) {
      return;
    }
    const amount = this.roundAmount(Number(changes?.totalAmountWaived || 0));
    const days = Number(changes?.daysCovered || 0);
    const dayText = days === 1 ? '1 day' : `${days} days`;
    this.alertService.alert({
      type: 'Backdated Settlement',
      message:
        `Backdated settlement: ${this.currencySymbol} ${this.formatAmount(amount)} of late-payment interest ` +
        `(${chargesWaived} charge(s) over ${dayText}) was automatically waived and recorded on the loan.`
    });
  }

  private formatDate(value: any): string {
    return this.dateUtils.formatDate(value, this.settingsService.dateFormat);
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

  formatAmount(value: number): string {
    return this.roundAmount(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  private roundAmount(value: number): number {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  private notBlankValidator(control: AbstractControl): ValidationErrors | null {
    return String(control.value || '').trim() ? null : { required: true };
  }
}
