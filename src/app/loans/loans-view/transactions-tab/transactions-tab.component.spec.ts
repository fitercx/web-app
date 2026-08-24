import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { UntypedFormControl } from '@angular/forms';

import { TransactionsTabComponent } from './transactions-tab.component';
import { LoanTransaction } from 'app/products/loan-products/models/loan-account.model';

describe('TransactionsTabComponent', () => {
  let component: TransactionsTabComponent;
  let fixture: ComponentFixture<TransactionsTabComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [TransactionsTabComponent]
    }).compileComponents();
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
});
