import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'mifosx-account-details',
  templateUrl: './account-details.component.html',
  styleUrls: ['./account-details.component.scss']
})
export class AccountDetailsComponent {
  loanDetails: any;
  dataObject: {
    property: string;
    value: string;
  }[];

  constructor(private route: ActivatedRoute) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetails = data.loanDetailsData;
    });
  }

  /** Runtime DPD principal-only mode uses effective strategy from API; stored product strategy stays unchanged. */
  get isDpdPrincipalOnlyActive(): boolean {
    return !!this.loanDetails?.additionalProperties?.dpdPrincipalOnlyActive;
  }

  get displayRepaymentStrategyName(): string {
    if (this.isDpdPrincipalOnlyActive) {
      return (
        this.loanDetails?.additionalProperties?.effectiveRepaymentStrategyName ||
        this.loanDetails?.transactionProcessingStrategyName
      );
    }
    return this.loanDetails?.transactionProcessingStrategyName;
  }
}
