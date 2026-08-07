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
  closureType?: 'EARLY_REPAYMENT' | 'FORECLOSURE' | string;
  paymentDate?: number[] | string;
  periodStartDate?: number[] | string;
  periodDays?: number;
  interestChargedDays?: number;
  interestWaivedDays?: number;
}
