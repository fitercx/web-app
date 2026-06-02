import { Component, EventEmitter, Input, Output } from '@angular/core';

export type LoanDownloadType = 'repaymentSchedulePdf' | 'repaymentScheduleExcel' | 'accrualReport';

@Component({
  selector: 'mifosx-loan-downloads-menu',
  templateUrl: './loan-downloads-menu.component.html',
  styleUrls: ['./loan-downloads-menu.component.scss']
})
export class LoanDownloadsMenuComponent {
  @Input() iconOnly = false;
  @Input() activeDownloadType: LoanDownloadType | null = null;
  @Input() disabled = false;

  @Output() downloadSelected = new EventEmitter<LoanDownloadType>();

  readonly downloadItems: { type: LoanDownloadType; label: string; icon: string }[] = [
    { type: 'repaymentSchedulePdf', label: 'Repayment Schedule (PDF)', icon: 'file-pdf' },
    { type: 'repaymentScheduleExcel', label: 'Repayment Schedule (Excel)', icon: 'file-excel' },
    { type: 'accrualReport', label: 'Accrual Report', icon: 'file-alt' }
  ];

  selectDownload(type: LoanDownloadType, event: MouseEvent): void {
    event.stopPropagation();
    if (this.disabled || this.activeDownloadType) {
      return;
    }
    this.downloadSelected.emit(type);
  }
}
