import { Component, Input } from '@angular/core';

export type SettlementOverpaymentContext = 'make-repayment' | 'foreclosure';

/**
 * Prominent warning when a settlement amount exceeds what the backend can absorb
 * (loan moves to Overpaid instead of Closed).
 */
@Component({
  selector: 'mifosx-settlement-overpayment-banner',
  templateUrl: './settlement-overpayment-banner.component.html',
  styleUrls: ['./settlement-overpayment-banner.component.scss']
})
export class SettlementOverpaymentBannerComponent {
  @Input() context: SettlementOverpaymentContext = 'make-repayment';
  @Input() currencyLabel = '';
  @Input() settlementCapWithoutOverpay = 0;
  @Input() projectedOverpaymentAmount = 0;
  @Input() outcomeNotice: string | null = null;
  @Input() showOutcomeNotice = false;

  get visible(): boolean {
    return this.projectedOverpaymentAmount > 0.01;
  }

  get contextTitle(): string {
    return this.context === 'foreclosure' ? 'Foreclosure' : 'Make Repayment';
  }

  get amountDescriptor(): string {
    return this.context === 'foreclosure' ? 'quoted foreclosure total' : 'entered amount';
  }

  get transactionDescriptor(): string {
    return this.context === 'foreclosure' ? 'foreclosure' : 'repayment';
  }

  get submitNote(): string {
    if (this.context === 'foreclosure') {
      return 'Submit stays enabled — excess may be refunded to linked savings after closure.';
    }
    return 'This is a standard repayment transaction, not Early Closure / Foreclosure. Submit stays enabled.';
  }
}
