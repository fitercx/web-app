import { LoanTransactionType } from 'app/loans/models/loan-transaction-type.model';
import { Currency } from 'app/shared/models/general.model';

export interface LoanTransaction {
  id: number;
  loanId: number;
  officeId: number;
  officeName: string;
  type: LoanTransactionType;
  date: number[];
  currency: Currency;
  amount: number;
  netDisbursalAmount: number;
  principalPortion: number;
  interestPortion: number;
  feeChargesPortion: number;
  penaltyChargesPortion: number;
  taxChargesPortion: number;
  overpaymentPortion: number;
  unrecognizedIncomePortion: number;
  externalId: string;
  outstandingLoanBalance: number;
  submittedOnDate: number[];
  /**
   * True when the transaction has been reversed by any mechanism
   * (manual undo or system-driven reversal).
   *
   * This mirrors the backend `reversed` flag.
   */
  reversed?: boolean;
  /**
   * True when the transaction has been reversed using the explicit
   * "undo" command from the UI.
   */
  manuallyReversed: boolean;
  loanChargePaidByList: any[];
  numberOfRepayments: number;
  transactionRelations: any[];
}
