/**
 * Shared helpers for backdated settlement / make-repayment screens.
 *
 * The repayment schedule and loan summary are as-of today (they still include LPI
 * accrued after a selected backdate). The /template/penalties payload is as-of the
 * selected transaction date. Allocation, default amount, and "will this close the
 * loan?" MUST follow the as-of-date figures, otherwise the UI quotes phantom LPI
 * and operators overpay after the backend waives those charges.
 */

export function roundAmount(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

export interface SettlementComponents {
  penalty: number;
  fee: number;
  tax: number;
  interest: number;
  principal: number;
}

export interface SettlementAllocation extends SettlementComponents {
  unallocated: number;
}

export interface InstallmentBucket extends SettlementComponents {
  period?: number;
}

const WATERFALL_ORDER: Array<keyof SettlementComponents> = [
  'penalty',
  'fee',
  'tax',
  'interest',
  'principal'
];

const PRINCIPAL_INTEREST_PENALTY_FEE: Array<keyof SettlementComponents> = [
  'principal',
  'interest',
  'penalty',
  'fee',
  'tax'
];

const INTEREST_PRINCIPAL_PENALTY_FEE: Array<keyof SettlementComponents> = [
  'interest',
  'principal',
  'penalty',
  'fee',
  'tax'
];

const PENALTY_INTEREST_PRINCIPAL_FEE: Array<keyof SettlementComponents> = [
  'penalty',
  'interest',
  'principal',
  'fee',
  'tax'
];

const PRINCIPAL_INTEREST_FEE_PENALTY: Array<keyof SettlementComponents> = [
  'principal',
  'interest',
  'fee',
  'tax',
  'penalty'
];

/**
 * Due/on-time payment order for each loan transaction-processing strategy.
 * Tax sits with fees; the processors do not allocate tax as its own step.
 * Callers that omit a strategy keep {@link WATERFALL_ORDER}.
 */
const STRATEGY_COMPONENT_ORDERS: Record<string, Array<keyof SettlementComponents>> = {
  'principal-interest-penalties-fees-order-strategy': PRINCIPAL_INTEREST_PENALTY_FEE,
  'principal, interest, penalties, fees order': PRINCIPAL_INTEREST_PENALTY_FEE,
  'heavensfamily-strategy': PRINCIPAL_INTEREST_FEE_PENALTY,
  'interest-principal-penalties-fees-order-strategy': INTEREST_PRINCIPAL_PENALTY_FEE,
  'interest, principal, penalties, fees order': INTEREST_PRINCIPAL_PENALTY_FEE,
  'early-repayment-strategy': INTEREST_PRINCIPAL_PENALTY_FEE,
  'due-penalty-interest-principal-fee-in-advance-penalty-interest-principal-fee-strategy':
    PENALTY_INTEREST_PRINCIPAL_FEE,
  'mifos-standard-strategy': WATERFALL_ORDER,
  'pro-rata-mifos-standard-strategy': WATERFALL_ORDER,
  'creocore-strategy': WATERFALL_ORDER,
  'rbi-india-strategy': WATERFALL_ORDER,
  'acme-standard-strategy': WATERFALL_ORDER,
  'due-penalty-fee-interest-principal-in-advance-principal-penalty-fee-interest-strategy': WATERFALL_ORDER
};

const ADVANCED_RULE_COMPONENT: Record<string, keyof SettlementComponents> = {
  PAST_DUE_PENALTY: 'penalty',
  DUE_PENALTY: 'penalty',
  IN_ADVANCE_PENALTY: 'penalty',
  PAST_DUE_FEE: 'fee',
  DUE_FEE: 'fee',
  IN_ADVANCE_FEE: 'fee',
  PAST_DUE_INTEREST: 'interest',
  DUE_INTEREST: 'interest',
  IN_ADVANCE_INTEREST: 'interest',
  PAST_DUE_PRINCIPAL: 'principal',
  DUE_PRINCIPAL: 'principal',
  IN_ADVANCE_PRINCIPAL: 'principal'
};

export interface RepaymentPaymentAllocation {
  transactionType?: string;
  paymentAllocationOrder?: Array<{ paymentAllocationRule?: string; order?: number }>;
}

/**
 * Component order a repayment uses on each due installment.
 * `advanced-payment-allocation-strategy` follows the loan's DEFAULT allocation rules.
 */
export function repaymentComponentOrder(
  strategyCode: string | null | undefined,
  paymentAllocations?: RepaymentPaymentAllocation[] | null
): Array<keyof SettlementComponents> {
  const key = (strategyCode || '').trim().toLowerCase();
  if (key === 'advanced-payment-allocation-strategy') {
    const advanced = orderFromAdvancedAllocation(paymentAllocations);
    if (advanced) {
      return advanced;
    }
  }
  return STRATEGY_COMPONENT_ORDERS[key] || WATERFALL_ORDER;
}

function orderFromAdvancedAllocation(
  paymentAllocations?: RepaymentPaymentAllocation[] | null
): Array<keyof SettlementComponents> | null {
  const rows = paymentAllocations || [];
  const selected = rows.find((row) => (row.transactionType || '').toUpperCase() === 'DEFAULT') || rows[0];
  const rules = selected?.paymentAllocationOrder;
  if (!rules?.length) {
    return null;
  }
  const sorted = [...rules].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const seen = new Set<keyof SettlementComponents>();
  const order: Array<keyof SettlementComponents> = [];
  for (const rule of sorted) {
    const component = ADVANCED_RULE_COMPONENT[(rule.paymentAllocationRule || '').toUpperCase()];
    if (!component || seen.has(component)) {
      continue;
    }
    seen.add(component);
    order.push(component);
    if (component === 'fee') {
      order.push('tax');
      seen.add('tax');
    }
  }
  for (const component of [
    'penalty',
    'fee',
    'tax',
    'interest',
    'principal'
  ] as const) {
    if (!seen.has(component)) {
      order.push(component);
    }
  }
  return order;
}

/**
 * On-screen explanation of the transaction-date calendar's lower bound.
 *
 * How far back a value date may go is backend policy, computed per loan by
 * BackdatedRepaymentValidator#computeEarliestAllowedTransactionDate and returned as
 * `earliestAllowedTransactionDate`. It is administrator-configurable per tenant (global configuration
 * `backdated-transaction-max-days`), so the message states the actual earliest allowed date rather than quoting a
 * day count that goes stale the moment the configuration changes.
 */
export function buildBackdateLimitMessage(formattedEarliestAllowedDate: string): string {
  return `You cannot backdate this payment before ${formattedEarliestAllowedDate} — the earliest date allowed for this loan.`;
}

/** LPI that is on the loan today but will be waived by settling on the selected date. */
export function computePenaltyWaivedByBackdate(penaltyInSummary: number, penaltyAsOfDate: number): number {
  return Math.max(roundAmount(Number(penaltyInSummary || 0) - Number(penaltyAsOfDate || 0)), 0);
}

/** Foreclosure copy when LPI accrued after the selected date is waived. Date is already formatted (e.g. 25-Aug). */
export function formatWaivedLpiMessage(currencySymbol: string, amountLabel: string, fromDateLabel: string): string {
  return `Waived LPI amount of ${currencySymbol} ${amountLabel} from ${fromDateLabel} till today`;
}

/**
 * Later LPI is waived only when the amount on screen actually closes the loan.
 * The default as-of total and a partial entered amount must not say later LPI will be waived.
 */
export function includeLpiWaiveFootnote(paymentClosesLoan: boolean): boolean {
  return paymentClosesLoan;
}

/** Make Repayment copy when LPI accrued after the selected date is waived. Date is already formatted (e.g. 18-Aug). */
export function formatLpiWaivedAfterDateMessage(
  currencySymbol: string,
  amountLabel: string,
  selectedDateLabel: string
): string {
  return `${currencySymbol} ${amountLabel} of late-payment interest accrued after ${selectedDateLabel} will be waived and is not charged.`;
}

/**
 * Interest on the loan ledger (full EMI period) minus pro-rated interest due as of the selected date.
 * Positive when paying before the installment due date — shown as unearned / waived interest.
 */
export function computeUnearnedInterest(interestInSummary: number, interestAsOfDate: number): number {
  return Math.max(roundAmount(Number(interestInSummary || 0) - Number(interestAsOfDate || 0)), 0);
}

/**
 * True when {@code date} matches a real EMI installment due date (scheduled P+I &gt; 0).
 */
export function isRealEmiDueOnDate(
  periods:
    | Array<{
        period?: number;
        dueDate?: any;
        isAdditional?: boolean;
        downPaymentPeriod?: boolean;
        principalOriginalDue?: number;
        principalDue?: number;
        interestOriginalDue?: number;
        interestDue?: number;
      }>
    | undefined,
  transactionDateValue: any,
  toComparableDate: (value: any) => Date | null
): boolean {
  const selected = toComparableDate(transactionDateValue);
  if (!selected || !Array.isArray(periods)) {
    return false;
  }
  return periods.some((period) => {
    if (!period || period.downPaymentPeriod || period.isAdditional) {
      return false;
    }
    const due = toComparableDate(period.dueDate);
    if (!due || due.getTime() !== selected.getTime()) {
      return false;
    }
    const scheduledPI =
      Number(period.principalOriginalDue ?? period.principalDue ?? 0) +
      Number(period.interestOriginalDue ?? period.interestDue ?? 0);
    return Number(period.period || 0) > 0 && scheduledPI > 0.01;
  });
}

/**
 * Dummy post-maturity LPI grace row: zero scheduled P+I, due date rolled to latest LPI date.
 * When the backend treats that date as an EMI due date, same-day LPI is wrongly excluded from /template/penalties.
 */
export function isDummyGraceInstallmentDueOnDate(
  periods:
    | Array<{
        period?: number;
        dueDate?: any;
        isAdditional?: boolean;
        downPaymentPeriod?: boolean;
        principalOriginalDue?: number;
        principalDue?: number;
        interestOriginalDue?: number;
        interestDue?: number;
      }>
    | undefined,
  transactionDateValue: any,
  toComparableDate: (value: any) => Date | null
): boolean {
  const selected = toComparableDate(transactionDateValue);
  if (!selected || !Array.isArray(periods)) {
    return false;
  }
  return periods.some((period) => {
    if (!period || period.downPaymentPeriod) {
      return false;
    }
    const due = toComparableDate(period.dueDate);
    if (!due || due.getTime() !== selected.getTime()) {
      return false;
    }
    if (period.isAdditional) {
      return true;
    }
    const scheduledPI =
      Number(period.principalOriginalDue ?? period.principalDue ?? 0) +
      Number(period.interestOriginalDue ?? period.interestDue ?? 0);
    return Number(period.period || 0) > 0 && scheduledPI <= 0.01;
  });
}

/**
 * When settling on the business date, /template/penalties can underquote LPI vs loan summary because a dummy
 * grace-row due date was treated as an on-time EMI date. Add the penalty gap back only when the ledger delta
 * matches and this is not a genuine on-time EMI due-date exclusion.
 */
export interface ReconciledAsOfDateAmounts extends SettlementComponents {
  /** Remaining principal budget for allocation / close amount. */
  remainingPrincipal: number;
  /** Suggested default transaction amount for the selected date. */
  defaultTransactionAmount: number;
}

/**
 * When backdating before a repayment already recorded on a later date, /template/penalties replays
 * historical due (pre-payment) while Fineract's repayment template still reflects what can be paid
 * now. Prefer the repayment template in that case so default amount, settlement card, and EMI pills
 * stay aligned with loan summary outstanding.
 *
 * Interest on any date (including today) comes from /template/penalties (`interestOutstanding`), which
 * is pro-rated to the selected date. The repayment template `interestPortion` is remaining contractual
 * interest and must not be used for the Interest line.
 */
export function reconcileAsOfDateAmounts(params: {
  penaltyTemplate: any;
  repaymentTemplate: any;
  loanSummary?: any;
  feeFallback?: number;
  taxFallback?: number;
  isBackdated: boolean;
  /** When true, repayment template is authoritative for LPI and default amount (excludes same-day waived LPI). */
  isBusinessDate?: boolean;
  additionalPenalty?: number;
  reconcilePenalty?: (penaltyFromTemplate: number) => number;
  /** Unpaid LPI-only schedule rows (additional / dummy grace) — include when paying today. */
  lpiOnlyScheduleOutstanding?: number;
}): ReconciledAsOfDateAmounts {
  const feeFallback = Number(params.feeFallback || 0);
  const taxFallback = Number(params.taxFallback || 0);
  const additionalPenalty = Number(params.additionalPenalty || 0);
  const repaymentAmount = roundAmount(Number(params.repaymentTemplate?.amount || 0));

  if (params.isBusinessDate && repaymentAmount > 0.01) {
    const principal = roundAmount(
      Number(params.repaymentTemplate?.principalPortion ?? params.penaltyTemplate?.principalOutstanding ?? 0)
    );
    const remainingPrincipal = roundAmount(
      Number(
        params.penaltyTemplate?.remainingPrincipalOutstanding ?? params.loanSummary?.principalOutstanding ?? principal
      )
    );
    const asOfDateInterest = params.penaltyTemplate?.interestOutstanding;
    const interest = roundAmount(
      asOfDateInterest != null && asOfDateInterest !== ''
        ? Number(asOfDateInterest)
        : Number(params.repaymentTemplate?.interestPortion ?? 0)
    );
    const fee = roundAmount(Number(params.repaymentTemplate?.feeChargesPortion ?? feeFallback));
    const tax = roundAmount(Number(params.repaymentTemplate?.taxChargesPortion ?? taxFallback));
    const penalty = includeLpiOnlyScheduleOutstanding(
      roundAmount(Number(params.repaymentTemplate?.penaltyChargesPortion ?? 0) + additionalPenalty),
      params.lpiOnlyScheduleOutstanding
    );

    return {
      principal,
      interest,
      fee,
      tax,
      penalty,
      remainingPrincipal,
      defaultTransactionAmount: roundAmount(principal + interest + fee + tax + penalty)
    };
  }

  let principal = Number(params.penaltyTemplate?.principalOutstanding || 0);
  let remainingPrincipal = Number(
    params.penaltyTemplate?.remainingPrincipalOutstanding || params.loanSummary?.principalOutstanding || principal
  );
  let interest = Number(params.penaltyTemplate?.interestOutstanding || 0);
  let fee = Number(params.repaymentTemplate?.feeChargesPortion ?? feeFallback);
  let tax = Number(params.repaymentTemplate?.taxChargesPortion ?? taxFallback);
  const penaltyFromTemplate = Number(params.penaltyTemplate?.penaltyAmountDue || 0) + additionalPenalty;
  let penalty = params.reconcilePenalty
    ? params.reconcilePenalty(penaltyFromTemplate)
    : roundAmount(penaltyFromTemplate);

  let defaultTransactionAmount = roundAmount(principal + interest + fee + tax + penalty);

  if (params.isBackdated && repaymentAmount > 0.01 && defaultTransactionAmount > repaymentAmount + 0.01) {
    principal = roundAmount(Number(params.repaymentTemplate?.principalPortion ?? repaymentAmount));
    interest = roundAmount(Number(params.repaymentTemplate?.interestPortion || 0));
    fee = roundAmount(Number(params.repaymentTemplate?.feeChargesPortion || 0));
    tax = roundAmount(Number(params.repaymentTemplate?.taxChargesPortion || 0));
    penalty = roundAmount(Number(params.repaymentTemplate?.penaltyChargesPortion || 0) + additionalPenalty);
    remainingPrincipal = roundAmount(Number(params.loanSummary?.principalOutstanding ?? principal));
    defaultTransactionAmount = roundAmount(
      repaymentAmount + (additionalPenalty > 0 && penalty <= 0.01 ? additionalPenalty : 0)
    );
  }

  return {
    principal,
    interest,
    fee,
    tax,
    penalty,
    remainingPrincipal,
    defaultTransactionAmount
  };
}

/**
 * Prefill for Make Repayment and Transfer from Savings.
 * <p>
 * The penalties template lists every unpaid LPI day strictly before the selected date. The repayment template often
 * still has only the one day already sitting on the installment, and a backdated reconcile can copy that smaller
 * figure. The amount the operator sees must keep the higher pre-date total. On an installment due date that same-day
 * LPI is not part of the amount due, so the template figure is left as it is.
 */
export function applyPreDateLpiFloor(
  reconciled: ReconciledAsOfDateAmounts,
  penaltyTemplateDue: number,
  onInstallmentDueDate: boolean
): ReconciledAsOfDateAmounts {
  const penaltyDue = roundAmount(Number(penaltyTemplateDue || 0));
  if (onInstallmentDueDate || penaltyDue <= reconciled.penalty + 0.01) {
    return reconciled;
  }
  const penalty = penaltyDue;
  return {
    ...reconciled,
    penalty,
    defaultTransactionAmount: roundAmount(
      reconciled.principal + reconciled.interest + reconciled.fee + reconciled.tax + penalty
    )
  };
}

export function reconcilePenaltyWithLedger(params: {
  penaltyFromTemplate: number;
  penaltyInSummary: number;
  fullLoanOutstanding: number;
  dueWithoutPenaltyReconcile: number;
  isBusinessDate: boolean;
  onInstallmentDueDate: boolean;
  hasRealEmiDueOnDate: boolean;
}): number {
  const templatePenalty = roundAmount(params.penaltyFromTemplate);
  if (!params.isBusinessDate) {
    return templatePenalty;
  }
  const penaltyGap = roundAmount(Number(params.penaltyInSummary || 0) - templatePenalty);
  if (penaltyGap <= 0.01) {
    return templatePenalty;
  }
  const ledgerGap = roundAmount(params.fullLoanOutstanding - params.dueWithoutPenaltyReconcile);
  if (Math.abs(ledgerGap - penaltyGap) > 0.02) {
    return templatePenalty;
  }
  if (params.onInstallmentDueDate && params.hasRealEmiDueOnDate) {
    return templatePenalty;
  }
  return roundAmount(templatePenalty + penaltyGap);
}

export function isSameCalendarDate(a: any, b: any, toComparableDate: (value: any) => Date | null): boolean {
  const left = toComparableDate(a);
  const right = toComparableDate(b);
  return !!(left && right && left.getTime() === right.getTime());
}

/**
 * Amount required to settle the loan as of the selected date under mifos-standard /
 * pro-rata-mifos-standard: remaining principal (all EMIs) + interest due as of that date
 * (current EMI / pro-rated) + fees + tax + LPI still due. Future EMI interest is not collected.
 */
export function computeSettlementRequired(components: SettlementComponents): number {
  return roundAmount(
    Number(components.principal || 0) +
      Number(components.interest || 0) +
      Number(components.fee || 0) +
      Number(components.tax || 0) +
      Number(components.penalty || 0)
  );
}

export interface SchedulePeriod {
  period?: number;
  complete?: boolean;
  downPaymentPeriod?: boolean;
  isAdditional?: boolean;
  dueDate?: any;
  totalOutstandingForPeriod?: number;
  totalDueForPeriod?: number;
  totalPaidForPeriod?: number;
  principalDue?: number;
  principalPaid?: number;
  principalOriginalDue?: number;
  interestDue?: number;
  interestPaid?: number;
  interestOriginalDue?: number;
  principalOutstanding?: number;
  interestOutstanding?: number;
  penaltyChargesDue?: number;
  penaltyChargesPaid?: number;
  penaltyChargesOutstanding?: number;
  feeChargesDue?: number;
  feeChargesPaid?: number;
  feeChargesOutstanding?: number;
  taxChargesDue?: number;
  taxChargesPaid?: number;
  taxChargesOutstanding?: number;
}

/** Unpaid overdue/LPI charge. `amountPercentageAppliedTo` is the EMI principal the daily fee was calculated on. */
export interface OverduePenaltyCharge {
  dueDate?: any;
  amountOutstanding?: number;
  penalty?: boolean;
  waived?: boolean;
  amountPercentageAppliedTo?: number;
}

function isRealScheduleInstallment(period: SchedulePeriod): boolean {
  if (!period || period.downPaymentPeriod || period.isAdditional) {
    return false;
  }
  const scheduledPI =
    Number(period.principalOriginalDue ?? period.principalDue ?? 0) +
    Number(period.interestOriginalDue ?? period.interestDue ?? 0);
  return Number(period.period || 0) > 0 && scheduledPI > 0.01;
}

/** Unpaid additional / dummy-grace rows (zero scheduled P+I) — LPI accrued after the last real EMI due date. */
export function computeLpiOnlyPeriodOutstanding(periods: SchedulePeriod[] | undefined): number {
  if (!Array.isArray(periods) || !periods.length) {
    return 0;
  }
  return roundAmount(
    periods
      .filter((period) => period && !period.complete && !period.downPaymentPeriod && !isRealScheduleInstallment(period))
      .filter((period) => {
        if (period.isAdditional) {
          return true;
        }
        const scheduledPI =
          Number(period.principalOriginalDue ?? period.principalDue ?? 0) +
          Number(period.interestOriginalDue ?? period.interestDue ?? 0);
        return Number(period.period || 0) > 0 && scheduledPI <= 0.01;
      })
      .reduce((sum, period) => sum + periodOutstandingOnSchedule(period), 0)
  );
}

function includeLpiOnlyScheduleOutstanding(penalty: number, lpiOnlyScheduleOutstanding?: number): number {
  const extra = roundAmount(Number(lpiOnlyScheduleOutstanding || 0));
  const current = roundAmount(penalty);
  if (extra <= 0.01) {
    return current;
  }
  // Template already has post-due LPI (current is extra, or installment + extra).
  if (current + 0.01 >= extra) {
    return current;
  }
  return roundAmount(current + extra);
}

function periodOutstandingOnSchedule(period: SchedulePeriod): number {
  const fromOutstanding = Number(period.totalOutstandingForPeriod ?? period.penaltyChargesOutstanding ?? 0);
  if (fromOutstanding > 0.01) {
    return roundAmount(fromOutstanding);
  }
  const fromDuePaid = roundAmount(Number(period.totalDueForPeriod ?? 0) - Number(period.totalPaidForPeriod ?? 0));
  if (fromDuePaid > 0.01) {
    return fromDuePaid;
  }
  const principal = Math.max(
    roundAmount(Number(period.principalDue ?? period.principalOriginalDue ?? 0) - Number(period.principalPaid ?? 0)),
    0
  );
  const interest = Math.max(
    roundAmount(Number(period.interestDue ?? period.interestOriginalDue ?? 0) - Number(period.interestPaid ?? 0)),
    0
  );
  const penalty = Math.max(
    roundAmount(Number(period.penaltyChargesDue ?? 0) - Number(period.penaltyChargesPaid ?? 0)),
    0
  );
  const fee = Math.max(roundAmount(Number(period.feeChargesDue ?? 0) - Number(period.feeChargesPaid ?? 0)), 0);
  return roundAmount(principal + interest + penalty + fee);
}

/**
 * Sum of every unpaid real installment on the repayment schedule — conservative cap for what the
 * backend can absorb on a full close (e.g. bullet PF/RF before maturity where the template can
 * overstate same-day interest vs schedule / accrual posting order).
 */
export function computeScheduleCloseCap(periods: SchedulePeriod[] | undefined): number {
  if (!Array.isArray(periods) || !periods.length) {
    return 0;
  }
  const unpaidReal = periods.filter((period) => isRealScheduleInstallment(period) && !period.complete);
  const realTotal = unpaidReal.reduce((sum, period) => sum + periodOutstandingOnSchedule(period), 0);
  const total = roundAmount(realTotal + computeLpiOnlyPeriodOutstanding(periods));
  return total > 0.01 ? total : 0;
}

/** Fineract LocForeclosureValidator — foreclosure date must be strictly before this unpaid due date. */
export const LOC_FORECLOSURE_DUE_OR_OVERDUE_ERROR_CODE = 'error.msg.loan.foreclosure.not.allowed.on.or.after.due.date';

/**
 * Last calendar date LocForeclosureValidator will accept: day before the earliest unpaid real EMI, clamped to the
 * backend's configured backdate window (`minDate` — see buildBackdateLimitMessage).
 * Null when that date is outside min/max (cannot backdate).
 */
export function lastAllowedLocForeclosureDate(
  periods: SchedulePeriod[] | undefined,
  toComparableDate: (value: any) => Date | null,
  minDate: Date | null,
  maxDate: Date | null
): Date | null {
  if (!Array.isArray(periods) || !periods.length) {
    return null;
  }
  let earliestUnpaid: Date | null = null;
  for (const period of periods) {
    if (!isRealScheduleInstallment(period) || period.complete || periodOutstandingOnSchedule(period) <= 0.01) {
      continue;
    }
    const due = toComparableDate(period.dueDate);
    if (!due) {
      continue;
    }
    if (!earliestUnpaid || due.getTime() < earliestUnpaid.getTime()) {
      earliestUnpaid = due;
    }
  }
  if (!earliestUnpaid) {
    return null;
  }
  const lastAllowed = new Date(earliestUnpaid.getFullYear(), earliestUnpaid.getMonth(), earliestUnpaid.getDate() - 1);
  if (minDate && lastAllowed.getTime() < minDate.getTime()) {
    return null;
  }
  if (maxDate && lastAllowed.getTime() > maxDate.getTime()) {
    return null;
  }
  return lastAllowed;
}

/** Lowest positive close cap across UI figures — used to detect Overpaid before submit.
 *  {@code datedRepaymentTemplateAmount} is a full-close quote (foreclosure), never current-EMI due. */
export function computeAuthoritativeSettlementCap(caps: {
  outstandingAfterWaiver: number;
  fullLoanOutstanding: number;
  scheduleCloseCap: number;
  datedRepaymentTemplateAmount?: number;
}): number {
  const candidates = [
    caps.outstandingAfterWaiver,
    caps.fullLoanOutstanding,
    caps.scheduleCloseCap,
    caps.datedRepaymentTemplateAmount
  ]
    .map((value) => roundAmount(Number(value || 0)))
    .filter((value) => value > 0.01);

  if (!candidates.length) {
    return 0;
  }
  return Math.min(...candidates);
}

export function computeProjectedOverpayment(amount: number, settlementCap: number): number {
  if (!settlementCap || settlementCap <= 0.01) {
    return 0;
  }
  return Math.max(roundAmount(Number(amount || 0) - settlementCap), 0);
}

/**
 * Daily LPI dated before the selected value date can sit on the next installment, whose due date is
 * still after that value date, so the due-EMI buckets do not include it. The penalty quote already
 * counts those days. Add the shortfall onto the latest installment due on or before the value date
 * so a partial payment takes that LPI before that installment's interest.
 */
export function includePenaltyDueOnLastDueBucket(
  buckets: InstallmentBucket[],
  penaltyDue: number
): InstallmentBucket[] {
  if (!buckets.length) {
    return buckets;
  }
  const alreadyOnDueEmis = roundAmount(buckets.reduce((sum, bucket) => sum + (bucket.penalty || 0), 0));
  const shortfall = roundAmount(penaltyDue - alreadyOnDueEmis);
  if (shortfall <= 0.01) {
    return buckets;
  }
  return buckets.map((bucket, index) => {
    if (index !== buckets.length - 1) {
      return bucket;
    }
    return { ...bucket, penalty: roundAmount((bucket.penalty || 0) + shortfall) };
  });
}

function startOfDay(value: any): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (Array.isArray(value) && value.length >= 3) {
    return new Date(Number(value[0]), Number(value[1]) - 1, Number(value[2]));
  }
  return null;
}

function componentOutstanding(
  period: SchedulePeriod,
  outstandingField: keyof SchedulePeriod,
  dueField: keyof SchedulePeriod,
  paidField: keyof SchedulePeriod
): number {
  const explicit = period[outstandingField];
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    return roundAmount(Math.max(Number(explicit) || 0, 0));
  }
  return roundAmount(Math.max((Number(period[dueField]) || 0) - (Number(period[paidField]) || 0), 0));
}

function scheduledPrincipal(period: SchedulePeriod): number {
  return roundAmount(Number(period.principalOriginalDue ?? period.principalDue ?? 0));
}

function principalStillOutstanding(period: SchedulePeriod): number {
  return componentOutstanding(period, 'principalOutstanding', 'principalDue', 'principalPaid');
}

/**
 * A charge belongs to the installment whose principal it was calculated on.
 * Before any principal payment that is the scheduled principal. After a partial principal payment,
 * later days are calculated on the reduced outstanding principal, which no longer equals principalDue.
 */
function periodContainsChargeBase(base: number, period: SchedulePeriod): boolean {
  const scheduled = scheduledPrincipal(period);
  const outstanding = principalStillOutstanding(period);
  if (scheduled > 0.01 && Math.abs(base - scheduled) <= 0.02) {
    return true;
  }
  if (outstanding > 0.01 && Math.abs(base - outstanding) <= 0.02) {
    return true;
  }
  if (outstanding > 0.01 && base > outstanding + 0.02 && scheduled > base + 0.02) {
    return true;
  }
  // Fully paid installment: later days were calculated on a principal between zero and the scheduled amount.
  return outstanding <= 0.01 && base > 0.01 && scheduled > base + 0.02;
}

function chargeBelongsToPeriod(base: number, period: SchedulePeriod, periods: SchedulePeriod[]): boolean {
  if (!periodContainsChargeBase(base, period)) {
    return false;
  }
  const scheduled = scheduledPrincipal(period);
  const aTighterInstallmentAlsoContainsThisBase = periods.some((other) => {
    if (other === period || !periodContainsChargeBase(base, other)) {
      return false;
    }
    return scheduledPrincipal(other) + 0.02 < scheduled;
  });
  return !aTighterInstallmentAlsoContainsThisBase;
}

/** Installment number that owns an LPI charge, from the principal the charge was calculated on. */
export function installmentNumberForPenaltyCharge(
  charge: { penalty?: boolean; amountPercentageAppliedTo?: number } | null | undefined,
  periods: SchedulePeriod[] | undefined
): number | null {
  if (!charge?.penalty || !Array.isArray(periods) || !periods.length) {
    return null;
  }
  const base = roundAmount(Number(charge.amountPercentageAppliedTo || 0));
  if (base <= 0.01) {
    return null;
  }
  const realPeriods = periods.filter((period) => isRealScheduleInstallment(period));
  const owner = realPeriods.find((period) => chargeBelongsToPeriod(base, period, realPeriods));
  const installmentNumber = Number(owner?.period || 0);
  return installmentNumber > 0 ? installmentNumber : null;
}

function isPayablePenaltyCharge(charge: OverduePenaltyCharge, transactionDate: Date): boolean {
  if (!charge?.penalty || charge.waived) {
    return false;
  }
  if (roundAmount(Number(charge.amountOutstanding || 0)) <= 0.01) {
    return false;
  }
  const due = startOfDay(charge.dueDate);
  return !!due && due.getTime() < transactionDate.getTime();
}

function penaltyOwnedByPeriod(
  period: SchedulePeriod,
  periods: SchedulePeriod[],
  charges: OverduePenaltyCharge[],
  used: Set<OverduePenaltyCharge>
): number {
  if (scheduledPrincipal(period) <= 0.01 && principalStillOutstanding(period) <= 0.01) {
    return 0;
  }
  return roundAmount(
    charges
      .filter((charge) => {
        if (used.has(charge)) {
          return false;
        }
        const base = roundAmount(Number(charge.amountPercentageAppliedTo || 0));
        return base > 0.01 && chargeBelongsToPeriod(base, period, periods);
      })
      .reduce((sum, charge) => {
        used.add(charge);
        return sum + roundAmount(Number(charge.amountOutstanding || 0));
      }, 0)
  );
}

/**
 * Due installments (due on or before `transactionDate`) with each EMI's own unpaid LPI.
 * <p>
 * Daily LPI stays linked to the EMI whose principal it was calculated on, even when the schedule
 * column shows later days on the next period. A partial repayment clears the oldest EMI, in the
 * loan's repayment-strategy order, before the next EMI, so the buckets have to carry that split.
 */
export function buildDueInstallmentBuckets(params: {
  periods: SchedulePeriod[] | undefined;
  charges?: OverduePenaltyCharge[] | null;
  transactionDate: Date | null;
}): InstallmentBucket[] {
  const transactionDate = params.transactionDate;
  if (!transactionDate || !Array.isArray(params.periods) || !params.periods.length) {
    return [];
  }
  const selected = startOfDay(transactionDate);
  if (!selected) {
    return [];
  }
  const duePeriods = params.periods
    .filter((period) => isRealScheduleInstallment(period) && !period.complete)
    .filter((period) => {
      const due = startOfDay(period.dueDate);
      return !!due && due.getTime() <= selected.getTime();
    })
    .sort((left, right) => Number(left.period || 0) - Number(right.period || 0));
  if (!duePeriods.length) {
    return [];
  }

  const charges = Array.isArray(params.charges) ? params.charges : null;
  const payableCharges = charges ? charges.filter((charge) => isPayablePenaltyCharge(charge, selected)) : [];
  const usedCharges = new Set<OverduePenaltyCharge>();

  return duePeriods
    .map((period) => {
      const penalty =
        charges === null
          ? componentOutstanding(period, 'penaltyChargesOutstanding', 'penaltyChargesDue', 'penaltyChargesPaid')
          : penaltyOwnedByPeriod(period, duePeriods, payableCharges, usedCharges);
      return {
        period: Number(period.period || 0),
        penalty,
        fee: componentOutstanding(period, 'feeChargesOutstanding', 'feeChargesDue', 'feeChargesPaid'),
        tax: componentOutstanding(period, 'taxChargesOutstanding', 'taxChargesDue', 'taxChargesPaid'),
        interest: componentOutstanding(period, 'interestOutstanding', 'interestDue', 'interestPaid'),
        principal: componentOutstanding(period, 'principalOutstanding', 'principalDue', 'principalPaid')
      };
    })
    .filter((bucket) => bucket.penalty + bucket.fee + bucket.tax + bucket.interest + bucket.principal > 0.01);
}

/**
 * Waterfall allocation capped to as-of-date component totals.
 * Principal budget is remaining principal (all EMIs). Penalty/interest budgets come from
 * /template/penalties so waived LPI is not previewed.
 * <p>
 * `componentOrder` is the loan repayment strategy ({@link repaymentComponentOrder}). When omitted,
 * the order is penalty, fee, tax, interest, principal. When several installments are overdue,
 * Make Repayment uses {@link allocateOldestInstallmentFirst} so each installment is cleared in
 * that order before the next installment starts.
 */
export function allocateSettlement(
  amount: number,
  asOfDateComponents: SettlementComponents,
  buckets: InstallmentBucket[] = [],
  componentOrder: Array<keyof SettlementComponents> = WATERFALL_ORDER
): SettlementAllocation {
  const allocation: SettlementAllocation = {
    penalty: 0,
    fee: 0,
    tax: 0,
    interest: 0,
    principal: 0,
    unallocated: 0
  };
  let remaining = roundAmount(amount);
  if (remaining <= 0) {
    return allocation;
  }

  const budgets: SettlementComponents = {
    penalty: roundAmount(asOfDateComponents.penalty),
    fee: roundAmount(asOfDateComponents.fee),
    tax: roundAmount(asOfDateComponents.tax),
    interest: roundAmount(asOfDateComponents.interest),
    principal: roundAmount(asOfDateComponents.principal)
  };

  const apply = (key: keyof SettlementComponents, outstanding: number): void => {
    if (remaining <= 0 || outstanding <= 0) {
      return;
    }
    const applied = Math.min(remaining, roundAmount(outstanding));
    allocation[key] = roundAmount(allocation[key] + applied);
    remaining = roundAmount(remaining - applied);
    budgets[key] = roundAmount(budgets[key] - applied);
  };

  const order = componentOrder.length ? componentOrder : WATERFALL_ORDER;
  // Unmapped LPI (schedule parked it on a later row) is taken when the strategy reaches penalty.
  for (const key of order) {
    if (key === 'penalty') {
      const mappedPenalty = roundAmount(buckets.reduce((sum, bucket) => sum + roundAmount(bucket.penalty || 0), 0));
      apply('penalty', Math.max(roundAmount(budgets.penalty - mappedPenalty), 0));
    }
    for (const bucket of buckets) {
      if (remaining <= 0) {
        break;
      }
      apply(key, Math.min(roundAmount(bucket[key] || 0), budgets[key]));
    }
  }

  for (const key of order) {
    apply(key, budgets[key]);
  }

  allocation.unallocated = remaining;
  return allocation;
}

/**
 * Deduction preview when more than one installment is overdue.
 * The oldest installment is cleared first, in `componentOrder`, before the next installment.
 * A single installment delegates to {@link allocateSettlement}.
 */
export function allocateOldestInstallmentFirst(
  amount: number,
  asOfDateComponents: SettlementComponents,
  buckets: InstallmentBucket[] = [],
  componentOrder: Array<keyof SettlementComponents> = WATERFALL_ORDER
): SettlementAllocation {
  if (buckets.length <= 1) {
    return allocateSettlement(amount, asOfDateComponents, buckets, componentOrder);
  }

  const budgets: SettlementComponents = {
    penalty: roundAmount(asOfDateComponents.penalty),
    fee: roundAmount(asOfDateComponents.fee),
    tax: roundAmount(asOfDateComponents.tax),
    interest: roundAmount(asOfDateComponents.interest),
    principal: roundAmount(asOfDateComponents.principal)
  };
  const prepared = buckets.map((bucket) => ({
    penalty: roundAmount(bucket.penalty),
    fee: roundAmount(bucket.fee),
    tax: roundAmount(bucket.tax),
    interest: roundAmount(bucket.interest),
    principal: roundAmount(bucket.principal)
  }));
  const mappedPenalty = roundAmount(prepared.reduce((sum, bucket) => sum + bucket.penalty, 0));
  const unmappedPenalty = roundAmount(Math.max(budgets.penalty - mappedPenalty, 0));
  if (unmappedPenalty > 0.01) {
    const last = prepared[prepared.length - 1];
    last.penalty = roundAmount(last.penalty + unmappedPenalty);
  }

  const allocation: SettlementAllocation = {
    penalty: 0,
    fee: 0,
    tax: 0,
    interest: 0,
    principal: 0,
    unallocated: 0
  };
  let remaining = roundAmount(amount);
  const keys = componentOrder.length ? componentOrder : WATERFALL_ORDER;
  for (const bucket of prepared) {
    if (remaining <= 0.01) {
      break;
    }
    const slice = allocateSettlement(
      remaining,
      {
        penalty: Math.min(budgets.penalty, bucket.penalty),
        fee: Math.min(budgets.fee, bucket.fee),
        tax: Math.min(budgets.tax, bucket.tax),
        interest: Math.min(budgets.interest, bucket.interest),
        principal: Math.min(budgets.principal, bucket.principal)
      },
      [bucket],
      keys
    );
    for (const key of keys) {
      allocation[key] = roundAmount(allocation[key] + slice[key]);
      budgets[key] = roundAmount(Math.max(budgets[key] - slice[key], 0));
      remaining = roundAmount(remaining - slice[key]);
    }
  }
  if (remaining > 0.01) {
    const rest = allocateSettlement(remaining, budgets, [], keys);
    for (const key of keys) {
      allocation[key] = roundAmount(allocation[key] + rest[key]);
      remaining = roundAmount(remaining - rest[key]);
    }
    allocation.unallocated = rest.unallocated;
  }
  return allocation;
}

/**
 * Running balance of the last non-reversed savings transaction on or before `asOf`.
 * Falls back to the current available balance when there is no history (or asOf is missing).
 */
export function computeSavingsBalanceAsOf(
  transactions: Array<{
    date?: any;
    runningBalance?: number;
    reversed?: boolean;
    isReversal?: boolean;
    id?: number;
  }>,
  asOf: Date | null,
  toComparableDate: (value: any) => Date | null,
  fallbackBalance: number
): number {
  if (!asOf || !Array.isArray(transactions) || !transactions.length) {
    return roundAmount(fallbackBalance);
  }
  const selected = toComparableDate(asOf);
  if (!selected) {
    return roundAmount(fallbackBalance);
  }

  const eligible = transactions
    .filter((txn) => !txn.reversed && !txn.isReversal)
    .map((txn) => ({
      time: toComparableDate(txn.date)?.getTime() ?? null,
      runningBalance: Number(txn.runningBalance || 0),
      id: Number(txn.id || 0)
    }))
    .filter((txn) => txn.time !== null && (txn.time as number) <= selected.getTime())
    .sort((a, b) => (a.time as number) - (b.time as number) || a.id - b.id);

  if (!eligible.length) {
    return 0;
  }
  return roundAmount(eligible[eligible.length - 1].runningBalance);
}

export type EmiAmountCoverage = 'covered' | 'partial' | 'uncovered';

/**
 * Walks remaining EMIs in period order and marks which ones the entered amount covers.
 * Closing the loan marks every remaining EMI covered — remaining principal + as-of interest
 * is not the same as the sum of future scheduled EMI amounts.
 *
 * Chip amounts are scheduled P+I (plus fee/tax), not LPI. Penalty is allocated first in the
 * repayment waterfall, so {@code penaltyAllocated} is consumed before walking EMI amounts —
 * otherwise overdue LPI looks like a partial payment on the next EMI.
 */
export function applyEmiAmountCoverage<T extends { amount: number }>(
  emis: T[],
  amount: number,
  closesLoan: boolean,
  penaltyAllocated = 0
): Array<T & { coverage: EmiAmountCoverage }> {
  if (!Array.isArray(emis) || !emis.length) {
    return [];
  }
  if (closesLoan) {
    return emis.map((emi) => ({ ...emi, coverage: 'covered' as const }));
  }
  let remaining = Math.max(roundAmount((Number(amount) || 0) - (Number(penaltyAllocated) || 0)), 0);
  return emis.map((emi) => {
    const emiAmount = Number(emi.amount) || 0;
    if (remaining >= emiAmount - 0.01) {
      remaining = Math.max(roundAmount(remaining - emiAmount), 0);
      return { ...emi, coverage: 'covered' as const };
    }
    if (remaining > 0.01) {
      remaining = 0;
      return { ...emi, coverage: 'partial' as const };
    }
    return { ...emi, coverage: 'uncovered' as const };
  });
}
