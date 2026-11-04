/**
 * Line of credit product types, mirroring the backend `LocProductType` enum.
 * The backend returns the code (enum name) on LOC/loan payloads and the id on template options.
 */
export enum LocProductType {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
  RECEIVABLE_NON_RECOURSE = 'RECEIVABLE_NON_RECOURSE'
}

export type LocProductTypeInput = LocProductType | string | number | null | undefined;

const LOC_PRODUCT_TYPE_BY_ID: Record<number, LocProductType> = {
  1: LocProductType.RECEIVABLE,
  2: LocProductType.PAYABLE,
  3: LocProductType.RECEIVABLE_NON_RECOURSE
};

function assertNever(value: never): never {
  throw new Error(`Unhandled LOC product type: ${value}`);
}

/** Resolves a code (any case), numeric id, or numeric string to a `LocProductType`. */
export function toLocProductType(input: LocProductTypeInput): LocProductType | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  if (typeof input === 'number' || /^\d+$/.test(String(input).trim())) {
    return LOC_PRODUCT_TYPE_BY_ID[Number(input)] ?? null;
  }
  const code = String(input).trim().toUpperCase();
  return (Object.values(LocProductType) as string[]).includes(code) ? (code as LocProductType) : null;
}

export function getLocProductTypeId(input: LocProductTypeInput): number | null {
  const type = toLocProductType(input);
  if (type === null) {
    return null;
  }
  switch (type) {
    case LocProductType.RECEIVABLE:
      return 1;
    case LocProductType.PAYABLE:
      return 2;
    case LocProductType.RECEIVABLE_NON_RECOURSE:
      return 3;
    default:
      return assertNever(type);
  }
}

/** Buyer / invoice / advance semantics: receivable and receivable non-recourse. */
export function isReceivableFamily(input: LocProductTypeInput): boolean {
  const type = toLocProductType(input);
  if (type === null) {
    return false;
  }
  switch (type) {
    case LocProductType.RECEIVABLE:
    case LocProductType.RECEIVABLE_NON_RECOURSE:
      return true;
    case LocProductType.PAYABLE:
      return false;
    default:
      return assertNever(type);
  }
}

/** Receivable financing with short disbursal (interest deducted upfront). Excludes non-recourse. */
export function isShortDisbursedReceivable(input: LocProductTypeInput): boolean {
  const type = toLocProductType(input);
  if (type === null) {
    return false;
  }
  switch (type) {
    case LocProductType.RECEIVABLE:
      return true;
    case LocProductType.PAYABLE:
    case LocProductType.RECEIVABLE_NON_RECOURSE:
      return false;
    default:
      return assertNever(type);
  }
}

export function isReceivableNonRecourse(input: LocProductTypeInput): boolean {
  return toLocProductType(input) === LocProductType.RECEIVABLE_NON_RECOURSE;
}

export function isPayable(input: LocProductTypeInput): boolean {
  return toLocProductType(input) === LocProductType.PAYABLE;
}

export function isAnyLocProductType(input: LocProductTypeInput): boolean {
  return toLocProductType(input) !== null;
}

/** Default LOC interest charge time code: upfront only for short-disbursed receivable. */
export function getDefaultInterestChargeTimeCode(input: LocProductTypeInput): 'UPFRONT' | 'POST_DISBURSEMENT' | null {
  const type = toLocProductType(input);
  if (type === null) {
    return null;
  }
  switch (type) {
    case LocProductType.RECEIVABLE:
      return 'UPFRONT';
    case LocProductType.PAYABLE:
    case LocProductType.RECEIVABLE_NON_RECOURSE:
      return 'POST_DISBURSEMENT';
    default:
      return assertNever(type);
  }
}

/** Default advance percentage: 90% for the receivable family, 100% for payable. */
export function getDefaultAdvancePercentage(input: LocProductTypeInput): string | null {
  const type = toLocProductType(input);
  if (type === null) {
    return null;
  }
  return isReceivableFamily(type) ? '90' : '100';
}

/** Badge text shown on LOC screens, e.g. "LOC RECEIVABLE NR". */
export function getLocBadgeLabel(input: LocProductTypeInput): string {
  const type = toLocProductType(input) ?? LocProductType.RECEIVABLE;
  switch (type) {
    case LocProductType.RECEIVABLE:
      return 'LOC RECEIVABLE';
    case LocProductType.PAYABLE:
      return 'LOC PAYABLE';
    case LocProductType.RECEIVABLE_NON_RECOURSE:
      return 'LOC RECEIVABLE NR';
    default:
      return assertNever(type);
  }
}

/** Title-case display name, e.g. "LOC Receivable NR". */
export function getLocDisplayName(input: LocProductTypeInput): string {
  const type = toLocProductType(input) ?? LocProductType.RECEIVABLE;
  switch (type) {
    case LocProductType.RECEIVABLE:
      return 'LOC Receivable';
    case LocProductType.PAYABLE:
      return 'LOC Payable';
    case LocProductType.RECEIVABLE_NON_RECOURSE:
      return 'LOC Receivable NR';
    default:
      return assertNever(type);
  }
}
