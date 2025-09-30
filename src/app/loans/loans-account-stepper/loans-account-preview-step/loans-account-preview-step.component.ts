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
  }

  /**
   * Checks if the LOC type is receivable based on the locType flag
   */
  get isReceivableType(): boolean {
    return (
      this.loansAccount?.locType === 'RECEIVABLE' || this.loansAccount?.additionalProperties?.locType === 'RECEIVABLE'
    );
  }

  /**
   * Checks if the LOC type is payable based on the locType flag
   */
  get isPayableType(): boolean {
    return this.loansAccount?.locType === 'PAYABLE' || this.loansAccount?.additionalProperties?.locType === 'PAYABLE';
  }

  /**
   * Converts supplier/buyer detail IDs to their corresponding names
   */
  getSupplierBuyerNames(detailIds: any): string {
    if (!detailIds) return '';

    // Handle both array and single values
    const ids = Array.isArray(detailIds) ? detailIds : [detailIds];

    // Get the buyer/supplier options from the loan account data
    const options =
      this.loansAccount?.buyerSupplierOptions || this.loansAccount?.additionalProperties?.buyerSupplierOptions || [];

    // Map IDs to names
    const names = ids
      .map((id: any) => {
        const option = options.find((opt: any) => opt.id === id);
        return option ? option.name : id; // Fallback to ID if name not found
      })
      .filter((name: any) => name); // Remove empty values

    return names.join(', ');
  }
}
