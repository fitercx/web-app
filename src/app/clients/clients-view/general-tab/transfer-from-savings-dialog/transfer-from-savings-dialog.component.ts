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
  principalOutstanding = 0;
  interestOutstanding = 0;
  feeOutstanding = 0;
  penaltyOutstanding = 0;
  taxOutstanding = 0;
  dueEmis: any[] = [];
  transferTemplate: any;
  isLoading = false;
  isTemplateLoading = false;

  /** Baseline interest/penalty due (business date), captured once the initial template loads. */
  private baselineInterestOutstanding = 0;
  private baselinePenaltyOutstanding = 0;
  /**
   * Clear, user-facing messages describing how the currently selected transaction date affects
   * interest and charges, compared to the amounts due on today's business date. Populated only
   * after the operator actually changes the date.
   */
  dateImpactMessages: string[] = [];
  /**
   * Set when the selected (backdated) transaction date is not allowed for this loan's product
   * configuration - mirrors the server-side validateBackdatedRepaymentAllowed guard so the operator
   * is told proactively, before submitting, rather than only after a rejected API call.
   */
  backdateBlockedMessage: string | null = null;

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
    this.transferForm.get('transactionAmount')?.valueChanges.subscribe(() => this.validateTransactionAmount());
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
        '',
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
      loanDetails: this.loanService.getLoanGeneralTabExpandData(loanId)
    })
      .pipe(
        switchMap((templates: any) => {
          this.currency = templates.repaymentTemplate?.currency || templates.foreclosureTemplate?.currency;
          this.currencySymbol = this.currency?.displaySymbol || this.currency?.code || '';
          this.captureLinkedSavingsAccount(templates.foreclosureTemplate);
          this.applyOutstandingTemplate(templates.penaltyTemplate, templates.repaymentTemplate);
          this.applyEarliestAllowedDate(templates.penaltyTemplate?.earliestAllowedTransactionDate);
          this.baselineInterestOutstanding = this.interestOutstanding;
          this.baselinePenaltyOutstanding = this.penaltyOutstanding;
          this.data.loan.repaymentSchedule =
            templates.loanDetails?.repaymentSchedule || this.data.loan.repaymentSchedule;
          this.dueEmis = this.getDueEmisForDate(this.transferForm.value.transactionDate);
          this.patchDefaultTransactionAmount();

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
          this.validateTransactionAmount();
        },
        error: () => {
          this.isTemplateLoading = false;
          this.validateTransactionAmount();
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
          this.applyOutstandingTemplate(penaltyTemplate, null, Number(futureLpi?.totalLPIAmount || 0));
          this.dateImpactMessages = this.buildDateImpactMessages(transactionDate);
          this.dueEmis = this.getDueEmisForDate(transactionDateValue);
          this.patchDefaultTransactionAmount();
          this.isTemplateLoading = false;
          this.validateTransactionAmount();
        },
        error: () => {
          this.isTemplateLoading = false;
          this.validateTransactionAmount();
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

  private applyOutstandingTemplate(penaltyTemplate: any, repaymentTemplate?: any, additionalPenalty = 0): void {
    this.principalOutstanding = Number(penaltyTemplate?.principalOutstanding || 0);
    this.interestOutstanding = Number(penaltyTemplate?.interestOutstanding || 0);
    this.feeOutstanding = Number(repaymentTemplate?.feeChargesPortion ?? this.feeOutstanding ?? 0);
    this.penaltyOutstanding = Number(penaltyTemplate?.penaltyAmountDue || 0) + additionalPenalty;
    this.taxOutstanding = Number(repaymentTemplate?.taxChargesPortion ?? this.taxOutstanding ?? 0);
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
    const defaultAmount = this.roundAmount(
      this.dueEmis.reduce((sum: number, emi: any) => sum + Number(emi.amount || 0), 0)
    );
    this.transferForm.patchValue({ transactionAmount: defaultAmount || '' }, { emitEvent: false });
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

  get totalOutstanding(): number {
    return this.roundAmount(
      this.principalOutstanding +
        this.interestOutstanding +
        this.penaltyOutstanding +
        this.feeOutstanding +
        this.taxOutstanding
    );
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
    if (control?.hasError('totalOutstandingExceeded')) {
      return 'Amount exceeds total outstanding — consider Foreclosure';
    }
    return '';
  }

  private validateTransactionAmount(): void {
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
    } else if (amount > this.linkedSavingsAccountAvailableBalance) {
      currentErrors.availableBalanceExceeded = true;
    } else if (this.totalOutstanding > 0 && amount > this.totalOutstanding) {
      currentErrors.totalOutstandingExceeded = true;
    }

    control.setErrors(Object.keys(currentErrors).length ? currentErrors : null);
  }

  submit(): void {
    this.validateTransactionAmount();
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
