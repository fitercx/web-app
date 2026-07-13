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
  minDate = new Date(2000, 0, 1);
  maxDate: Date;
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
    if (this.transferForm.invalid || this.isLoading || !this.transferTemplate || !this.linkedSavingsAccountId) {
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
