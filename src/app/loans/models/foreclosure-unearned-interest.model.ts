export interface ForeclosureOriginalSchedulePeriod {
  installmentNumber: number;
  fromDate?: number[] | string;
  dueDate: number[] | string;
  principalDue: number;
  interestDue: number;
}

export interface ForeclosureScheduleActualOverlay {
  kind: 'original_only' | 'paid_as_scheduled' | 'closure_actual' | 'removed';
  actualDueDate?: number[] | string;
  actualPrincipalDue?: number;
  actualInterestDue?: number;
  actualEmiAmount?: number;
  actualTotalDue?: number;
  actualPaidDate?: number[] | string;
  actualAmountPaid?: number;
  actualPenaltyDue?: number;
  actualPenaltyPaid?: number;
  waivedInterest?: number;
}

export interface ForeclosureScheduleDisplayPeriod {
  period?: number | null;
  fromDate?: number[] | string;
  dueDate?: number[] | string;
  daysInPeriod?: number | null;
  principalDue?: number;
  principalOriginalDue?: number;
  interestDue?: number;
  interestOriginalDue?: number;
  totalDueForPeriod?: number;
  totalPaidForPeriod?: number;
  totalPaidInAdvanceForPeriod?: number;
  totalPaidLateForPeriod?: number;
  totalOutstandingForPeriod?: number;
  obligationsMetOnDate?: number[] | string | null;
  penaltyChargesDue?: number;
  penaltyChargesPaid?: number;
  penaltyChargesWaived?: number;
  reversedPenaltyChargesDue?: number;
  principalLoanBalanceOutstanding?: number;
  complete?: boolean;
  foreclosureDisplay?: ForeclosureScheduleActualOverlay;
}

export interface ForeclosureWaivedSchedulePeriod {
  installmentNumber: number;
  fromDate: number[] | string;
  dueDate: number[] | string;
  scheduledInterest: number;
  waivedInterest: number;
  paymentDate?: number[] | string;
  interestCharged?: number;
  periodDays?: number;
  interestChargedDays?: number;
  interestWaivedDays?: number;
}

export interface ForeclosureUnearnedInterestDetails {
  unearnedInterest: number;
  foreclosureDate: number[] | string;
  originalMaturityDate: number[] | string;
  remainingDays: number;
  removedInstallmentCount: number;
  originalScheduleInterest: number;
  interestCollected: number;
  waivedPeriods?: ForeclosureWaivedSchedulePeriod[] | null;
  originalSchedulePeriods?: ForeclosureOriginalSchedulePeriod[] | null;
  closureType?: 'EARLY_REPAYMENT' | 'FORECLOSURE' | string;
  paymentDate?: number[] | string;
  periodStartDate?: number[] | string;
  periodDays?: number;
  interestChargedDays?: number;
  interestWaivedDays?: number;
}
