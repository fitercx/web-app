import { Component, Input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import { LoanStatus } from 'app/loans/models/loan-status.model';
import { SettingsService } from 'app/settings/settings.service';
import { ConfirmationDialogComponent } from 'app/shared/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'mifosx-reschedule-loan-tab',
  templateUrl: './reschedule-loan-tab.component.html',
  styleUrls: ['./reschedule-loan-tab.component.scss']
})
export class RescheduleLoanTabComponent {
  @Input() loanStatus: LoanStatus;

  loanRescheduleData: any[] = [];
  loanRescheduleDataColumns: string[] = [
    'id',
    'rescheduleFromDate',
    'rescheduleTo',
    'reason',
    'status',
    'graceOnPrincipal',
    'graceOnInterest',
    'extendRepaymentPeriod',
    'interestRateForInstallment',
    'actions'
  ];
  clientId: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private loansServices: LoansService,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private translateService: TranslateService,
    private dialog: MatDialog
  ) {
    this.clientId = this.route.parent.parent.snapshot.paramMap.get('clientId');
    this.route.parent.data.subscribe((data: { loanRescheduleData: any; loanDetailsData: any }) => {
      this.loanRescheduleData = data.loanRescheduleData || [];
    });
  }

  /**
   * Formats term type for display
   */
  formatTermType(termType: any): string {
    if (!termType) return '-';

    // Convert camelCase/snake_case to human readable format
    let readable = termType.value || termType.code || '';

    // Handle specific mappings for better readability
    const termTypeMap: { [key: string]: string } = {
      graceOnPrincipal: 'Grace On Principal',
      graceOnInterest: 'Grace On Interest',
      extendRepaymentPeriod: 'Extend Repayment Period',
      interestRateForInstallment: 'Interest Rate For Installment',
      emiAmount: 'EMI Amount',
      interestRate: 'Interest Rate',
      principalAmount: 'Principal Amount',
      deleteInstallment: 'Delete Installment',
      insertInstallment: 'Insert Installment',
      dueDate: 'Due Date'
    };

    return (
      termTypeMap[readable] ||
      readable
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str: string) => str.toUpperCase())
        .trim()
    );
  }

  /**
   * Formats the applicable from date array to readable date
   */
  formatApplicableFromDate(dateArray: number[]): string {
    if (!dateArray || dateArray.length < 3) return '-';
    const [
      year,
      month,
      day
    ] = dateArray;
    const date = new Date(year, month - 1, day);
    return this.dateUtils.formatDate(date, this.settingsService.dateFormat);
  }

  /**
   * Gets reschedule to date from loan term variations
   */
  getRescheduleToDate(item: any): string {
    const termVariations = this.getTermVariationsForItem(item);
    if (!termVariations || termVariations.length === 0) return '-';

    // Find the dueDate term variation
    const dueDateVariation = termVariations.find(
      (variation) => variation.termType && variation.termType.code === 'loanTermType.dueDate'
    );

    if (dueDateVariation && dueDateVariation.dateValue) {
      return this.formatApplicableFromDate(dueDateVariation.dateValue);
    }

    return '-';
  }

  /**
   * Gets term variations for a specific reschedule item
   */
  getTermVariationsForItem(item: any): any[] {
    return item.loanTermVariationsData || [];
  }

  /**
   * Gets all unique term variations from all reschedule items for summary display
   */
  getAllTermVariations(): any[] {
    const allVariations: any[] = [];
    this.loanRescheduleData.forEach((rescheduleItem) => {
      if (rescheduleItem.loanTermVariationsData) {
        allVariations.push(...rescheduleItem.loanTermVariationsData);
      }
    });
    return allVariations;
  }

  /**
   * Gets the value for a specific term type variation
   */
  getVariationValue(item: any, termTypeToFind: string): string {
    const variations = this.getTermVariationsForItem(item);
    const variation = variations.find((v) => {
      const termType = v.termType?.value || v.termType?.code || v.termType || '';
      return termType === termTypeToFind;
    });
    return variation ? variation.decimalValue || '0' : '-';
  }

  /**
   * Gets Grace On Principal value
   */
  getGraceOnPrincipal(item: any): string {
    return this.getVariationValue(item, 'graceOnPrincipal');
  }

  /**
   * Gets Grace On Interest value
   */
  getGraceOnInterest(item: any): string {
    return this.getVariationValue(item, 'graceOnInterest');
  }

  /**
   * Gets Extend Repayment Period value
   */
  getExtendRepaymentPeriod(item: any): string {
    return this.getVariationValue(item, 'extendRepaymentPeriod');
  }

  /**
   * Gets Interest Rate For Installment value
   */
  getInterestRateForInstallment(item: any): string {
    return this.getVariationValue(item, 'interestRateForInstallment');
  }

  manageRequest(request: any, command: string): void {
    const approveLoanRescheduleDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: `${command}` + this.translateService.instant('labels.heading.Loan Reschedule'),
        dialogContext:
          this.translateService.instant('labels.dialogContext.Are you sure you want') +
          `${command}` +
          this.translateService.instant('labels.dialogContext.the Loan Reschedule') +
          `${request.id}`
      }
    });
    approveLoanRescheduleDialogRef.afterClosed().subscribe((response: { confirm: any }) => {
      if (response.confirm) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;
        const payload: any = {
          dateFormat,
          locale
        };
        if (command === 'Approve') {
          payload.approvedOnDate = this.dateUtils.formatDate(this.settingsService.businessDate, dateFormat);
        } else {
          payload.rejectedOnDate = this.dateUtils.formatDate(this.settingsService.businessDate, dateFormat);
        }
        this.loansServices
          .applyCommandLoanRescheduleRequests(request.id, command.toLowerCase(), payload)
          .subscribe((result: any) => {
            this.reload();
          });
      }
    });
  }

  /**
   * Refetches data fot the component
   */
  private reload() {
    const url: string = this.router.url;
    this.router
      .navigateByUrl(`/clients/${this.clientId}/loans-accounts`, { skipLocationChange: true })
      .then(() => this.router.navigate([url]));
  }
}
