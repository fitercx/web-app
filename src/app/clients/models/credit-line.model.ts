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
  interestRate?: number;
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

/**
 * Interface for approved buyers/suppliers in Line of Credit
 */
export interface ApprovedBuyer {
  code: string; // Required: Unique identifier for the buyer/supplier
  name: string; // Required: Display name of the buyer/supplier
  externalId?: string; // Optional: External system reference
}

/**
 * Request interface for managing approved buyers API
 */
export interface ManageApprovedBuyersRequest {
  approvedBuyers: ApprovedBuyer[];
  locale: string; // e.g., "en"
  dateFormat: string; // e.g., "yyyy-MM-dd"
}

/**
 * Response interface from managing approved buyers API
 */
export interface ManageApprovedBuyersResponse {
  resourceId: number; // The Line of Credit ID
  changes: {
    approvedBuyers: ApprovedBuyer[]; // The new list of approved buyers
  };
}

/**
 * Error response interface from API
 */
export interface ApiErrorResponse {
  developerMessage: string;
  userMessage: string;
  httpStatusCode?: number;
  defaultUserMessage?: string;
}

/**
 * Dialog data interface for ManageApprovedBuyersDialog
 */
export interface ManageApprovedBuyersDialogData {
  clientId: string;
  lineOfCreditId: string;
  currentBuyers: ApprovedBuyer[];
  locType: 'RECEIVABLE' | 'PAYABLE';
  isActive: boolean;
}
