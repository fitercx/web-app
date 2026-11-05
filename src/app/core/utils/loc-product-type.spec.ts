import {
  LocProductType,
  getDefaultAdvancePercentage,
  getDefaultInterestChargeTimeCode,
  getLocBadgeLabel,
  getLoanProductDisplayLabel,
  getLocDisplayName,
  getLocProductTypeId,
  getLocProductTypeOptionLabel,
  isAnyLocProductType,
  isPayable,
  isReceivableFamily,
  isReceivableNonRecourse,
  isShortDisbursedReceivable,
  toLocProductType
} from './loc-product-type';

describe('loc-product-type', () => {
  it('resolves codes, ids and numeric strings', () => {
    expect(toLocProductType('RECEIVABLE')).toBe(LocProductType.RECEIVABLE);
    expect(toLocProductType('payable')).toBe(LocProductType.PAYABLE);
    expect(toLocProductType(3)).toBe(LocProductType.RECEIVABLE_NON_RECOURSE);
    expect(toLocProductType('3')).toBe(LocProductType.RECEIVABLE_NON_RECOURSE);
    expect(toLocProductType(null)).toBeNull();
    expect(toLocProductType('')).toBeNull();
    expect(toLocProductType('UNKNOWN')).toBeNull();
    expect(toLocProductType(9)).toBeNull();
  });

  it('maps types back to ids', () => {
    expect(getLocProductTypeId('RECEIVABLE')).toBe(1);
    expect(getLocProductTypeId('PAYABLE')).toBe(2);
    expect(getLocProductTypeId('RECEIVABLE_NON_RECOURSE')).toBe(3);
    expect(getLocProductTypeId(undefined)).toBeNull();
  });

  it('treats non-recourse as receivable family but not short disbursed', () => {
    expect(isReceivableFamily('RECEIVABLE')).toBe(true);
    expect(isReceivableFamily('RECEIVABLE_NON_RECOURSE')).toBe(true);
    expect(isReceivableFamily('PAYABLE')).toBe(false);
    expect(isReceivableFamily(null)).toBe(false);

    expect(isShortDisbursedReceivable('RECEIVABLE')).toBe(true);
    expect(isShortDisbursedReceivable('RECEIVABLE_NON_RECOURSE')).toBe(false);
    expect(isShortDisbursedReceivable('PAYABLE')).toBe(false);

    expect(isReceivableNonRecourse(3)).toBe(true);
    expect(isPayable(2)).toBe(true);
    expect(isAnyLocProductType('RECEIVABLE_NON_RECOURSE')).toBe(true);
    expect(isAnyLocProductType(undefined)).toBe(false);
  });

  it('picks LOC form defaults', () => {
    expect(getDefaultInterestChargeTimeCode(1)).toBe('UPFRONT');
    expect(getDefaultInterestChargeTimeCode(2)).toBe('POST_DISBURSEMENT');
    expect(getDefaultInterestChargeTimeCode(3)).toBe('POST_DISBURSEMENT');
    expect(getDefaultInterestChargeTimeCode('')).toBeNull();

    expect(getDefaultAdvancePercentage(1)).toBe('90');
    expect(getDefaultAdvancePercentage(3)).toBe('90');
    expect(getDefaultAdvancePercentage('payable')).toBe('100');
    expect(getDefaultAdvancePercentage(null)).toBeNull();
  });

  it('builds labels', () => {
    expect(getLocBadgeLabel('RECEIVABLE_NON_RECOURSE')).toBe('LOC FACTORING');
    expect(getLocBadgeLabel('PAYABLE')).toBe('LOC PAYABLE');
    expect(getLocBadgeLabel(undefined)).toBe('LOC RECEIVABLE');
    expect(getLocDisplayName(3)).toBe('LOC Factoring');
    expect(getLocDisplayName(2)).toBe('LOC Payable');
  });

  it('shows non-recourse as Factoring in backend-provided labels', () => {
    expect(
      getLocProductTypeOptionLabel({
        id: 3,
        code: 'RECEIVABLE_NON_RECOURSE',
        value: 'Receivable non recourse product type'
      })
    ).toBe('Factoring');
    expect(getLocProductTypeOptionLabel({ id: 3 })).toBe('Factoring');
    expect(getLocProductTypeOptionLabel({ id: 1, code: 'RECEIVABLE', value: 'Receivable product type' })).toBe(
      'Receivable product type'
    );
    expect(getLocProductTypeOptionLabel({ id: 2, code: 'PAYABLE' })).toBe('PAYABLE');

    expect(getLoanProductDisplayLabel('Invoice Discounting (Non-Recourse)')).toBe('Factoring');
    expect(getLoanProductDisplayLabel('Invoice Discounting')).toBe('Invoice Discounting');
    expect(getLoanProductDisplayLabel(null)).toBe('');
  });
});
