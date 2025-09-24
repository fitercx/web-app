/** Angular Imports */
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';

/**
 * Create Loans Account Preview Step
 */
@Component({
  selector: 'mifosx-loans-account-preview-step',
  templateUrl: './loans-account-preview-step.component.html',
  styleUrls: ['./loans-account-preview-step.component.scss']
})
export class LoansAccountPreviewStepComponent implements OnChanges {
  /** Loans Account Template */
  @Input() loansAccountTemplate: any = [];
  /** Loans Account Product Template */
  @Input() loansAccountProductTemplate: any;
  /** Loans Account Data */
  @Input() loansAccount: any;
  /** active Client Members in case of GLIM Account */
  @Input() activeClientMembers?: any;

  /** Submit Loans Account */
  @Output() submitEvent = new EventEmitter();

  /** Charges Displayed Columns */
  chargesDisplayedColumns: string[] = [
    'name',
    'chargeCalculationType',
    'amount',
    'chargeTimeType',
    'date'
  ];
  /** Overdue Charges Displayed Columns */
  overdueChargesDisplayedColumns: string[] = [
    'name',
    'type',
    'amount',
    'collectedon'
  ];
  /** Columns to be displayed in active members table. */
  membersDisplayedColumns: string[] = [
    'id',
    'name',
    'purpose',
    'principal'
  ];

  /** Loan Purpose Options */
  loanPurposeOptions: any[] = [];

  /** Table Data Source */
  dataSource: any;
  productEnableDownPayment = false;

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    this.productEnableDownPayment = this.loansAccountProductTemplate.product.enableDownPayment;
    if (this.activeClientMembers) {
      this.loanPurposeOptions = this.loansAccountProductTemplate.loanPurposeOptions;
      this.dataSource = new MatTableDataSource<any>(
        this.activeClientMembers
          .filter((member: any) => member.selected)
          .map((member: any) => ({
            ...member,
            purpose: this.loanPurposeOptions.find((option) => option.id === member.loanPurposeId)?.name
          }))
      );
      this.loansAccount.principalAmount = this.activeClientMembers
        .filter((member: any) => member.selected)
        .reduce((acc: number, member: any) => acc + (member.principal ?? 0), 0);
    }

    // Ensure LOC amounts are synchronized in the preview data
    if (this.loansAccount && this.isLocEnabled()) {
      this.synchronizeLOCAmounts();
    }
  }

  /**
   * Checks if LOC is enabled based on loan account data
   */
  private isLocEnabled(): boolean {
    return !!(this.loansAccount.lineOfCreditId || this.loansAccount.invoiceNo || this.loansAccount.invoiceAmount);
  }

  /**
   * Ensures principal and invoice amounts are synchronized for LOC display
   */
  private synchronizeLOCAmounts(): void {
    const principalAmount = this.loansAccount.principalAmount;
    const invoiceAmount = this.loansAccount.invoiceAmount;

    // If both exist and are different, prioritize principal amount
    if (principalAmount != null && invoiceAmount != null && principalAmount !== invoiceAmount) {
      this.loansAccount.invoiceAmount = principalAmount;
    }
    // If only principal exists, set invoice amount
    else if (principalAmount != null && (invoiceAmount == null || invoiceAmount === '')) {
      this.loansAccount.invoiceAmount = principalAmount;
    }
    // If only invoice exists, set principal amount (fallback case)
    else if (invoiceAmount != null && (principalAmount == null || principalAmount === '')) {
      this.loansAccount.principalAmount = invoiceAmount;
    }
  }
}
