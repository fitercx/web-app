/**
 * LMS-128: Waived LPI belongs in Penalties. New backend rows store unaccrued leftover in
 * unrecognizedIncomePortion. Legacy rows still have that leftover in taxChargesPortion.
 * Real VAT stays in taxChargesPortion on repayments and non-penalty waives.
 */

export type LoanChargeLookup = {
  id?: number;
  penalty?: boolean;
  chargeTimeType?: { code?: string; value?: string };
};

function toAmount(value: unknown): number {
  return Number(value || 0);
}

export function isWaiveChargeTransaction(transaction: {
  type?: { id?: number; code?: string; waiveCharges?: boolean };
}): boolean {
  const type = transaction?.type;
  return !!type?.waiveCharges || type?.id === 9 || type?.code === 'loanTransactionType.waiveCharges';
}

function isPenaltyOrOverdueCharge(charge: LoanChargeLookup | undefined): boolean {
  if (!charge) {
    return false;
  }
  if (charge.penalty === true) {
    return true;
  }
  const time = `${charge.chargeTimeType?.code || ''} ${charge.chargeTimeType?.value || ''}`.toLowerCase();
  return time.includes('overdue');
}

function paidByChargeIds(transaction: { loanChargePaidByList?: Array<{ chargeId?: number }> }): number[] {
  return (Array.isArray(transaction?.loanChargePaidByList) ? transaction.loanChargePaidByList : [])
    .map((paidBy) => Number(paidBy?.chargeId))
    .filter(Boolean);
}

function waivedChargeIsPenalty(
  transaction: { loanChargePaidByList?: Array<{ chargeId?: number }> },
  charges?: LoanChargeLookup[]
): boolean | null {
  const chargeIds = paidByChargeIds(transaction);
  if (!chargeIds.length || !Array.isArray(charges) || !charges.length) {
    return null;
  }
  return chargeIds.some((chargeId) =>
    isPenaltyOrOverdueCharge(charges.find((charge) => Number(charge?.id) === chargeId))
  );
}

function isPenaltyLpiWaive(
  transaction: {
    type?: { id?: number; code?: string; waiveCharges?: boolean };
    loanChargePaidByList?: Array<{ chargeId?: number }>;
  },
  charges?: LoanChargeLookup[]
): boolean {
  if (!isWaiveChargeTransaction(transaction)) {
    return false;
  }
  const linked = waivedChargeIsPenalty(transaction, charges);
  return linked === true;
}

/** Legacy CRED mapping: unaccrued LPI leftover was written to taxChargesPortion. */
export function isWaivedLpiBookedAsTax(
  transaction: {
    type?: { id?: number; code?: string; waiveCharges?: boolean };
    taxChargesPortion?: number;
    penaltyChargesPortion?: number;
    feeChargesPortion?: number;
    unrecognizedIncomePortion?: number;
    loanChargePaidByList?: Array<{ chargeId?: number }>;
  },
  charges?: LoanChargeLookup[]
): boolean {
  if (!isWaiveChargeTransaction(transaction)) {
    return false;
  }
  if (toAmount(transaction?.unrecognizedIncomePortion) > 0) {
    return false;
  }
  const tax = toAmount(transaction?.taxChargesPortion);
  const fee = toAmount(transaction?.feeChargesPortion);
  if (tax <= 0 || fee > 0) {
    return false;
  }
  const linkedPenalty = waivedChargeIsPenalty(transaction, charges);
  if (linkedPenalty === true) {
    return true;
  }
  if (linkedPenalty === false) {
    return false;
  }
  return toAmount(transaction?.penaltyChargesPortion) === 0;
}

export function displayPenaltyPortion(
  transaction: {
    type?: { id?: number; code?: string; waiveCharges?: boolean };
    taxChargesPortion?: number;
    penaltyChargesPortion?: number;
    feeChargesPortion?: number;
    unrecognizedIncomePortion?: number;
    loanChargePaidByList?: Array<{ chargeId?: number }>;
  },
  charges?: LoanChargeLookup[]
): number {
  const penalty = toAmount(transaction?.penaltyChargesPortion);
  if (isPenaltyLpiWaive(transaction, charges) || isWaivedLpiBookedAsTax(transaction, charges)) {
    const unrecognized = toAmount(transaction?.unrecognizedIncomePortion);
    const legacyTax = isWaivedLpiBookedAsTax(transaction, charges) ? toAmount(transaction?.taxChargesPortion) : 0;
    return penalty + unrecognized + legacyTax;
  }
  if (
    isWaiveChargeTransaction(transaction) &&
    toAmount(transaction?.unrecognizedIncomePortion) > 0 &&
    toAmount(transaction?.feeChargesPortion) === 0
  ) {
    return penalty + toAmount(transaction?.unrecognizedIncomePortion);
  }
  return penalty;
}

export function displayTaxPortion(
  transaction: {
    type?: { id?: number; code?: string; waiveCharges?: boolean };
    taxChargesPortion?: number;
    penaltyChargesPortion?: number;
    feeChargesPortion?: number;
    unrecognizedIncomePortion?: number;
    loanChargePaidByList?: Array<{ chargeId?: number }>;
  },
  charges?: LoanChargeLookup[]
): number {
  if (isWaivedLpiBookedAsTax(transaction, charges)) {
    return 0;
  }
  return toAmount(transaction?.taxChargesPortion);
}

export function isWaivedLpiRow(
  transaction: {
    type?: { id?: number; code?: string; waiveCharges?: boolean };
    taxChargesPortion?: number;
    penaltyChargesPortion?: number;
    feeChargesPortion?: number;
    unrecognizedIncomePortion?: number;
    loanChargePaidByList?: Array<{ chargeId?: number }>;
  },
  charges?: LoanChargeLookup[]
): boolean {
  if (isPenaltyLpiWaive(transaction, charges) || isWaivedLpiBookedAsTax(transaction, charges)) {
    return true;
  }
  return (
    isWaiveChargeTransaction(transaction) &&
    toAmount(transaction?.unrecognizedIncomePortion) > 0 &&
    toAmount(transaction?.feeChargesPortion) === 0
  );
}
