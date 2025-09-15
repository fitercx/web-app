/**
 * TypeScript interfaces for Credit Line (LOC) related data structures
 */

// Generic status interface (previously ActivationStatus)
export interface CreditLineStatus {
  id: number;
  code: string;
  value: string;
}

export interface LoanStatus {
  id: number;
  code: string;
  value: string;
  pendingApproval: boolean;
  waitingForDisbursal: boolean;
  active: boolean;
  closedObligationsMet: boolean;
  closedWrittenOff: boolean;
  closedRescheduled: boolean;
  closed: boolean;
  overpaid: boolean;
}

export interface CreditLineLoan {
  id: number;
  accountNo: string;
  productName: string;
  status: LoanStatus;
  inArrears: boolean;
  originalLoan: number;
  loanBalance: number;
  activatedOnDate?: number[];
  nextRepaymentDate?: number[];
}

export interface CreditLineDetails {
  id: number;
  name: string;
  productType: string;
  maximumAmount: number;
  availableBalance: number;
  consumedAmount: number;
  status: CreditLineStatus; // renamed from activationStatus
  statusId?: number; // renamed from activationStatusId
  externalId?: string;
  currency?: string;
  clientCompanyName?: string;
  clientContactPersonName?: string;
  clientContactPersonPhone?: string;
  clientContactPersonEmail?: string;
  authorizedSignatoryName?: string;
  authorizedSignatoryPhone?: string;
  authorizedSignatoryEmail?: string;
  va?: string;
  specialConditions?: string;
  createdDate?: number[];
  lastModifiedDate?: number[];
}

export interface CreditLineResponse {
  lineOfCredit: any; // raw backend LOC object (may still use activationStatus during transition)
  loans: CreditLineLoan[];
}

export interface CreditLineTableData {
  id: number;
  name: string;
  accountNo: string;
  creditLimit: number;
  availableBalance: number;
  outstanding: number;
  type: string;
  utilization: number;
  status: string;
  statusCode: string;
  currency?: string;
  clientCompanyName?: string;
  clientContactPersonName?: string;
  clientContactPersonPhone?: string;
  clientContactPersonEmail?: string;
  authorizedSignatoryName?: string;
  authorizedSignatoryPhone?: string;
  authorizedSignatoryEmail?: string;
  va?: string;
  specialConditions?: string;
  loans: ProcessedLoanData[];
}

export interface ProcessedLoanData {
  id: number;
  accountNo: string;
  productName: string;
  status: LoanStatus;
  inArrears: boolean;
  originalLoan: number;
  loanBalance: number;
  activatedOnDate?: number[];
  nextRepaymentDate?: number[];
}
