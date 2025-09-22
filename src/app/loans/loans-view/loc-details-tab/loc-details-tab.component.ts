/** Angular Imports */
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * LOC Details Tab Component
 */
@Component({
  selector: 'mifosx-loc-details-tab',
  templateUrl: './loc-details-tab.component.html',
  styleUrls: ['./loc-details-tab.component.scss']
})
export class LocDetailsTabComponent {
  /** Loan Details Data */
  loanDetailsData: any;
  /** LOC Details from additionalProperties */
  locDetails: any;

  /**
   * @param {ActivatedRoute} route Activated Route
   */
  constructor(private route: ActivatedRoute) {
    this.route.parent?.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetailsData = data.loanDetailsData;
      this.locDetails = data.loanDetailsData.additionalProperties;
    });
  }

  /**
   * Checks if the selected LOC type is receivable
   */
  get isReceivableType(): boolean {
    // This would need LOC product type information
    // For now, we'll check if receivable-specific fields exist
    return !!(
      this.locDetails?.approvedReceivableAmount !== undefined && this.locDetails?.approvedReceivableAmount !== null
    );
  }

  /**
   * Checks if the selected LOC type is payable
   */
  get isPayableType(): boolean {
    // This would need LOC product type information
    // For now, we'll check if payable-specific fields exist
    return !!(this.locDetails?.approvedPayableAmount !== undefined && this.locDetails?.approvedPayableAmount !== null);
  }
}
