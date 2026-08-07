import {
  ForeclosureUnearnedInterestDetails,
  ForeclosureWaivedSchedulePeriod
} from 'app/loans/models/foreclosure-unearned-interest.model';

type DateLike = number[] | string | null | undefined;

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function toDateParts(value: DateLike): [number, number, number] | null {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value) && value.length >= 3) {
    return [
      value[0],
      value[1],
      value[2]
    ];
  }
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      return [
        Number(match[1]),
        Number(match[2]),
        Number(match[3])];
    }
  }
  return null;
}

/** Calendar days between two Fineract dates (matches Java ChronoUnit.DAYS.between). */
export function daysBetweenDates(from: DateLike, to: DateLike): number | null {
  const fromParts = toDateParts(from);
  const toParts = toDateParts(to);
  if (!fromParts || !toParts) {
    return null;
  }
  const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
  return Math.round((toUtc - fromUtc) / 86400000);
}

function findSchedulePeriod(loanDetails: any, installmentNumber: number): any | null {
  const periods = loanDetails?.repaymentSchedule?.periods ?? [];
  return periods.find((period: any) => period?.period === installmentNumber) ?? null;
}

function enrichWaivedPeriodFromSchedule(
  period: ForeclosureWaivedSchedulePeriod,
  schedulePeriod: any | null
): ForeclosureWaivedSchedulePeriod {
  if (!schedulePeriod) {
    return period;
  }

  const enriched: ForeclosureWaivedSchedulePeriod = { ...period };
  const fromDate = enriched.fromDate ?? schedulePeriod.fromDate;
  const dueDate = enriched.dueDate ?? schedulePeriod.dueDate;

  if (!enriched.paymentDate && schedulePeriod.obligationsMetOnDate) {
    enriched.paymentDate = schedulePeriod.obligationsMetOnDate;
  }

  if (!isPresent(enriched.interestCharged)) {
    enriched.interestCharged =
      schedulePeriod.interestDue ?? schedulePeriod.interestPaid ?? schedulePeriod.interestOriginalDue;
  }

  if (!isPresent(enriched.periodDays)) {
    enriched.periodDays = schedulePeriod.daysInPeriod ?? daysBetweenDates(fromDate, dueDate) ?? undefined;
  }

  if (!isPresent(enriched.interestChargedDays) && fromDate && enriched.paymentDate) {
    enriched.interestChargedDays = daysBetweenDates(fromDate, enriched.paymentDate) ?? undefined;
  }

  if (
    !isPresent(enriched.interestWaivedDays) &&
    isPresent(enriched.periodDays) &&
    isPresent(enriched.interestChargedDays)
  ) {
    enriched.interestWaivedDays = Math.max(Number(enriched.periodDays) - Number(enriched.interestChargedDays), 0);
  }

  return enriched;
}

function enrichEarlyRepaymentDetailsFromSchedule(
  details: ForeclosureUnearnedInterestDetails,
  loanDetails: any
): ForeclosureUnearnedInterestDetails {
  if (details.closureType !== 'EARLY_REPAYMENT' || !details.waivedPeriods?.length) {
    return details;
  }

  const waivedPeriods = details.waivedPeriods.map((period) =>
    enrichWaivedPeriodFromSchedule(period, findSchedulePeriod(loanDetails, period.installmentNumber))
  );
  const firstPeriod = waivedPeriods[0];

  return {
    ...details,
    waivedPeriods,
    paymentDate: details.paymentDate ?? firstPeriod?.paymentDate ?? details.foreclosureDate,
    periodStartDate: details.periodStartDate ?? firstPeriod?.fromDate,
    periodDays: details.periodDays ?? firstPeriod?.periodDays,
    interestChargedDays: details.interestChargedDays ?? firstPeriod?.interestChargedDays,
    interestWaivedDays: details.interestWaivedDays ?? firstPeriod?.interestWaivedDays,
    interestCollected: details.interestCollected ?? firstPeriod?.interestCharged
  };
}

/** Original scheduled interest per installment (from snapshot), for early-repayment display. */
export function buildOriginalInterestByInstallment(
  details: ForeclosureUnearnedInterestDetails | null
): Map<number, number> {
  const map = new Map<number, number>();
  if (details?.closureType !== 'EARLY_REPAYMENT') {
    return map;
  }
  for (const period of details.waivedPeriods ?? []) {
    if (period.installmentNumber != null && period.scheduledInterest != null) {
      map.set(period.installmentNumber, Number(period.scheduledInterest));
    }
  }
  return map;
}

export function getDisplayInterestForPeriod(
  item: { period?: number; interestOriginalDue?: number; interestDue?: number },
  originalByInstallment: Map<number, number>
): number {
  if (item?.period != null && originalByInstallment.has(item.period)) {
    return originalByInstallment.get(item.period)!;
  }
  return Number(item?.interestOriginalDue ?? item?.interestDue ?? 0);
}

export function getDisplayTotalScheduledInterest(
  details: ForeclosureUnearnedInterestDetails | null,
  totalInterestCharged: number
): number {
  if (details?.closureType === 'EARLY_REPAYMENT' && details.originalScheduleInterest != null) {
    return Number(details.originalScheduleInterest);
  }
  return totalInterestCharged;
}

export function getForeclosureUnearnedInterestDetails(loanDetails: any): ForeclosureUnearnedInterestDetails | null {
  const details = loanDetails?.additionalProperties?.foreclosureUnearnedInterestDetails;
  if (details && Number(details.unearnedInterest) > 0) {
    return enrichEarlyRepaymentDetailsFromSchedule(details as ForeclosureUnearnedInterestDetails, loanDetails);
  }

  const legacyAmount = loanDetails?.additionalProperties?.unearnedInterestDueToForeclosure;
  if (legacyAmount == null) {
    return null;
  }

  const unearnedInterest = Number(legacyAmount);
  if (!Number.isFinite(unearnedInterest) || unearnedInterest <= 0) {
    return null;
  }

  // Legacy fallback only — do NOT use summary.interestCharged; after foreclosure it equals interest paid,
  // not the original schedule total, and makes original vs collected look misleadingly equal.
  return {
    unearnedInterest,
    foreclosureDate: loanDetails?.timeline?.closedOnDate,
    originalMaturityDate: loanDetails?.timeline?.expectedMaturityDate,
    remainingDays: null,
    removedInstallmentCount: null,
    originalScheduleInterest: null,
    interestCollected: null,
    waivedPeriods: null
  };
}
