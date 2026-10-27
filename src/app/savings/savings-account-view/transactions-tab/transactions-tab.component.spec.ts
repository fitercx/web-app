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
    TestBed.configureTestingModule({
      declarations: [TransactionsTabComponent],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: SavingsService, useValue: { getSavingsTransactionSubTypes: () => of({}) } },
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
});
