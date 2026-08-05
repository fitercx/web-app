import { Component, Input } from '@angular/core';
import { ForeclosureUnearnedInterestDetails } from 'app/loans/models/foreclosure-unearned-interest.model';

@Component({
  selector: 'mifosx-foreclosure-unearned-interest-banner',
  templateUrl: './foreclosure-unearned-interest-banner.component.html',
  styleUrls: ['./foreclosure-unearned-interest-banner.component.scss']
})
export class ForeclosureUnearnedInterestBannerComponent {
  @Input() details: ForeclosureUnearnedInterestDetails | null = null;
  @Input() currencyCode: string;

  expanded = false;

  get hasDetails(): boolean {
    return this.details != null && Number(this.details.unearnedInterest) > 0;
  }

  get isEarlyRepayment(): boolean {
    return this.details?.closureType === 'EARLY_REPAYMENT';
  }

  get titleKey(): string {
    return this.isEarlyRepayment
      ? 'labels.text.Unearned Interest due to Early Repayment'
      : 'labels.text.Unearned Interest due to Foreclosure';
  }

  get explanationKey(): string {
    return this.isEarlyRepayment
      ? 'labels.text.Unearned interest early repayment explanation'
      : 'labels.text.Unearned interest foreclosure explanation';
  }

  get paymentDateLabelKey(): string {
    return this.isEarlyRepayment ? 'labels.text.Repaid on' : 'labels.text.Foreclosed on';
  }

  get paymentDate(): number[] | string | null {
    return this.details?.paymentDate ?? this.details?.foreclosureDate ?? null;
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }
}
