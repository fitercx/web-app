/** Angular Imports */
import { Component, OnInit, ViewChild } from '@angular/core';
import { UntypedFormControl } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { Dates } from 'app/core/utils/dates';
import {
  SavingsAccountTransaction,
  SavingsAccountTransactionType
} from 'app/savings/models/savings-account-transaction.model';
import { SavingsService } from 'app/savings/savings.service';
import { SettingsService } from 'app/settings/settings.service';
import { SavingsUndoTransactionDialogComponent } from '../custom-dialogs/savings-undo-transaction-dialog/savings-undo-transaction-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { sortTransactionsByLatest } from 'app/core/utils/transaction-chronology';

/**
 * Transactions Tab Component.
 */
@Component({
  selector: 'mifosx-transactions-tab',
  templateUrl: './transactions-tab.component.html',
  styleUrls: ['./transactions-tab.component.scss']
})
export class TransactionsTabComponent implements OnInit {
  /** Savings Account Status */
  status: any;
  /** Transactions Data */
  transactionsData: SavingsAccountTransaction[] = [];
  /** Form control to handle accural parameter */
  hideAccrualsParam: UntypedFormControl;
  hideReversedParam: UntypedFormControl;
  transactionTypeFilter: UntypedFormControl;
  transactionTypeOptions = [
    { value: 'ALL', label: 'All Types' },
    { value: 'DEPOSIT', label: 'Deposit' },
    { value: 'WITHDRAWAL', label: 'Withdrawal' },
    { value: 'WITHDRAWAL_DISBURSAL', label: 'Withdrawal - Disbursal' },
    { value: 'WITHDRAWAL_REFUND', label: 'Withdrawal - Refund' },
    { value: 'WITHDRAWAL_EMI_TRANSFER', label: 'Withdrawal - EMI Transfer' },
    { value: 'DEPOSIT_FORECLOSURE_REFUND', label: 'Deposit - Foreclosure Refund' },
    { value: 'CHARGE_REVERSAL', label: 'Charge Reversal' }
  ];
  /** Columns to be displayed in transactions table. */
  displayedColumns: string[] = [
    'row',
    'id',
    'date',
    'submittedOnDate',
    'externalId',
    'transactionType',
    'debit',
    'credit',
    'balance',
    'actions'
  ];
  /** Data source for transactions table. */
  dataSource: MatTableDataSource<any>;
  @ViewChild(MatPaginator, { static: true }) paginator: MatPaginator;
  @ViewChild(MatSort, { static: true }) sort: MatSort;

  accountWithTransactions = false;

  accountId: string;

  /**
   * Retrieves savings account data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   */
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private savingsService: SavingsService,
    private settingsService: SettingsService,
    private dialog: MatDialog,
    private dateUtils: Dates
  ) {
    this.route.parent.parent.data.subscribe((data: { savingsAccountData: any }) => {
      this.transactionsData = data.savingsAccountData.transactions;
      this.status = data.savingsAccountData.status.value;
    });
    this.accountId = this.route.parent.parent.snapshot.params['savingAccountId'];
  }

  ngOnInit() {
    this.hideAccrualsParam = new UntypedFormControl(false);
    this.hideReversedParam = new UntypedFormControl(false);
    this.transactionTypeFilter = new UntypedFormControl('ALL');
    this.setTransactions();
    this.loadTransactionSubTypes();
  }

  setTransactions(): void {
    this.dataSource = new MatTableDataSource(sortTransactionsByLatest(this.transactionsData));
    this.accountWithTransactions = this.transactionsData && this.transactionsData.length > 0;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  loadTransactionSubTypes(): void {
    this.savingsService.getSavingsTransactionSubTypes(this.accountId).subscribe({
      next: (transactionSubTypes: { [key: string]: any }) => {
        this.transactionsData = this.transactionsData.map((transaction: SavingsAccountTransaction) => ({
          ...transaction,
          transactionSubType: transactionSubTypes[transaction.id] || transaction.transactionSubType
        }));
        this.filterTransactions(
          this.hideReversedParam.value,
          this.hideAccrualsParam.value,
          this.transactionTypeFilter.value
        );
      },
      error: () => {
        this.setTransactions();
      }
    });
  }

  /**
   * Checks if transaction is debit.
   * @param {any} transactionType Transaction Type
   */
  isDebit(transactionType: SavingsAccountTransactionType) {
    return (
      transactionType.withdrawal === true ||
      transactionType.feeDeduction === true ||
      transactionType.overdraftInterest === true ||
      transactionType.withholdTax === true ||
      transactionType.payTax === true
    );
  }

  isAccrual(transactionType: SavingsAccountTransactionType): boolean {
    return transactionType.accrual || transactionType.code === 'savingsAccountTransactionType.accrual';
  }

  /**
   * Checks transaction status.
   */
  checkStatus() {
    if (
      this.status === 'Active' ||
      this.status === 'Closed' ||
      this.status === 'Transfer in progress' ||
      this.status === 'Transfer on hold' ||
      this.status === 'Premature Closed' ||
      this.status === 'Matured'
    ) {
      return true;
    }
    return false;
  }

  /**
   * Show Transactions Details
   * @param transactionsData Transactions Data
   */
  showTransactions(transactionsData: SavingsAccountTransaction) {
    if (transactionsData.transfer) {
      this.router.navigate([`../transfer-funds/account-transfers/${transactionsData.transfer.id}`], {
        relativeTo: this.route
      });
    } else {
      this.router.navigate(
        [
          transactionsData.id,
          'general'
        ],
        { relativeTo: this.route }
      );
    }
  }

  /**
   * Stops the propagation to view pages.
   * @param $event Mouse Event
   */
  routeEdit($event: MouseEvent) {
    $event.stopPropagation();
  }

  hideAccruals() {
    this.filterTransactions(
      this.hideReversedParam.value,
      !this.hideAccrualsParam.value,
      this.transactionTypeFilter.value
    );
  }

  hideReversed() {
    this.filterTransactions(
      !this.hideReversedParam.value,
      this.hideAccrualsParam.value,
      this.transactionTypeFilter.value
    );
  }

  filterTransactionType() {
    this.filterTransactions(
      this.hideReversedParam.value,
      this.hideAccrualsParam.value,
      this.transactionTypeFilter.value
    );
  }

  filterTransactions(hideReversed: boolean, hideAccrual: boolean, transactionTypeFilter: string = 'ALL'): void {
    let transactions: SavingsAccountTransaction[] = this.transactionsData;

    transactions = this.transactionsData.filter((t: SavingsAccountTransaction) => {
      return (
        !(hideReversed && t.reversed) &&
        !(hideAccrual && t.transactionType.accrual) &&
        this.matchesTransactionTypeFilter(t, transactionTypeFilter)
      );
    });
    this.dataSource = new MatTableDataSource(sortTransactionsByLatest(transactions));
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  matchesTransactionTypeFilter(transaction: SavingsAccountTransaction, transactionTypeFilter: string): boolean {
    if (!transactionTypeFilter || transactionTypeFilter === 'ALL') {
      return true;
    }

    const parentType = this.transactionTypeCode(transaction);
    const subType = this.transactionSubTypeCode(transaction);
    if (transactionTypeFilter === 'WITHDRAWAL_DISBURSAL') {
      return parentType === 'WITHDRAWAL' && subType === 'DISBURSAL';
    }
    if (transactionTypeFilter === 'WITHDRAWAL_REFUND') {
      return parentType === 'WITHDRAWAL' && subType === 'REFUND';
    }
    if (transactionTypeFilter === 'WITHDRAWAL_EMI_TRANSFER') {
      return parentType === 'WITHDRAWAL' && subType === 'EMI_TRANSFER';
    }
    if (transactionTypeFilter === 'DEPOSIT_FORECLOSURE_REFUND') {
      return parentType === 'DEPOSIT' && subType === 'FORECLOSURE_REFUND';
    }
    return parentType === transactionTypeFilter;
  }

  transactionTypeLabel(transaction: SavingsAccountTransaction): string {
    const parent = transaction.transactionType.value;
    const subType = transaction.transactionSubType;
    return subType ? `${parent} - ${subType.displayName}` : parent;
  }

  transactionTypeBadgeClass(transaction: SavingsAccountTransaction): string {
    const parentType = this.transactionTypeCode(transaction);
    const subType = this.transactionSubTypeCode(transaction);
    if (subType) {
      return `transaction-type-${subType.toLowerCase().replace('_', '-')}`;
    }
    return `transaction-type-${parentType.toLowerCase().replace('_', '-')}`;
  }

  private transactionTypeCode(transaction: SavingsAccountTransaction): string {
    const code = transaction.transactionType.code || '';
    if (transaction.transactionType.deposit || code.endsWith('.deposit')) {
      return 'DEPOSIT';
    }
    if (transaction.transactionType.withdrawal || code.endsWith('.withdrawal')) {
      return 'WITHDRAWAL';
    }
    if (code.endsWith('.chargeReversal')) {
      return 'CHARGE_REVERSAL';
    }
    return (transaction.transactionType.value || '').toUpperCase().replace(/ /g, '_');
  }

  private transactionSubTypeCode(transaction: SavingsAccountTransaction): string {
    const subType = transaction.transactionSubType;
    if (!subType) {
      return '';
    }
    if (subType.code.endsWith('.disbursal')) {
      return 'DISBURSAL';
    }
    if (subType.code.endsWith('.refund')) {
      return 'REFUND';
    }
    if (subType.code.endsWith('.emiTransfer')) {
      return 'EMI_TRANSFER';
    }
    if (subType.code.endsWith('.foreclosureRefund')) {
      return 'FORECLOSURE_REFUND';
    }
    return (subType.displayName || '').toUpperCase().replace(/ /g, '_');
  }

  savingsTransactionColor(transaction: SavingsAccountTransaction): string {
    if (transaction.reversed) {
      return 'strike';
    } else if (transaction.transfer) {
      return 'transfer';
    } else if (transaction.transactionType.accrual) {
      return 'accrual';
    } else {
      return '';
    }
  }

  undoTransaction(transactionData: SavingsAccountTransaction): void {
    const undoTransactionAccountDialogRef = this.dialog.open(SavingsUndoTransactionDialogComponent);
    undoTransactionAccountDialogRef.afterClosed().subscribe((response: any) => {
      if (response && response.confirm) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;
        const comment = (response.comment || '').trim();
        if (!comment) {
          return;
        }
        const data = {
          transactionDate: this.dateUtils.parseDate(transactionData.date),
          transactionAmount: 0,
          dateFormat,
          locale,
          comment
        };
        this.savingsService
          .executeSavingsAccountTransactionsCommand(this.accountId, 'undo', data, transactionData.id)
          .subscribe(() => {
            this.reload();
          });
      }
    });
  }

  navigateToSavingsTransactionsReport(): void {
    const Client = this.route.parent.parent.snapshot.params['clientId'];
    const Savings = this.accountId;
    this.router.navigate(
      [
        '/reports/run',
        'Savings Accounts Transactions Report'
      ],
      {
        queryParams: {
          type: 'Table',
          Client,
          Savings
        }
      }
    );
  }

  private reload() {
    const clientId = this.route.parent.parent.snapshot.params['clientId'];
    const url: string = this.router.url;
    this.router
      .navigateByUrl(`/clients/${clientId}/savings-accounts`, { skipLocationChange: true })
      .then(() => this.router.navigate([url]));
  }
}
