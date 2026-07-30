import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UntypedFormControl } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import { MatDialog } from '@angular/material/dialog';
import { SettingsService } from 'app/settings/settings.service';
import { ConfirmationDialogComponent } from 'app/shared/confirmation-dialog/confirmation-dialog.component';
import { LoanUndoTransactionDialogComponent } from '../custom-dialogs/loan-undo-transaction-dialog/loan-undo-transaction-dialog.component';
import { TranslateService } from '@ngx-translate/core';
import { LoanTransaction } from 'app/products/loan-products/models/loan-account.model';
import { LoanTransactionType } from 'app/loans/models/loan-transaction-type.model';

@Component({
  selector: 'mifosx-transactions-tab',
  templateUrl: './transactions-tab.component.html',
  styleUrls: ['./transactions-tab.component.scss']
})
export class TransactionsTabComponent implements OnInit {
  /** Loan Details Data */
  transactionsData: LoanTransaction[] = [];
  /** True once transactions were loaded with includeReversed=true */
  private reversedTransactionsLoaded = false;
  /** Form control to handle accural parameter */
  hideAccrualsParam: UntypedFormControl;
  showReversedParam: UntypedFormControl;
  /** Stores the status of the loan account */
  status: string;
  /** Columns to be displayed in original schedule table. */
  displayedColumns: string[] = [
    'row',
    'id',
    'office',
    'externalId',
    'date',
    'submittedOnDate',
    'transactionType',
    'amount',
    'principal',
    'interest',
    'fee',
    'penalties',
    'taxes',
    'loanBalance',
    'actions'
  ];
  displayedHeader1Columns: string[] = [
    'h1-row',
    'h1-id',
    'h1-office',
    'h1-external-id',
    'h1-transaction-date',
    'h1-submitted-date',
    'h1-transaction-type',
    'h1-space',
    'h1-breakdown',
    'h1-loan-balance',
    'h1-actions'
  ];
  displayedHeader2Columns: string[] = [
    'h2-space',
    'h2-amount',
    'h2-principal',
    'h2-interest',
    'h2-fees',
    'h2-penalties',
    'h2-taxes',
    'h2-action'
  ];

  dataSource: MatTableDataSource<any>;
  @ViewChild(MatPaginator, { static: true }) paginator: MatPaginator;
  @ViewChild(MatSort, { static: true }) sort: MatSort;

  loanId: number;
  /**
   * Retrieves the loans with associations data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   */
  constructor(
    private route: ActivatedRoute,
    private dateUtils: Dates,
    private router: Router,
    private dialog: MatDialog,
    private loansService: LoansService,
    private translateService: TranslateService,
    private settingsService: SettingsService
  ) {
    this.loanId = this.route.parent.parent.snapshot.params['loanId'];
    this.route.parent.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.transactionsData = data.loanDetailsData.transactions || [];
      this.status = data.loanDetailsData.status.value;
      this.reversedTransactionsLoaded = false;
      this.applyTransactionFilters();
    });
  }

  ngOnInit() {
    this.hideAccrualsParam = new UntypedFormControl(true);
    this.showReversedParam = new UntypedFormControl(false);
    this.applyTransactionFilters();
  }

  setLoanTransactions() {
    this.transactionsData.forEach((element: any) => {
      element.date = this.dateUtils.parseDate(element.date);
    });
    this.dataSource = new MatTableDataSource(this.transactionsData);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * Checks Status of the loan account
   */
  checkStatus() {
    if (
      this.status === 'Active' ||
      this.status === 'Closed (obligations met)' ||
      this.status === 'Overpaid' ||
      this.status === 'Closed (rescheduled)' ||
      this.status === 'Closed (written off)'
    ) {
      return true;
    }
    return false;
  }

  hideAccruals() {
    this.applyTransactionFilters();
  }

  showReversed(showReversed: boolean) {
    if (showReversed && !this.reversedTransactionsLoaded) {
      this.loansService.getLoanTransactions(String(this.loanId), true).subscribe((response: any) => {
        this.transactionsData = response.transactions || [];
        this.reversedTransactionsLoaded = true;
        this.applyTransactionFilters();
      });
      return;
    }
    this.applyTransactionFilters();
  }

  applyTransactionFilters(): void {
    if (!this.showReversedParam || !this.hideAccrualsParam) {
      return;
    }
    this.filterTransactions(!this.showReversedParam.value, this.hideAccrualsParam.value);
  }

  filterTransactions(hideReversed: boolean, hideAccrual: boolean): void {
    let transactions: LoanTransaction[] = this.transactionsData;

    if (hideAccrual || hideReversed) {
      transactions = this.transactionsData.filter((t: LoanTransaction) => {
        const isReversed = this.isTransactionReversed(t);
        return !(hideReversed && isReversed) && !(hideAccrual && t.type.accrual);
      });
    }
    this.dataSource = new MatTableDataSource(transactions);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(filterValue: string = '') {
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  removeItem(arr: any, item: any) {
    return arr.filter((f: any) => f !== item);
  }

  /**
   * Show Transactions Details
   * @param transactionsData Transactions Data
   * DISBURSEMENT:1
   * REPAYMENT:2
   * WAIVE_INTEREST:4
   * WAIVE_CHARGES:9
   * ACCRUAL:10
   * REFUND:16
   * CHARGE_PAYMENT:17
   * REFUND_FOR_ACTIVE_LOAN:18
   * INCOME_POSTING: 19
   * CREDIT_BALANCE_REFUND:20
   * MERCHANT_ISSUED_REFUND:21
   * PAYOUT_REFUND:22
   * GOODWILL_CREDIT:23
   * CHARGE_REFUND:24
   * CHARGEBACK:25
   * CHARGE_ADJUSTMENT:26
   * CHARGE_OFF:27
   * DOWN_PAYMENT:28
   * REAGE:29
   * REAMORTIZE:30
   * INTEREST REFUND:33
   */
  showTransactions(transactionsData: LoanTransaction) {
    if ([
        1,
        2,
        4,
        9,
        20,
        21,
        22,
        23,
        26,
        28,
        29,
        30,
        31,
        33
      ].includes(transactionsData.type.id)) {
      this.router.navigate([transactionsData.id], { relativeTo: this.route });
    }
  }

  allowUndoTransaction(transaction: LoanTransaction) {
    if (transaction.manuallyReversed) {
      return false;
    }
    return !(
      transaction.type.disbursement ||
      transaction.type.chargeoff ||
      this.isReAgoeOrReAmortize(transaction.type) ||
      transaction.type.interestRefund
    );
  }

  loanTransactionColor(transaction: LoanTransaction): string {
    // Strike through any transaction that has been reversed (manual undo or system reversal)
    if (this.isTransactionReversed(transaction)) {
      return 'strike';
    }
    if (transaction.transactionRelations && transaction.transactionRelations.length > 0) {
      return 'linked';
    }
    if (this.isAccrual(transaction.type)) {
      return 'accrual';
    }
    if (this.isChargeOff(transaction.type)) {
      return 'chargeoff';
    }
    if (this.isDownPayment(transaction.type)) {
      return 'down-payment';
    }
    if (this.isReAge(transaction.type)) {
      return 'reage';
    }
    if (this.isReAmortize(transaction.type)) {
      return 'reamortize';
    }
    return '';
  }

  /**
   * Stops the propagation to view pages.
   * @param $event Mouse Event
   */
  routeEdit($event: MouseEvent) {
    $event.stopPropagation();
  }

  /**
   * Stops the propagation to view pages.
   * @param $event Mouse Event
   */
  undoTransaction(transaction: LoanTransaction, $event: MouseEvent) {
    $event.stopPropagation();
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const loanId = this.route.parent.parent.snapshot.params['loanId'];
    let command = 'undo';
    let operationDate = this.dateUtils.parseDate(transaction.date);
    let payload: any = {};
    if (this.isChargeOff(transaction.type)) {
      command = 'undo-charge-off';
      operationDate = this.settingsService.businessDate;
      payload = {};
    } else {
      payload = {
        transactionDate: this.dateUtils.formatDate(operationDate && new Date(operationDate), dateFormat),
        transactionAmount: 0,
        dateFormat,
        locale
      };
    }

    const undoTransactionAccountDialogRef = this.dialog.open(LoanUndoTransactionDialogComponent, {
      data: { hasLaterTransactions: this.hasNonReversedActivityAfter(transaction) }
    });
    undoTransactionAccountDialogRef.afterClosed().subscribe((response: { confirm: any; comment?: string }) => {
      if (response && response.confirm) {
        const comment = (response.comment || '').trim();
        if (!comment) {
          return;
        }
        // Build payload with required comment
        if (this.isChargeOff(transaction.type)) {
          payload = { comment };
        } else {
          payload = {
            transactionDate: this.dateUtils.formatDate(operationDate && new Date(operationDate), dateFormat),
            transactionAmount: 0,
            dateFormat,
            locale,
            comment
          };
        }
        let transactionId = transaction.id;
        if (this.isChargeOff(transaction.type)) {
          transactionId = null;
        }
        this.loansService
          .executeLoansAccountTransactionsCommand(loanId, command, payload, transactionId)
          .subscribe((responseCmd: any) => {
            transaction.manuallyReversed = true;
            this.reload();
          });
      }
    });
  }

  undoReAgeOrReAmortize(transaction: LoanTransaction): void {
    const actionName = transaction.type.reAmortize ? 'Re-Amortize' : 'Re-Age';
    const undoTransactionAccountDialogRef = this.dialog.open(LoanUndoTransactionDialogComponent);
    undoTransactionAccountDialogRef.afterClosed().subscribe((response: { confirm: any; comment?: string }) => {
      if (response && response.confirm) {
        const comment = (response.comment || '').trim();
        if (!comment) {
          return;
        }
        const undoCommand = actionName === 'Re-Age' ? 'undoReAge' : 'undoReAmortize';
        this.loansService
          .executeLoansAccountTransactionsCommand(String(this.loanId), undoCommand, { comment })
          .subscribe(() => {
            this.reload();
          });
      }
    });
  }

  private isAccrual(transactionType: LoanTransactionType): boolean {
    return transactionType.accrual || transactionType.code === 'loanTransactionType.overdueCharge';
  }

  private isChargeOff(transactionType: LoanTransactionType): boolean {
    return transactionType.chargeoff || transactionType.code === 'loanTransactionType.chargeOff';
  }

  private isDownPayment(transactionType: LoanTransactionType): boolean {
    return transactionType.downPayment || transactionType.code === 'loanTransactionType.downPayment';
  }

  private isReAge(transactionType: LoanTransactionType): boolean {
    return transactionType.reAge || transactionType.code === 'loanTransactionType.reAge';
  }

  private isReAmortize(transactionType: LoanTransactionType): boolean {
    return transactionType.reAmortize || transactionType.code === 'loanTransactionType.reAmortize';
  }

  private isReAgoeOrReAmortize(transactionType: LoanTransactionType): boolean {
    return this.isReAmortize(transactionType) || this.isReAge(transactionType);
  }

  /**
   * Returns true when the backend has reversed this transaction.
   * `manuallyReversed` / `manually_adjusted_or_reversed` marks a reprocess guard on active repayments.
   */
  private isTransactionReversed(transaction: LoanTransaction): boolean {
    return !!transaction.reversed;
  }

  /**
   * True when this loan has other real (non-reversed, non-disbursement, non-accrual) transactions with
   * a higher id than `transaction` - i.e. posted chronologically after it. Undoing a transaction that
   * isn't the most recent one triggers a full reprocess of everything after it, which can reallocate
   * later repayments/waivers differently than they were originally applied - see
   * UI_AUDIT_FINDINGS.md. Used to warn the operator before they confirm, rather than blocking outright
   * (there are legitimate cases for undoing a mid-history transaction, e.g. correcting a data-entry
   * error), since core Fineract's own reprocessing already keeps the ledger internally consistent.
   */
  private hasNonReversedActivityAfter(transaction: LoanTransaction): boolean {
    return (this.transactionsData || []).some(
      (other) =>
        other.id > transaction.id &&
        !this.isTransactionReversed(other) &&
        !(other.type && (other.type.disbursement || other.type.accrual))
    );
  }

  viewJournalEntry(transactionType: LoanTransactionType): boolean {
    return !(this.isReAmortize(transactionType) || this.isReAge(transactionType));
  }

  private reload() {
    const clientId = this.route.parent.parent.snapshot.params['clientId'];
    const url: string = this.router.url;
    this.router
      .navigateByUrl(`/clients/${clientId}/loans-accounts`, { skipLocationChange: true })
      .then(() => this.router.navigate([url]));
  }

  displaySubMenu(transaction: LoanTransaction): boolean {
    if (this.isReAgoeOrReAmortize(transaction.type) && transaction.manuallyReversed) {
      return false;
    }
    return true;
  }
}
