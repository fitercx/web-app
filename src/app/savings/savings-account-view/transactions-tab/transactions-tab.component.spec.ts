import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { Dates } from 'app/core/utils/dates';
import { SavingsAccountTransaction } from 'app/savings/models/savings-account-transaction.model';
import { SavingsService } from 'app/savings/savings.service';
import { SettingsService } from 'app/settings/settings.service';
import { TransactionsTabComponent } from './transactions-tab.component';

describe('TransactionsTabComponent', () => {
  let component: TransactionsTabComponent;
  let fixture: ComponentFixture<TransactionsTabComponent>;
  let router: jasmine.SpyObj<Router>;
  let savingsService: jasmine.SpyObj<SavingsService>;

  const baseTransaction = (overrides: Partial<SavingsAccountTransaction> = {}): SavingsAccountTransaction =>
    ({
      id: 1,
      transactionType: {
        id: 1,
        code: 'savingsAccountTransactionType.deposit',
        value: 'Deposit',
        deposit: true,
        dividendPayout: false,
        withdrawal: false,
        interestPosting: false,
        feeDeduction: false,
        initiateTransfer: false,
        approveTransfer: false,
        withdrawTransfer: false,
        rejectTransfer: false,
        overdraftInterest: false,
        writtenoff: false,
        overdraftFee: false,
        withholdTax: false,
        payTax: false,
        escheat: false,
        amountHold: false,
        amountRelease: false,
        accrual: false
      },
      entryType: 'CREDIT',
      accountId: 10,
      accountNo: '0001',
      date: [
        2026,
        1,
        1
      ],
      currency: {} as any,
      amount: 100,
      runningBalance: 100,
      reversed: false,
      transfer: null as any,
      submittedOnDate: [
        2026,
        1,
        1
      ],
      interestedPostedAsOn: false,
      submittedByUsername: 'mifos',
      isManualTransaction: false,
      isReversal: false,
      originalTransactionId: null as any,
      lienTransaction: false,
      releaseTransactionId: null as any,
      chargesPaidByData: [],
      ...overrides
    }) as SavingsAccountTransaction;

  const transaction = (id: number, date: number[], submittedOnDate: number[], reversed = false) =>
    ({
      id,
      date,
      submittedOnDate,
      reversed,
      amount: id * 100,
      runningBalance: id * 1000,
      transactionType: { id: 1, code: 'savingsAccountTransactionType.deposit', value: 'Deposit', deposit: true }
    }) as SavingsAccountTransaction;

  const transactions = [
    transaction(
      1,
      [
        2026,
        9,
        1
      ],
      [
        2026,
        9,
        1
      ]
    ),
    transaction(
      2,
      [
        2026,
        9,
        20
      ],
      [
        2026,
        9,
        20
      ]
    ),
    transaction(
      3,
      [
        2026,
        9,
        5
      ],
      [
        2026,
        9,
        25
      ]
    ),
    transaction(
      4,
      [
        2026,
        9,
        20
      ],
      [
        2026,
        9,
        20
      ],
      true
    )
  ];

  const route = {
    parent: {
      parent: {
        data: of({ savingsAccountData: { transactions, status: { value: 'Active' }, accountNo: '000000042' } }),
        snapshot: { params: { savingAccountId: '42', clientId: '7' } }
      }
    }
  };

  beforeEach(waitForAsync(() => {
    router = jasmine.createSpyObj('Router', [
      'navigate',
      'navigateByUrl'
    ]);
    savingsService = jasmine.createSpyObj('SavingsService', [
      'getSavingsTransactionSubTypes',
      'getSavingsTransactionAssociatedLoans',
      'executeSavingsAccountTransactionsCommand'
    ]);
    savingsService.getSavingsTransactionSubTypes.and.returnValue(of({}));
    savingsService.getSavingsTransactionAssociatedLoans.and.returnValue(of({}));

    TestBed.configureTestingModule({
      declarations: [TransactionsTabComponent],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: router },
        { provide: SavingsService, useValue: savingsService },
        {
          provide: SettingsService,
          useValue: { dateFormat: 'dd MMMM yyyy', businessDate: new Date(2026, 9, 27), language: { code: 'en' } }
        },
        { provide: MatDialog, useValue: {} },
        { provide: Dates, useValue: {} },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
      .overrideTemplate(TransactionsTabComponent, '')
      .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TransactionsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.filterTransactions(false, false);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows transactions by latest value date first, backdated rows in their value-date position', () => {
    expect(component.displayedTransactions().map((t) => t.id)).toEqual([
      4,
      2,
      3,
      1
    ]);
  });

  it('exports the filtered transactions in the displayed order', () => {
    component.filterTransactions(true, false);

    expect(component.displayedTransactions().map((t) => t.id)).toEqual([
      2,
      3,
      1
    ]);
  });

  it('formats a single RBF EMI label', () => {
    const label = component.associatedLoanLabel(
      baseTransaction({
        associatedLoan: { loanId: 1042, loanClientId: 9, fromInstallment: 3, toInstallment: 3 }
      })
    );
    expect(label).toBe('1042-EMI3');
  });

  it('formats an RBF EMI range label', () => {
    const label = component.associatedLoanLabel(
      baseTransaction({
        associatedLoan: { loanId: 1042, loanClientId: 9, fromInstallment: 2, toInstallment: 3 }
      })
    );
    expect(label).toBe('1042-EMI2-3');
  });

  it('formats a loan-only label when installments are absent', () => {
    const label = component.associatedLoanLabel(
      baseTransaction({
        associatedLoan: { loanId: 1042, loanClientId: 9 }
      })
    );
    expect(label).toBe('1042');
  });

  it('returns null when there is no associated loan', () => {
    expect(component.associatedLoanLabel(baseTransaction())).toBeNull();
  });

  it('opens the loan account without navigating to the transaction view', () => {
    const event = jasmine.createSpyObj('MouseEvent', ['stopPropagation']);
    component.openAssociatedLoan(
      baseTransaction({
        associatedLoan: { loanId: 1042, loanClientId: 77 }
      }),
      event
    );

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/clients/77/loans-accounts/1042/general');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps hide reversed filtering behaviour', () => {
    component.transactionsData = [
      baseTransaction({ id: 1, reversed: true }),
      baseTransaction({ id: 2, reversed: false })
    ];
    component.filterTransactions(true, false, 'ALL');
    expect(component.dataSource.data.map((t: SavingsAccountTransaction) => t.id)).toEqual([2]);
  });
});
