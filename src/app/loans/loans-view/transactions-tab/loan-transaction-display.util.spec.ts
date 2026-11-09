import {
  displayPenaltyPortion,
  displayTaxPortion,
  isWaivedLpiBookedAsTax,
  isWaivedLpiRow
} from './loan-transaction-display.util';

describe('loan-transaction-display.util', () => {
  const lpiCharge = {
    id: 88,
    penalty: true,
    chargeTimeType: { value: 'Overdue Fees' }
  };

  it('shows new-backend unaccrued LPI waive in Penalties, not Tax', () => {
    const waive = {
      type: { id: 9, waiveCharges: true },
      taxChargesPortion: 0,
      penaltyChargesPortion: 40,
      feeChargesPortion: 0,
      unrecognizedIncomePortion: 60,
      loanChargePaidByList: [{ chargeId: 88 }]
    };
    expect(isWaivedLpiBookedAsTax(waive, [lpiCharge])).toBe(false);
    expect(displayPenaltyPortion(waive, [lpiCharge])).toBe(100);
    expect(displayTaxPortion(waive, [lpiCharge])).toBe(0);
    expect(isWaivedLpiRow(waive, [lpiCharge])).toBe(true);
  });

  it('treats legacy waive-LPI booked in tax as a penalty display amount', () => {
    const waiveLpi = {
      type: { id: 9, code: 'loanTransactionType.waiveCharges', waiveCharges: true },
      taxChargesPortion: 4.47,
      penaltyChargesPortion: 0,
      feeChargesPortion: 0
    };
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

  it('does not remap a non-penalty waive even when the tax field is populated', () => {
    const taxOrFeeWaive = {
      type: { id: 9, waiveCharges: true },
      taxChargesPortion: 6.2,
      penaltyChargesPortion: 0,
      feeChargesPortion: 0,
      loanChargePaidByList: [{ chargeId: 21 }]
    };
    const charges = [{ id: 21, penalty: false, chargeTimeType: { value: 'Specified due date' } }];
    expect(isWaivedLpiBookedAsTax(taxOrFeeWaive, charges)).toBe(false);
    expect(displayPenaltyPortion(taxOrFeeWaive, charges)).toBe(0);
    expect(displayTaxPortion(taxOrFeeWaive, charges)).toBe(6.2);
  });
});
