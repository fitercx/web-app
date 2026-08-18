import { Component, Input } from '@angular/core';

export interface SettlementSummaryLine {
  label: string;
  amount: number;
}

export interface SettlementSummaryFootnote {
  text: string;
  tone?: 'default' | 'negative';
}

@Component({
  selector: 'mifosx-settlement-summary-card',
  templateUrl: './settlement-summary-card.component.html',
  styleUrls: ['./settlement-summary-card.component.scss']
})
export class SettlementSummaryCardComponent {
  @Input() currencySymbol = '';
  @Input() dateLabel = '';
  /** When set, replaces the default "Settlement as of …" eyebrow (e.g. "Payment allocation"). */
  @Input() eyebrow: string | null = null;
  @Input() totalAmount = 0;
  @Input() lines: SettlementSummaryLine[] = [];
  @Input() badge: string | null = null;
  /** Replaces default "Closes the loan" when set. */
  @Input() subtitle: string | null = null;
  @Input() footnotes: Array<string | SettlementSummaryFootnote> = [];
  @Input() ledgerToday = 0;
  @Input() ledgerDelta = 0;
  @Input() businessDateLabel = '';
  @Input() closesLoan = true;
  @Input() loading = false;

  footnoteText(note: string | SettlementSummaryFootnote): string {
    return typeof note === 'string' ? note : note.text;
  }

  footnoteTone(note: string | SettlementSummaryFootnote): 'default' | 'negative' {
    return typeof note === 'string' ? 'default' : note.tone || 'default';
  }

  get showLedgerFootnote(): boolean {
    return this.ledgerDelta > 0.01 && this.ledgerToday > 0.01 && !!this.businessDateLabel;
  }
}
