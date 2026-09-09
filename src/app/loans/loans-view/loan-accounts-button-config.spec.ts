import { LoansAccountButtonConfiguration } from './loan-accounts-button-config';

describe('LoansAccountButtonConfiguration', () => {
  it('keeps Make Repayment enabled so it can open Transfer from Savings', () => {
    const config = new LoansAccountButtonConfiguration('Active');
    config.disableCashOnlyActions();

    const makeRepayment = config.singleButtons.find((button) => button.name === 'Make Repayment');
    expect(makeRepayment).toBeTruthy();
    expect(makeRepayment.disabled).not.toBe(true);
  });

  it('still disables cash-only Close and Prepay Loan', () => {
    const config = new LoansAccountButtonConfiguration('Active');
    config.addButton({ name: 'Prepay Loan', icon: 'coins', taskPermissionName: 'REPAYMENT_LOAN' });
    config.disableCashOnlyActions();

    expect(config.options.find((option) => option.name === 'Close')?.disabled).toBe(true);
    expect(config.singleButtons.find((button) => button.name === 'Prepay Loan')?.disabled).toBe(true);
  });
});
