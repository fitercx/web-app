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

  /** True while the loan is running on the strategy the DPD auto-switch put it on, rather than its product strategy. */
  get isDpdStrategySwitchActive(): boolean {
    return !!this.loanDetails?.additionalProperties?.dpdStrategySwitchActive;
  }

  get dpdStrategySwitchTooltip(): string {
    const properties = this.loanDetails?.additionalProperties;
    if (!properties) {
      return '';
    }
    const parts = [
      `This loan was switched automatically because it is ${properties.dpdStrategySwitchMaxDpd} days past due` +
        ` (threshold ${properties.dpdStrategySwitchThreshold} days).`
    ];
    if (properties.dpdStrategySwitchOriginalStrategyName) {
      parts.push(
        `It will switch back to "${properties.dpdStrategySwitchOriginalStrategyName}" once it is no longer past the threshold.`
      );
    }
    return parts.join(' ');
  }
}
