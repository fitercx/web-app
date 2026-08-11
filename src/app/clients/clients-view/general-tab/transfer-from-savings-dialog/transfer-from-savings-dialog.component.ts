import { Component, Inject, OnInit } from '@angular/core';
import { AbstractControl, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AccountTransfersService } from 'app/account-transfers/account-transfers.service';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { AlertService } from 'app/core/alert/alert.service';

@Component({
  selector: 'mifosx-transfer-from-savings-dialog',
  templateUrl: './transfer-from-savings-dialog.component.html',
  styleUrls: ['./transfer-from-savings-dialog.component.scss']
})
export class TransferFromSavingsDialogComponent implements OnInit {
  transferForm: UntypedFormGroup;
  /**
   * Minimum Date allowed — backend-computed per loan: MAX_BACKDATE_DAYS (30) before the business date, or the
   * loan's disbursement date if that is later (see BackdatedRepaymentValidator#computeEarliestAllowedTransactionDate
   * on the server). Replaced with the real value once the initial template loads (see loadInitialTemplate), so the
   * calendar never lets an operator pick a date the server would reject.
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
  /**
   * Component amounts due as of the selected transaction date (from /template/penalties + schedule).
   * These are NOT the full loan outstanding — see fullLoanOutstanding.
   */
  principalOutstanding = 0;
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

  /** Baseline amounts from the initial penalties template (business date) for date-change deltas. */
  private baselinePrincipalOutstanding = 0;
  private baselineInterestOutstanding = 0;
  private baselinePenaltyOutstanding = 0;
  private repaymentTemplateData: any;
  /** Full loan summary loaded from the loan API (not the client accounts list row). */
  private loanSummary: any;
  /**
   * Clear, user-facing messages describing how the currently selected transaction date affects
   * interest and charges, compared to the amounts due on today's business date. Populated only
   * after the operator actually changes the date.
   */
  dateImpactMessages: string[] = [];
  /** Shown when pending LPI is due on the selected date and will be paid with this settlement. */
  lpiPaymentMessage: string | null = null;
  /**
   * Set when the selected (backdated) transaction date is not allowed for this loan's product
   * configuration - mirrors the server-side validateBackdatedRepaymentAllowed guard so the operator
   * is told proactively, before submitting, rather than only after a rejected API call.
   */
  backdateBlockedMessage: string | null = null;
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

  constructor(
    private formBuilder: UntypedFormBuilder,
    private loanService: LoansService,
    private accountTransfersService: AccountTransfersService,
    private dateUtils: Dates,
    private settingsService: SettingsService,
    private alertService: AlertService,
    private dialogRef: MatDialogRef<TransferFromSavingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { loan: any; clientId: any }
  ) {}

  ngOnInit(): void {
    const businessDate = this.settingsService.businessDate;
    this.maxDate = new Date(businessDate);
    this.maxDate.setFullYear(this.maxDate.getFullYear() + 1);
    this.createForm();
    this.loadInitialTemplate();
    this.transferForm.get('transactionDate')?.valueChanges.subscribe((value: Date) => {
      if (value) {
        this.recomputeForTransactionDate(value);
      }
    });
    this.transferForm.get('transactionAmount')?.valueChanges.subscribe(() => {
      this.validateTransactionAmount();
      this.updateLpiPaymentMessage(this.formatDate(this.transferForm.value.transactionDate));
    });
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
          // Due-as-of-date baselines from penalty template (installment-level — NOT full loan).
          this.baselinePrincipalOutstanding = Number(templates.penaltyTemplate?.principalOutstanding || 0);
          this.baselineInterestOutstanding = Number(templates.penaltyTemplate?.interestOutstanding || 0);
          this.baselinePenaltyOutstanding = Number(templates.penaltyTemplate?.penaltyAmountDue || 0);
          this.applyPenaltyTemplateForDate(templates.penaltyTemplate, 0);
          this.applyEarliestAllowedDate(templates.penaltyTemplate?.earliestAllowedTransactionDate);
          this.data.loan.repaymentSchedule =
            templates.loanDetails?.repaymentSchedule || this.data.loan.repaymentSchedule;
          this.dueEmis = this.getDueEmisForDate(this.transferForm.value.transactionDate);
          this.dateImpactMessages = this.buildDateImpactMessages(
            this.formatDate(this.transferForm.value.transactionDate)
          );
          this.patchDefaultTransactionAmount();
          this.updateLpiPaymentMessage(this.formatDate(this.transferForm.value.transactionDate));
          this.validateTransactionAmount(true);

          if (!this.linkedSavingsAccountId) {
            return of(null);
          }
          return this.accountTransfersService.newAccountTranferResource(this.linkedSavingsAccountId, '2', {
            toAccountType: 1,
            toAccountId: this.data.loan.id
          });
        })
      )
      .subscribe({
        next: (transferTemplate: any) => {
          this.transferTemplate = transferTemplate;
          this.isTemplateLoading = false;
          this.validateTransactionAmount(true);
        },
        error: () => {
          this.isTemplateLoading = false;
          this.validateTransactionAmount(true);
        }
      });
  }

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
          this.applyPenaltyTemplateForDate(penaltyTemplate, Number(futureLpi?.totalLPIAmount || 0));
          this.dateImpactMessages = this.buildDateImpactMessages(transactionDate);
          this.dueEmis = this.getDueEmisForDate(transactionDateValue);
          this.patchDefaultTransactionAmount();
          this.updateLpiPaymentMessage(transactionDate);
          this.isTemplateLoading = false;
          this.validateTransactionAmount(true);
        },
        error: () => {
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
    this.backdateLimitMessage =
      `This settlement can be backdated no earlier than ${formatted} (30 days before today, or this loan's ` +
      `disbursement date if later) — this protects the repayment schedule and balances from being distorted by ` +
      `very old backdated entries.`;
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
    // /template/penalties returns installment-due principal/interest for the selected date — use for
    // "due as of date" display only. Closure / overpayment must use fullLoanOutstanding.
    this.principalOutstanding = Number(penaltyTemplate?.principalOutstanding || 0) || this.baselinePrincipalOutstanding;
    this.interestOutstanding = Number(penaltyTemplate?.interestOutstanding || 0) || this.baselineInterestOutstanding;
    this.penaltyOutstanding = Number(penaltyTemplate?.penaltyAmountDue || 0) + additionalPenalty;
    this.feeOutstanding = Number(
      this.loanSummary?.feeChargesOutstanding ||
        this.data.loan?.summary?.feeChargesOutstanding ||
        this.repaymentTemplateData?.feeChargesPortion ||
        0
    );
    this.taxOutstanding = Number(this.repaymentTemplateData?.taxChargesPortion || 0);
  }

  private updateLpiPaymentMessage(transactionDate: string): void {
    this.lpiPaymentMessage = this.buildNormalSettlementPreviewMessage(transactionDate);
  }

  /**
   * Estimates how the entered amount will be split across penalty, fees, tax, interest, and principal
   * using the same per-installment waterfall as Fineract-style / pro-rata strategies:
   * penalty → fee → tax → interest → principal (oldest due installment first).
   */
  private buildNormalSettlementPreviewMessage(transactionDate: string): string | null {
    const amount = Number(this.transferForm?.get('transactionAmount')?.value || 0);
    if (this.fullLoanOutstanding <= 0.01 && this.dueAsOfDateTotal <= 0.01) {
      return null;
    }
    if (!amount || amount <= 0) {
      return 'Enter an amount to see how it will be applied to late payment interest, fees, interest, and principal before submitting.';
    }

    const allocation = this.simulateSettlementAllocation(amount, this.transferForm.value.transactionDate);
    const parts: string[] = [];

    if (allocation.penalty > 0.01) {
      parts.push(`${this.currencySymbol} ${this.formatAmount(allocation.penalty)} to late payment interest (LPI)`);
    }
    if (allocation.fee > 0.01) {
      parts.push(`${this.currencySymbol} ${this.formatAmount(allocation.fee)} to fees`);
    }
    if (allocation.tax > 0.01) {
      parts.push(`${this.currencySymbol} ${this.formatAmount(allocation.tax)} to tax`);
    }
    if (allocation.interest > 0.01) {
      parts.push(`${this.currencySymbol} ${this.formatAmount(allocation.interest)} to interest`);
    }
    if (allocation.principal > 0.01) {
      parts.push(`${this.currencySymbol} ${this.formatAmount(allocation.principal)} to principal`);
    }

    const lines = [
      `Of the entered amount (${this.currencySymbol} ${this.formatAmount(amount)}), ` +
        (parts.length
          ? `${parts.join(', ')} will be applied with this settlement (as at ${transactionDate}).`
          : `no outstanding balance remains to allocate (as at ${transactionDate}).`)
    ];

    if (allocation.unallocated > 0.01) {
      lines.push(this.buildExcessRefundSentence(allocation.unallocated));
    } else if (this.willCloseLoan(amount)) {
      lines.push(
        `This payment covers the full outstanding of ${this.currencySymbol} ${this.formatAmount(this.fullLoanOutstanding)} ` +
          `and will close the loan (obligations met).`
      );
    } else if (this.dueAsOfDateTotal > 0.01 && this.roundAmount(amount) + 0.01 >= this.dueAsOfDateTotal) {
      const remaining = this.roundAmount(this.fullLoanOutstanding - amount);
      lines.push(
        `This payment settles the amount due as of ${transactionDate}. The loan will remain Active with approximately ` +
          `${this.currencySymbol} ${this.formatAmount(Math.max(remaining, 0))} still outstanding.`
      );
    } else if (this.fullLoanOutstanding > 0.01 && this.roundAmount(amount) + 0.01 < this.fullLoanOutstanding) {
      const remaining = this.roundAmount(this.fullLoanOutstanding - amount);
      lines.push(
        `This is a partial payment. The loan will remain Active with approximately ` +
          `${this.currencySymbol} ${this.formatAmount(Math.max(remaining, 0))} still outstanding after submit.`
      );
    }

    return lines.join(' ');
  }

  /** True only when entered amount covers the full loan outstanding (authoritative summary). */
  private willCloseLoan(amount: number): boolean {
    return this.fullLoanOutstanding > 0.01 && this.roundAmount(amount) + 0.01 >= this.fullLoanOutstanding;
  }

  /** Linked savings label used in closure / refund notices. */
  private linkedSavingsLabel(): string {
    if (this.linkedSavingsAccountAccountNo) {
      const product = this.linkedSavingsAccountProductName ? ` (${this.linkedSavingsAccountProductName})` : '';
      return `linked savings account ${this.linkedSavingsAccountAccountNo}${product}`;
    }
    return 'the linked savings account';
  }

  private buildExcessRefundSentence(excess: number): string {
    return (
      `Excess of ${this.currencySymbol} ${this.formatAmount(excess)} will be auto-refunded to ` +
      `${this.linkedSavingsLabel()} when the loan is closed.`
    );
  }

  private buildClosureRefundNotice(amount: number): string | null {
    if (!this.willCloseLoan(amount)) {
      return null;
    }
    const excess = this.roundAmount(amount - this.fullLoanOutstanding);
    if (excess > 0.01) {
      return (
        `This payment will close the loan. Amount to be refunded to ${this.linkedSavingsLabel()}: ` +
        `${this.currencySymbol} ${this.formatAmount(excess)}.`
      );
    }
    return (
      `This payment settles the full outstanding of ${this.currencySymbol} ${this.formatAmount(this.fullLoanOutstanding)} ` +
      `and will close the loan.`
    );
  }

  private simulateSettlementAllocation(
    amount: number,
    transactionDateValue: Date
  ): { penalty: number; fee: number; tax: number; interest: number; principal: number; unallocated: number } {
    const allocation = { penalty: 0, fee: 0, tax: 0, interest: 0, principal: 0, unallocated: 0 };
    let remaining = this.roundAmount(amount);
    if (remaining <= 0) {
      return allocation;
    }

    const buckets = this.getOutstandingInstallmentBuckets(transactionDateValue);
    const schedulePenalty = buckets.reduce((sum, bucket) => sum + bucket.penalty, 0);
    const scheduleFees = buckets.reduce((sum, bucket) => sum + bucket.fee, 0);
    const scheduleTax = buckets.reduce((sum, bucket) => sum + bucket.tax, 0);
    const scheduleInterest = buckets.reduce((sum, bucket) => sum + bucket.interest, 0);
    const schedulePrincipal = buckets.reduce((sum, bucket) => sum + bucket.principal, 0);

    const loanLevelPenalty = Math.max(this.roundAmount(this.penaltyOutstanding - schedulePenalty), 0);
    const loanLevelFee = Math.max(this.roundAmount(this.feeOutstanding - scheduleFees), 0);
    const loanLevelTax = Math.max(this.roundAmount(this.taxOutstanding - scheduleTax), 0);
    const loanLevelInterest = Math.max(this.roundAmount(this.interestOutstanding - scheduleInterest), 0);
    const loanLevelPrincipal = Math.max(this.roundAmount(this.principalOutstanding - schedulePrincipal), 0);

    if (buckets.length === 0) {
      remaining = this.applyWaterfallToTotals(remaining, allocation, {
        penalty: this.penaltyOutstanding,
        fee: this.feeOutstanding,
        tax: this.taxOutstanding,
        interest: this.interestOutstanding,
        principal: this.principalOutstanding
      });
      allocation.unallocated = remaining;
      return allocation;
    }

    if (loanLevelPenalty > 0) {
      remaining = this.applyComponentPortion(remaining, loanLevelPenalty, allocation, 'penalty');
    }

    for (const bucket of buckets) {
      if (remaining <= 0) {
        break;
      }
      remaining = this.applyComponentPortion(remaining, bucket.penalty, allocation, 'penalty');
      remaining = this.applyComponentPortion(remaining, bucket.fee, allocation, 'fee');
      remaining = this.applyComponentPortion(remaining, bucket.tax, allocation, 'tax');
      remaining = this.applyComponentPortion(remaining, bucket.interest, allocation, 'interest');
      remaining = this.applyComponentPortion(remaining, bucket.principal, allocation, 'principal');
    }

    if (loanLevelFee > 0) {
      remaining = this.applyComponentPortion(remaining, loanLevelFee, allocation, 'fee');
    }
    if (loanLevelTax > 0) {
      remaining = this.applyComponentPortion(remaining, loanLevelTax, allocation, 'tax');
    }
    if (loanLevelInterest > 0) {
      remaining = this.applyComponentPortion(remaining, loanLevelInterest, allocation, 'interest');
    }
    if (loanLevelPrincipal > 0) {
      remaining = this.applyComponentPortion(remaining, loanLevelPrincipal, allocation, 'principal');
    }

    allocation.unallocated = remaining;
    return allocation;
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

  private applyWaterfallToTotals(
    remaining: number,
    allocation: { penalty: number; fee: number; tax: number; interest: number; principal: number },
    totals: { penalty: number; fee: number; tax: number; interest: number; principal: number }
  ): number {
    remaining = this.applyComponentPortion(remaining, totals.penalty, allocation, 'penalty');
    remaining = this.applyComponentPortion(remaining, totals.fee, allocation, 'fee');
    remaining = this.applyComponentPortion(remaining, totals.tax, allocation, 'tax');
    remaining = this.applyComponentPortion(remaining, totals.interest, allocation, 'interest');
    remaining = this.applyComponentPortion(remaining, totals.principal, allocation, 'principal');
    return remaining;
  }

  private applyComponentPortion(
    remaining: number,
    outstanding: number,
    allocation: { penalty: number; fee: number; tax: number; interest: number; principal: number },
    key: 'penalty' | 'fee' | 'tax' | 'interest' | 'principal'
  ): number {
    if (remaining <= 0 || outstanding <= 0) {
      return remaining;
    }
    const applied = Math.min(remaining, this.roundAmount(outstanding));
    allocation[key] = this.roundAmount(allocation[key] + applied);
    return this.roundAmount(remaining - applied);
  }

  /**
   * Builds clear, plain-language messages explaining how the selected transaction date changes the
   * interest and penalty/LPI amounts due, compared to what would be due if settled on today's business date.
   */
  private buildDateImpactMessages(transactionDate: string): string[] {
    const messages: string[] = [];
    const round = (value: number) => Math.round(value * 100) / 100;
    const formattedDate = transactionDate;

    const interestDelta = round(this.baselineInterestOutstanding - this.interestOutstanding);
    if (interestDelta > 0.01) {
      messages.push(
        `Interest due is reduced by ${this.currencySymbol} ${this.formatAmount(interestDelta)} for settling on ` +
          `${formattedDate} instead of today, since this is before the installment's due date (early repayment discount).`
      );
    }

    const penaltyDelta = round(this.baselinePenaltyOutstanding - this.penaltyOutstanding);
    if (penaltyDelta > 0.01) {
      messages.push(
        `${this.currencySymbol} ${this.formatAmount(penaltyDelta)} of accrued penalty/late-payment charges will be ` +
          `waived by backdating this transfer to ${formattedDate}.`
      );
    } else if (penaltyDelta < -0.01) {
      messages.push(
        `Selecting a future date (${formattedDate}) adds ${this.currencySymbol} ${this.formatAmount(Math.abs(penaltyDelta))} ` +
          `of additional late-payment interest that will accrue between today and then.`
      );
    }

    return messages;
  }

  private patchDefaultTransactionAmount(): void {
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

    return periods
      .filter((period: any) => this.isRealOutstandingInstallment(period))
      .map((period: any) => {
        const dueDate = this.toComparableDate(period.dueDate);
        const amount = this.getPeriodOutstandingAmount(period);
        return {
          period: period.period,
          dueDate: period.dueDate,
          amount,
          state: dueDate && dueDate.getTime() < selected.getTime() ? 'overdue' : 'due'
        };
      })
      .filter((emi: any) => {
        const dueDate = this.toComparableDate(emi.dueDate);
        return dueDate && dueDate.getTime() <= selected.getTime() && emi.amount > 0;
      });
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

  /** Sum of due-as-of-date components (installment-level). Do not use for closure. */
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

  /** Full loan outstanding — used for closure / overpayment. */
  get effectiveSettlementOutstanding(): number {
    return this.fullLoanOutstanding > 0.01 ? this.fullLoanOutstanding : this.dueAsOfDateTotal;
  }

  /** Explains why Submit is disabled so closure banners never look actionable when they are not. */
  get submitBlockedReason(): string | null {
    if (this.isTemplateLoading) {
      return 'Loading settlement details…';
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
      return `Amount exceeds Available Balance (${this.currencySymbol} ${this.formatAmount(
        this.linkedSavingsAccountAvailableBalance
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
    } else if (amount > this.linkedSavingsAccountAvailableBalance) {
      currentErrors.availableBalanceExceeded = true;
      this.overpaymentWarning = null;
      this.closureRefundNotice = null;
    } else if (this.fullLoanOutstanding > 0 && amount > this.fullLoanOutstanding) {
      const excess = this.roundAmount(amount - this.fullLoanOutstanding);
      const waiveAmount = this.roundAmount(this.baselinePenaltyOutstanding - this.penaltyOutstanding);
      let msg =
        `The entered amount (${this.currencySymbol} ${this.formatAmount(amount)}) exceeds the full loan outstanding ` +
        `(${this.currencySymbol} ${this.formatAmount(this.fullLoanOutstanding)}) by ` +
        `${this.currencySymbol} ${this.formatAmount(excess)}. ` +
        `If submitted, the loan will close. ${this.buildExcessRefundSentence(excess)}`;
      if (waiveAmount > 0.01) {
        msg +=
          ` Note: ${this.currencySymbol} ${this.formatAmount(waiveAmount)} of late-payment interest will be ` +
          `waived by this backdated settlement — the recommended full-settlement amount is ` +
          `${this.currencySymbol} ${this.formatAmount(this.fullLoanOutstanding)}.`;
      }
      this.overpaymentWarning = msg;
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
    this.validateTransactionAmount(true);
    if (
      this.transferForm.invalid ||
      this.isLoading ||
      !this.transferTemplate ||
      !this.linkedSavingsAccountId ||
      this.backdateBlockedMessage
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

    this.accountTransfersService.createAccountTransfer(payload).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.notifyBackdatedLpiWaived(response?.changes);
        this.dialogRef.close({ submitted: true });
      },
      error: () => {
        this.isLoading = false;
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
