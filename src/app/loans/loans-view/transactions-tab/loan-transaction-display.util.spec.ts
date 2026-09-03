import { displayPenaltyPortion, displayTaxPortion, isWaivedLpiBookedAsTax } from './loan-transaction-display.util';

describe('loan-transaction-display.util', () => {
  const waiveLpi = {
    type: { id: 9, code: 'loanTransactionType.waiveCharges', waiveCharges: true },
    taxChargesPortion: 4.47,
    penaltyChargesPortion: 0,
    feeChargesPortion: 0
  };

  it('treats waive-charge LPI booked in tax as a penalty display amount', () => {
    expect(isWaivedLpiBookedAsTax(waiveLpi)).toBe(true);
    expect(displayPenaltyPortion(waiveLpi)).toBe(4.47);
    expect(displayTaxPortion(waiveLpi)).toBe(0);
  });

  it('leaves real tax on a repayment in the Tax column', () => {
    const repayment = {
      type: { id: 2, code: 'loanTransactionType.repayment', waiveCharges: false },
      taxChargesPortion: 12.5,
      penaltyChargesPortion: 3.1,
      feeChargesPortion: 0
    };
    expect(isWaivedLpiBookedAsTax(repayment)).toBe(false);
    expect(displayPenaltyPortion(repayment)).toBe(3.1);
    expect(displayTaxPortion(repayment)).toBe(12.5);
  });

  it('does not remap a fee waive that has no tax portion', () => {
    const feeWaive = {
      type: { id: 9, waiveCharges: true },
      taxChargesPortion: 0,
      penaltyChargesPortion: 0,
      feeChargesPortion: 25
    };
    expect(isWaivedLpiBookedAsTax(feeWaive)).toBe(false);
    expect(displayPenaltyPortion(feeWaive)).toBe(0);
    expect(displayTaxPortion(feeWaive)).toBe(0);
  });
});
