// Interface for loan product details form data including LOC fields
export interface LoanProductDetailsFormData {
  name: string;
  shortName: string;
  description?: string;
  externalId?: string;
  fundId?: number;
  startDate?: string;
  closeDate?: string;
  includeInBorrowerCycle: boolean;
  enableLineOfCredit?: boolean;
  locProductType?: string; // PAYABLE | RECEIVABLE
  maxDrawdownsPerDay?: number;
}
