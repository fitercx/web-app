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
  computeAuthoritativeSettlementCap,
  computePenaltyWaivedByBackdate,
  computeSavingsBalanceAsOf,
  computeScheduleCloseCap,
  computeLpiOnlyPeriodOutstanding,
  computeSettlementRequired,
  computeUnearnedInterest,
  formatLpiWaivedAfterDateMessage,
  reconcileAsOfDateAmounts,
  applyEmiAmountCoverage
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
   * Visible notice when the entered amount fully settles the loan as of the selected date.
   */
  closureRefundNotice: string | null = null;
  /** From /template/penalties — true when value date equals a real EMI due date. */
  private onInstallmentDueDate = false;

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
      repaymentTemplate: this.loanService.getLoanRepaymentTemplate(loanId, transactionDate),
      penaltyTemplate: this.loanService.getLoanPenaltiesTemplate(loanId, transactionDate),
      // Client general-tab loan rows have no summary — always load authoritative outstanding here.
      loanDetails: this.loanService.getLoanAccountResource(loanId, 'summary,repaymentSchedule,linkedAccount')
    })
      .pipe(
        switchMap((templates: any) => {
          this.currency = templates.repaymentTemplate?.currency;
          this.currencySymbol = this.currency?.displaySymbol || this.currency?.code || '';
          this.repaymentTemplateData = templates.repaymentTemplate;
          this.captureLinkedSavingsFromLoanDetails(templates.loanDetails);
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
          this.data.loan.repaymentSchedule =
            templates.loanDetails?.repaymentSchedule || this.data.loan.repaymentSchedule;
          this.applyPenaltyTemplateForDate(templates.penaltyTemplate, 0, templates.repaymentTemplate, false);
          this.applyEarliestAllowedDate(templates.penaltyTemplate?.earliestAllowedTransactionDate);
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
    forkJoin({
      penaltyTemplate: this.loanService.getLoanPenaltiesTemplate(loanId, transactionDate),
      repaymentTemplate: this.loanService.getLoanRepaymentTemplate(loanId, transactionDate)
    })
      .pipe(
        switchMap(({ penaltyTemplate, repaymentTemplate }: any) => {
          this.repaymentTemplateData = repaymentTemplate;
          if (isFutureDate) {
            return this.loanService
              .getFutureLPICharges(loanId, transactionDate)
              .pipe(switchMap((futureLpi: any) => of({ penaltyTemplate, repaymentTemplate, futureLpi })));
          }
          return of({ penaltyTemplate, repaymentTemplate, futureLpi: null });
        })
      )
      .subscribe({
        next: ({ penaltyTemplate, futureLpi, repaymentTemplate }: any) => {
          this.additionalFutureLpiAmount = Number(futureLpi?.totalLPIAmount || 0);
          this.applyPenaltyTemplateForDate(
            penaltyTemplate,
            this.additionalFutureLpiAmount,
            repaymentTemplate,
            isBackdated
          );
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
    this.backdateLimitMessage = 'You cannot backdate a payment by more than 30 days in the past.';
    if (!earliestAllowedTransactionDate) {
      return;
    }
    const parsed = this.dateUtils.parseDate(earliestAllowedTransactionDate);
    if (!parsed) {
      return;
    }
    this.minDate = parsed;
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

  private applyPenaltyTemplateForDate(
    penaltyTemplate: any,
    additionalPenalty = 0,
    repaymentTemplate: any = this.repaymentTemplateData,
    isBackdated = this.isSelectedDateBackdated()
  ): void {
    this.onInstallmentDueDate = !!penaltyTemplate?.onInstallmentDueDate;
    const reconciled = reconcileAsOfDateAmounts({
      penaltyTemplate,
      repaymentTemplate,
      loanSummary: this.loanSummary,
      feeFallback: Number(
        this.loanSummary?.feeChargesOutstanding ||
          this.data.loan?.summary?.feeChargesOutstanding ||
          this.repaymentTemplateData?.feeChargesPortion ||
          0
      ),
      taxFallback: Number(this.repaymentTemplateData?.taxChargesPortion || 0),
      isBackdated,
      isBusinessDate: this.isSelectedDateBusinessDate(),
      additionalPenalty,
      lpiOnlyScheduleOutstanding: this.isSelectedDateBusinessDate()
        ? computeLpiOnlyPeriodOutstanding(this.data.loan?.repaymentSchedule?.periods)
        : 0
    });

    this.principalOutstanding = reconciled.principal;
    this.remainingPrincipalOutstanding = reconciled.remainingPrincipal;
    this.interestOutstanding = reconciled.interest;
    this.feeOutstanding = reconciled.fee;
    this.taxOutstanding = reconciled.tax;
    this.penaltyOutstanding = reconciled.penalty;
    const penaltyDue = this.roundAmount(Number(penaltyTemplate?.penaltyAmountDue || 0) + additionalPenalty);
    if (!this.onInstallmentDueDate && penaltyDue > this.penaltyOutstanding + 0.01) {
      this.penaltyOutstanding = penaltyDue;
    }
    this.suggestedTransactionAmount = this.roundAmount(
      this.principalOutstanding +
        this.interestOutstanding +
        this.feeOutstanding +
        this.taxOutstanding +
        this.penaltyOutstanding
    );
  }

  /** Pre-filled amount from reconciled as-of-date figures (see applyPenaltyTemplateForDate). */
  private suggestedTransactionAmount = 0;

  private isSelectedDateBackdated(): boolean {
    const selected = this.toComparableDate(this.transferForm?.value?.transactionDate);
    const business = this.toComparableDate(this.settingsService.businessDate);
    return !!(selected && business && selected.getTime() < business.getTime());
  }

  private isSelectedDateBusinessDate(): boolean {
    const selected = this.toComparableDate(this.transferForm?.value?.transactionDate);
    const business = this.toComparableDate(this.settingsService.businessDate);
    return !!(selected && business && selected.getTime() === business.getTime());
  }

  /** True when entered amount covers outstanding the backend can absorb without Overpaid. */
  willCloseLoan(amount: number): boolean {
    const cap = this.repaymentCapWithoutOverpay;
    return cap > 0.01 && this.roundAmount(amount) + 0.01 >= cap;
  }

  private buildClosureRefundNotice(amount: number): string | null {
    if (!this.willCloseLoan(amount)) {
      return null;
    }
    const cap = this.repaymentCapWithoutOverpay;
    const excess = this.roundAmount(amount - cap);
    if (excess > 0.01) {
      return `Closes loan · refund ${this.currencySymbol} ${this.formatAmount(excess)} to linked savings`;
    }
    return `Closes loan at ${this.currencySymbol} ${this.formatAmount(cap)}`;
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
    const suggested = this.capEnteredAmount(this.dueAsOfDateTotal);
    if (suggested > 0) {
      this.transferForm.patchValue({ transactionAmount: suggested }, { emitEvent: false });
      return;
    }
    const componentTotal = this.roundAmount(
      this.principalOutstanding +
        this.interestOutstanding +
        this.feeOutstanding +
        this.penaltyOutstanding +
        this.taxOutstanding
    );
    if (componentTotal > 0) {
      this.transferForm.patchValue({ transactionAmount: this.capEnteredAmount(componentTotal) }, { emitEvent: false });
      return;
    }
    const emiTotal = this.roundAmount(
      this.dueEmis
        .filter((emi: any) => emi.state !== 'upcoming')
        .reduce((sum: number, emi: any) => sum + Number(emi.amount || 0), 0)
    );
    this.transferForm.patchValue({ transactionAmount: this.capEnteredAmount(emiTotal) || '' }, { emitEvent: false });
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

    return periods
      .filter((period: any) => this.isRealOutstandingInstallment(period))
      .sort((a: any, b: any) => Number(a.period) - Number(b.period))
      .map((period: any) => {
        const dueDate = this.toComparableDate(period.dueDate);
        const amount = this.roundAmount(
          this.getPeriodComponentOutstanding(period, 'principal') +
            this.getPeriodComponentOutstanding(period, 'interest') +
            this.getPeriodComponentOutstanding(period, 'fee') +
            this.getPeriodComponentOutstanding(period, 'tax')
        );
        let state: 'overdue' | 'due' | 'upcoming' = 'upcoming';
        if (dueDate && dueDate.getTime() < selected.getTime()) {
          state = 'overdue';
        } else if (dueDate && dueDate.getTime() === selected.getTime()) {
          state = 'due';
        }
        return {
          period: period.period,
          dueDate: period.dueDate,
          amount,
          state
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

  /** Maximum repayment that will not move the loan to Overpaid (full loan as of the selected date). */
  get repaymentCapWithoutOverpay(): number {
    return computeAuthoritativeSettlementCap({
      outstandingAfterWaiver: this.outstandingAfterWaiver,
      fullLoanOutstanding: this.fullLoanOutstanding,
      scheduleCloseCap: computeScheduleCloseCap(this.data.loan?.repaymentSchedule?.periods)
    });
  }

  /** UI-only cap for the entered amount — outstanding close cap (overpayment is not allowed here). */
  private capEnteredAmount(amount: number): number {
    const cap = this.repaymentCapWithoutOverpay;
    if (cap > 0.01 && amount > cap + 0.01) {
      return cap;
    }
    return this.roundAmount(amount);
  }

  get settlementLines(): SettlementSummaryLine[] {
    return [
      { label: 'Principal', amount: this.principalOutstanding },
      { label: 'Interest', amount: this.interestOutstanding },
      { label: 'LPI', amount: this.penaltyOutstanding },
      { label: 'Fees', amount: this.feeOutstanding },
      { label: 'Tax', amount: this.taxOutstanding }
    ].filter((line) => line.amount > 0.01);
  }

  get settlementClosesLoan(): boolean {
    return this.outstandingAfterWaiver <= this.dueAsOfDateTotal + 0.01;
  }

  get summaryFootnotes(): Array<string | SettlementSummaryFootnote> {
    const notes: Array<string | SettlementSummaryFootnote> = [];
    if (this.isFutureDateSelected && this.additionalFutureLpiAmount > 0.01) {
      notes.push(
        `+${this.currencySymbol} ${this.formatAmount(this.additionalFutureLpiAmount)} projected LPI (preview)`
      );
    }
    if (this.penaltyWaivedByBackdate > 0.01) {
      const selectedDateLabel = this.selectedTransactionDateShortLabel;
      if (selectedDateLabel) {
        notes.push(
          formatLpiWaivedAfterDateMessage(
            this.currencySymbol,
            this.formatAmount(this.penaltyWaivedByBackdate),
            selectedDateLabel
          )
        );
      }
    }

    return notes;
  }

  get enteredTransactionAmount(): number {
    return Number(this.transferForm?.get('transactionAmount')?.value || 0);
  }

  /** Show waterfall of the typed amount when it differs from due-as-of-date (no extra toggle). */
  get isEnteredAmountPreview(): boolean {
    return (
      this.enteredTransactionAmount > 0.01 && Math.abs(this.enteredTransactionAmount - this.dueAsOfDateTotal) > 0.01
    );
  }

  get displaySettlementEyebrow(): string | null {
    return this.isEnteredAmountPreview ? 'Payment allocation (entered amount)' : null;
  }

  get displaySettlementTotal(): number {
    return this.isEnteredAmountPreview ? this.enteredTransactionAmount : this.dueAsOfDateTotal;
  }

  get displaySettlementLines(): SettlementSummaryLine[] {
    return this.isEnteredAmountPreview ? this.paymentAllocationLines : this.settlementLines;
  }

  get displaySettlementSubtitle(): string | null {
    if (!this.isEnteredAmountPreview || this.enteredAmountExceedsCap) {
      return null;
    }
    if (this.willCloseLoan(this.enteredTransactionAmount)) {
      return this.buildClosureRefundNotice(this.enteredTransactionAmount);
    }
    return 'Partial payment — loan stays active';
  }

  get displaySettlementFootnotes(): Array<string | SettlementSummaryFootnote> {
    if (!this.isEnteredAmountPreview) {
      return this.summaryFootnotes;
    }
    const notes: Array<string | SettlementSummaryFootnote> = [...this.summaryFootnotes];
    if (this.enteredAmountExceedsCap) {
      return notes;
    }
    const remaining = this.roundAmount(this.repaymentCapWithoutOverpay - this.enteredTransactionAmount);
    if (!this.willCloseLoan(this.enteredTransactionAmount) && remaining > 0.01) {
      notes.push(`Remaining ~${this.currencySymbol} ${this.formatAmount(remaining)} after submit`);
    }
    return notes;
  }

  get enteredAmountExceedsCap(): boolean {
    const cap = this.repaymentCapWithoutOverpay;
    return cap > 0.01 && this.enteredTransactionAmount > cap + 0.01;
  }

  get displaySettlementClosesLoan(): boolean {
    if (this.enteredAmountExceedsCap) {
      return false;
    }
    return this.isEnteredAmountPreview ? this.paymentClosesLoan : this.settlementClosesLoan;
  }

  get paymentAllocationLines(): SettlementSummaryLine[] {
    const allocation = this.currentSettlementAllocation;
    return [
      { label: 'Principal', amount: allocation.principal },
      { label: 'Interest', amount: allocation.interest },
      { label: 'LPI', amount: allocation.penalty },
      { label: 'Fees', amount: allocation.fee },
      { label: 'Tax', amount: allocation.tax }
    ].filter((line) => line.amount > 0.01);
  }

  get displayLedgerToday(): number {
    return 0;
  }

  get displayLedgerDelta(): number {
    return 0;
  }

  get paymentClosesLoan(): boolean {
    return this.willCloseLoan(this.enteredTransactionAmount);
  }

  /** Remaining outstanding EMIs covered (or partially covered) by the entered amount. */
  get displayEmis(): any[] {
    return applyEmiAmountCoverage(
      this.dueEmis,
      this.enteredTransactionAmount,
      this.paymentClosesLoan,
      this.currentSettlementAllocation.penalty
    ).filter((emi) => emi.coverage !== 'uncovered');
  }

  /** EMI chips for remaining installments (amounts exclude LPI). */
  get showDueEmiPills(): boolean {
    return this.displayEmis.length > 0;
  }

  emiCoverageLabel(coverage: string): string {
    if (coverage === 'covered') {
      return 'Covered by this amount';
    }
    if (coverage === 'partial') {
      return 'Partially covered by this amount';
    }
    return 'Not covered by this amount';
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

  /** Selected transaction date as dd-MMM (e.g. 18-Aug) for waived-LPI copy. */
  get selectedTransactionDateShortLabel(): string {
    const value = this.transferForm?.value?.transactionDate;
    return value ? this.dateUtils.formatDate(value, 'dd-MMM') : '';
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
    if (control?.hasError('totalOutstandingExceeded')) {
      return `Maximum ${this.currencySymbol} ${this.formatAmount(this.repaymentCapWithoutOverpay)} — overpayment is not allowed`;
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
      this.closureRefundNotice = null;
    } else if (amount > this.availableBalanceAsOfDate) {
      currentErrors.availableBalanceExceeded = true;
      this.closureRefundNotice = null;
    } else if (this.repaymentCapWithoutOverpay > 0.01 && amount > this.repaymentCapWithoutOverpay + 0.01) {
      currentErrors.totalOutstandingExceeded = true;
      this.closureRefundNotice = null;
      showFieldErrors = true;
    } else {
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
      transferAmount: String(this.capEnteredAmount(Number(this.transferForm.value.transactionAmount))),
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
