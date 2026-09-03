/**
 * LMS-128: Waive-charge (type 9) LPI is persisted in tax_charges_portion_derived,
 * so the Transactions tab would show it under Tax. Remap those amounts to Penalties.
 */

export function isWaivedLpiBookedAsTax(transaction: {
  type?: { id?: number; code?: string; waiveCharges?: boolean };
  taxChargesPortion?: number;
  penaltyChargesPortion?: number;
  feeChargesPortion?: number;
}): boolean {
  const type = transaction?.type;
  const isWaive = !!type?.waiveCharges || type?.id === 9 || type?.code === 'loanTransactionType.waiveCharges';
  if (!isWaive) {
    return false;
  }
  const tax = Number(transaction?.taxChargesPortion || 0);
  const penalty = Number(transaction?.penaltyChargesPortion || 0);
  const fee = Number(transaction?.feeChargesPortion || 0);
  return tax > 0 && penalty === 0 && fee === 0;
}

export function displayPenaltyPortion(transaction: {
  type?: { id?: number; code?: string; waiveCharges?: boolean };
  taxChargesPortion?: number;
  penaltyChargesPortion?: number;
  feeChargesPortion?: number;
}): number {
  const penalty = Number(transaction?.penaltyChargesPortion || 0);
  if (isWaivedLpiBookedAsTax(transaction)) {
    return penalty + Number(transaction?.taxChargesPortion || 0);
  }
  return penalty;
}

export function displayTaxPortion(transaction: {
  type?: { id?: number; code?: string; waiveCharges?: boolean };
  taxChargesPortion?: number;
  penaltyChargesPortion?: number;
  feeChargesPortion?: number;
}): number {
  if (isWaivedLpiBookedAsTax(transaction)) {
    return 0;
  }
  return Number(transaction?.taxChargesPortion || 0);
}
