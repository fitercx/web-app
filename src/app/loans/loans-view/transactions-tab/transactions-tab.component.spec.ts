import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { UntypedFormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { TransactionsTabComponent } from './transactions-tab.component';
import { LoanTransaction } from 'app/products/loan-products/models/loan-account.model';

describe('TransactionsTabComponent', () => {
  let component: TransactionsTabComponent;
  let fixture: ComponentFixture<TransactionsTabComponent>;

  const transaction = (id: number, date: number[], submittedOnDate: number[], amount: number, reversed = false) =>
    ({
      id,
      date,
      submittedOnDate,
      amount,
      reversed,
      manuallyReversed: false,
      type: { id: 2, value: 'Repayment', accrual: false }
    }) as LoanTransaction;

  const route = {
    parent: {
      parent: {
        data: of({ loanDetailsData: { transactions: [], status: { value: 'Active' }, accountNo: '000000101' } }),
        snapshot: { params: { loanId: '101', clientId: '7' } }
      }
    }
  };

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [TransactionsTabComponent],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: LoansService, useValue: {} },
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
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('treats manuallyReversed as active when backend reversed flag is false', () => {
    const txn = { reversed: false, manuallyReversed: true } as LoanTransaction;
    expect((component as any).isTransactionReversed(txn)).toBeFalsy();
  });

  it('labels a targeted penalty refund and prevents standalone undo', () => {
    const txn = {
      manuallyReversed: false,
      type: { id: 18, code: 'loanTransactionType.refundForActiveLoan', value: 'Refund for Active Loan' },
      principalPortion: 0,
      interestPortion: 0,
      penaltyChargesPortion: 82.19
    } as LoanTransaction;

    expect(component.transactionTypeLabel(txn)).toBe('Refunded LPI');
    expect(component.allowUndoTransaction(txn)).toBeFalsy();
  });

  it('hides only backend-reversed rows when Show Reversed is off', () => {
    component.transactionsData = [
      { id: 1, reversed: false, manuallyReversed: true, type: { accrual: false } } as LoanTransaction,
      { id: 2, reversed: true, manuallyReversed: false, type: { accrual: false } } as LoanTransaction
    ];
    component.hideAccrualsParam = new UntypedFormControl(true);
    component.showReversedParam = new UntypedFormControl(false);
    component.filterTransactions(true, true);
    expect(component.dataSource.data.map((t) => t.id)).toEqual([1]);
  });

  describe('value-date ordering', () => {
    beforeEach(() => {
      component.transactionsData = [
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
          ],
          10000
        ),
        transaction(
          2,
          [
            2026,
            9,
            15
          ],
          [
            2026,
            9,
            15
          ],
          500
        ),
        transaction(
          3,
          [
            2026,
            9,
            10
          ],
          [
            2026,
            9,
            26
          ],
          300
        ),
        transaction(
          4,
          [
            2026,
            9,
            15
          ],
          [
            2026,
            9,
            15
          ],
          700,
          true
        )
      ];
    });

    it('shows reversed and backdated rows by their value date, newest first', () => {
      component.filterTransactions(false, true);

      expect(component.displayedTransactions().map((t) => t.id)).toEqual([
        4,
        2,
        3,
        1
      ]);
    });

    it('exports the filtered transactions in the displayed order', () => {
      component.filterTransactions(true, true);

      expect(component.displayedTransactions().map((t) => t.id)).toEqual([
        2,
        3,
        1
      ]);
    });
  });
});
