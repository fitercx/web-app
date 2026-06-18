import { Component, EventEmitter, Input, Output } from '@angular/core';

export type LoanDownloadType = 'repaymentSchedulePdf' | 'repaymentScheduleExcel' | 'accrualReport' | 'keyFactStatement';

@Component({
  selector: 'mifosx-loan-downloads-menu',
  templateUrl: './loan-downloads-menu.component.html',
  styleUrls: ['./loan-downloads-menu.component.scss']
})
export class LoanDownloadsMenuComponent {
  @Input() iconOnly = false;
  @Input() activeDownloadType: LoanDownloadType | null = null;
  @Input() disabled = false;
  @Input() kfsAvailable = true;
  @Input() kfsUnavailableTooltip = 'KFS not available for loans approved before the feature go-live date.';

  @Output() downloadSelected = new EventEmitter<LoanDownloadType>();

  selectDownload(type: LoanDownloadType): void {
    if (this.disabled || this.activeDownloadType) {
      return;
    }

    if (type === 'keyFactStatement' && !this.kfsAvailable) {
      return;
    }

    this.downloadSelected.emit(type);
  }
}
