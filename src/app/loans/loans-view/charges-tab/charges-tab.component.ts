/** Angular Imports */
import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Custom Services */
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';

/** Custom Dialogs */
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { ConfirmationDialogComponent } from 'app/shared/confirmation-dialog/confirmation-dialog.component';
import { BulkWaiveChargesDialogComponent } from '../custom-dialogs/bulk-waive-charges-dialog/bulk-waive-charges-dialog.component';

/** Custom Models */
import { FormfieldBase } from 'app/shared/form-dialog/formfield/model/formfield-base';
import { InputBase } from 'app/shared/form-dialog/formfield/model/input-base';
import { DatepickerBase } from 'app/shared/form-dialog/formfield/model/datepicker-base';
import { Dates } from 'app/core/utils/dates';
import { SystemService } from 'app/system/system.service';
import { GlobalConfiguration } from 'app/system/configurations/global-configurations-tab/configuration.model';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'mifosx-charges-tab',
  templateUrl: './charges-tab.component.html',
  styleUrls: ['./charges-tab.component.scss']
})
export class ChargesTabComponent implements OnInit {
  /** Loan Details Data */
  loanDetails: any;
  /** Charges Data */
  chargesData: any;
  /** Status */
  status: any;
  /** True when the loan is closed — charge history is view-only, no actions. */
  isReadOnlyView = false;
  /** Columns to be displayed in charges table. */
  displayedColumns: string[] = [];
  private readonly editableColumns: string[] = [
    'name',
    'feepenalty',
    'paymentdueat',
    'dueDate',
    'calculationtype',
    'due',
    'paid',
    'waived',
    'outstanding',
    'status',
    'actions'
  ];
  private readonly readOnlyColumns: string[] = [
    'name',
    'feepenalty',
    'paymentdueat',
    'dueDate',
    'calculationtype',
    'due',
    'paid',
    'waived',
    'outstanding',
    'status'
  ];
  /** Data source for charges table. */
  dataSource: MatTableDataSource<any>;

  useDueDate = true;

  /** Paginator for charges table. */
  @ViewChild(MatPaginator, { static: true }) paginator: MatPaginator;
  /** Sorter for charges table. */
  @ViewChild(MatSort, { static: true }) sort: MatSort;

  /**
   * Retrieves the loans data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private loansService: LoansService,
    private route: ActivatedRoute,
    private dateUtils: Dates,
    private router: Router,
    private translateService: TranslateService,
    public dialog: MatDialog,
    private settingsService: SettingsService,
    private systemService: SystemService,
    private snackBar: MatSnackBar
  ) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetails = data.loanDetailsData;
    });
  }

  ngOnInit() {
    this.systemService.getConfigurationByName('charge-accrual-date').subscribe((config: GlobalConfiguration) => {
      this.useDueDate = config.stringValue === 'due-date';
    });
    this.status = this.loanDetails.status.value;
    this.isReadOnlyView = !!this.loanDetails?.status?.closed;
    this.displayedColumns = this.isReadOnlyView ? [...this.readOnlyColumns] : [...this.editableColumns];

    this.loadCharges();
  }

  /** Loads all charges (including paid/waived history) from the dedicated charges API. */
  private loadCharges(): void {
    this.loansService.getLoanAccountCharges(this.loanDetails.id).subscribe({
      next: (data: any) => {
        const charges = Array.isArray(data) ? data : this.loanDetails.charges || [];
        this.initializeCharges(charges);
      },
      error: () => {
        this.initializeCharges(this.loanDetails.charges || []);
      }
    });
  }

  private initializeCharges(charges: any[]) {
    const loanStatusAllowsChargeActions = this.status === 'Active' || this.status === 'Overpaid';
    this.chargesData = charges || [];
    this.chargesData.forEach((element: any) => {
      if (element.chargeTimeType.value === 'Disbursement') {
        element.dueDate = this.loanDetails.timeline.actualDisbursementDate;
      }
      element.dueDate = this.dateUtils.parseDate(element.dueDate);
      const isReversed =
        !element.paid &&
        !element.waived &&
        element.amountPaid > 0 &&
        element.amountOutstanding === 0 &&
        element.amountWrittenOff === 0;
      element.isReversed = isReversed;
      const nothingOutstanding = Number(element.amountOutstanding || 0) === 0;
      let actionFlag = true;
      if (
        !this.isReadOnlyView &&
        !isReversed &&
        !element.paid &&
        !element.waived &&
        !nothingOutstanding &&
        element.chargeTimeType.value !== 'Disbursement' &&
        loanStatusAllowsChargeActions
      ) {
        actionFlag = false;
      }
      element.actionFlag = actionFlag;
    });
    this.chargesData = this.chargesData.sort(function (a: any, b: any) {
      return b.dueDate - a.dueDate;
    });
    this.dataSource = new MatTableDataSource(this.chargesData);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /** Human-readable charge settlement status for read-only closed-loan view. */
  chargeStatusLabel(charge: any): string {
    if (charge.isReversed) {
      return 'Reversed';
    }
    if (charge.waived || Number(charge.amountWaived || 0) >= Number(charge.amount || 0)) {
      return 'Waived';
    }
    if (charge.paid || (Number(charge.amountOutstanding || 0) === 0 && Number(charge.amountPaid || 0) > 0)) {
      return 'Paid';
    }
    if (Number(charge.amountWaived || 0) > 0 && Number(charge.amountOutstanding || 0) > 0) {
      return 'Partially waived';
    }
    if (Number(charge.amountPaid || 0) > 0 && Number(charge.amountOutstanding || 0) > 0) {
      return 'Partially paid';
    }
    return 'Outstanding';
  }

  chargeStatusClass(charge: any): string {
    return `charge-status--${this.chargeStatusLabel(charge).toLowerCase().replace(/\s+/g, '-')}`;
  }

  /**
   * Asjust the Loan charge.
   * @param {any} chargeId Charge Id
   */
  adjustCharge(chargeId: string) {
    this.router.navigate([`${chargeId}/adjustment`], { relativeTo: this.route });
  }

  /**
   * Pays the charge.
   * @param {any} chargeId Charge Id
   */
  payCharge(chargeId: any) {
    const formfields: FormfieldBase[] = [
      new DatepickerBase({
        controlName: 'transactionDate',
        label: 'Payment Date',
        value: '',
        type: 'date',
        required: true
      })

    ];
    const data = {
      title: `Pay Charge ${chargeId}`,
      layout: { addButtonText: 'Confirm' },
      formfields: formfields
    };
    const payChargeDialogRef = this.dialog.open(FormDialogComponent, { data });
    payChargeDialogRef.afterClosed().subscribe((response: any) => {
      if (response.data) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;
        const prevTransactionDate: Date = response.data.value.transactionDate;
        const dataObject = {
          transactionDate: this.dateUtils.formatDate(prevTransactionDate, dateFormat),
          dateFormat,
          locale
        };
        this.loansService
          .executeLoansAccountChargesCommand(this.loanDetails.id, 'pay', dataObject, chargeId)
          .subscribe(() => {
            this.reload();
          });
      }
    });
  }

  /**
   * Waive's the charge
   * @param {any} chargeId Charge Id
   */
  waiveCharge(chargeId: any) {
    const waiveChargeDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: this.translateService.instant('labels.heading.Waive Charge'),
        dialogContext: `${this.translateService.instant('labels.dialogContext.Are you sure you want to waive charge with id:')} ${chargeId}`,
        type: 'Basic'
      }
    });
    waiveChargeDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        this.loansService
          .executeLoansAccountChargesCommand(this.loanDetails.id, 'waive', {}, chargeId)
          .subscribe(() => {
            this.reload();
          });
      }
    });
  }

  /**
   * Edits the charge
   * @param {any} charge Charge
   */
  editCharge(charge: any) {
    const formfields: FormfieldBase[] = [
      new InputBase({
        controlName: 'amount',
        label: 'Amount',
        value: charge.amount || charge.amountOrPercentage,
        type: 'number',
        required: true
      })

    ];
    const data = {
      title: `Edit Charge ${charge.id}`,
      layout: { addButtonText: 'Confirm' },
      formfields: formfields
    };
    const editChargeDialogRef = this.dialog.open(FormDialogComponent, { data });
    editChargeDialogRef.afterClosed().subscribe((response: any) => {
      if (response.data) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;
        const dataObject = {
          ...response.data.value,
          dateFormat,
          locale
        };
        this.loansService.editLoansAccountCharge(this.loanDetails.id, dataObject, charge.id).subscribe(() => {
          this.reload();
        });
      }
    });
  }

  /**
   * Undoes a paid charge
   * @param {any} charge Charge object
   */
  undoPaidCharge(charge: any) {
    const undoChargeDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: this.translateService.instant('labels.heading.Undo Paid Charge'),
        dialogContext:
          this.translateService.instant('labels.dialogContext.Are you sure you want to undo the paid charge') +
          ` "${charge.name}" (ID: ${charge.id})?`,
        type: 'Dangerous',
        additionalNotes: this.translateService.instant(
          'labels.text.This action will reverse the payment transaction and GL entries for this charge. The charge will be reset to unpaid status. This action will be recorded in the audit trail.'
        )
      }
    });

    undoChargeDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;
        const dataObject = {
          note: `Reversed paid charge: ${charge.name}`,
          dateFormat,
          locale
        };

        this.loansService
          .executeLoansAccountChargesCommand(this.loanDetails.id, 'reversePaid', dataObject, charge.id)
          .subscribe({
            next: (response: any) => {
              // Debug: Log the response to see its structure
              console.log('Reverse charge response:', response);

              // Get savings account number from response or loan details
              let savingsAccountNo = '';

              // Try multiple ways to get the account number from response
              if (response?.changes?.savingsAccountNo) {
                savingsAccountNo = response.changes.savingsAccountNo;
              } else if (response?.savingsAccountNo) {
                savingsAccountNo = response.savingsAccountNo;
              } else if (this.loanDetails.additionalAttributes?.linkedSavingsAccountAccountNo) {
                savingsAccountNo = this.loanDetails.additionalAttributes.linkedSavingsAccountAccountNo;
              }

              console.log('Savings account number found:', savingsAccountNo);

              // Show success message
              let message = 'Charge reversed to the associated savings accounts';
              if (savingsAccountNo) {
                message += `: ${savingsAccountNo}`;
              } else {
                message += '.';
              }

              this.snackBar.open(message, 'Close', {
                duration: 7000,
                horizontalPosition: 'right',
                verticalPosition: 'top',
                panelClass: ['success-snackbar']
              });

              this.reload();
            },
            error: (error) => {
              console.error('Error undoing paid charge:', error);
            }
          });
      }
    });
  }

  /**
   * Stops the propagation to view charge page.
   * @param $event Mouse Event
   */
  routeEdit($event: MouseEvent) {
    $event.stopPropagation();
  }

  /**
   * Checks if there are any overdue charges
   * @returns {boolean}
   */
  hasOverdueCharges(): boolean {
    if (this.isReadOnlyView || !this.chargesData || this.chargesData.length === 0) {
      return false;
    }
    return this.chargesData.some(
      (charge: any) =>
        charge.chargeTimeType?.value?.toLowerCase().includes('overdue') &&
        charge.amountOutstanding > 0 &&
        !charge.paid &&
        !charge.waived
    );
  }

  /**
   * Opens the bulk waive charges dialog
   */
  openBulkWaiveDialog() {
    const dialogRef = this.dialog.open(BulkWaiveChargesDialogComponent, {
      width: '600px',
      data: {
        loanDetails: this.loanDetails
      }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result && result.confirm) {
        if (result.waiveAll) {
          // Option 1: Waive All
          this.bulkWaiveAllOverdueCharges();
        } else if (result.waiveEmi) {
          // Option 2: Waive Complete EMI Overdue Charges
          this.bulkWaiveEmiOverdueCharges(result.selectedEmiNumbers);
        } else if (result.byDateRange) {
          // Option 3: Waive by Date Range
          this.bulkWaiveOverdueChargesByDateRange(result.startDate, result.endDate);
        }
      }
    });
  }

  /**
   * Bulk waives overdue charges within the selected due-date range
   */
  bulkWaiveOverdueChargesByDateRange(startDate: Date, endDate?: Date) {
    if (!startDate) {
      return;
    }

    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const startDateStr = this.dateUtils.formatDate(startDate, 'dd MMMM yyyy');

    let dialogContext: string;
    if (endDate) {
      const endDateStr = this.dateUtils.formatDate(endDate, 'dd MMMM yyyy');
      dialogContext = `Are you sure you want to waive all outstanding overdue charges with due dates between ${startDateStr} and ${endDateStr}?`;
    } else {
      dialogContext = `Are you sure you want to waive all outstanding overdue charges with due date on ${startDateStr}?`;
    }
    const additionalNotes =
      'Only the outstanding amount of each charge is waived; paid portions are preserved. Waive transactions with accounting entries are posted. Repayment schedule dates are not affected.';

    const confirmDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: 'Bulk Waive Overdue Charges',
        dialogContext: dialogContext,
        type: 'Mild',
        additionalNotes: additionalNotes
      }
    });

    confirmDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        const payload: any = {
          dueDate: this.dateUtils.formatDate(startDate, dateFormat),
          dateFormat,
          locale,
          removeCompleteEmiOverdue: false
        };

        // End date provided => range; not provided => exact single date only.
        if (endDate) {
          payload.toDueDate = this.dateUtils.formatDate(endDate, dateFormat);
        } else {
          payload.toDueDate = this.dateUtils.formatDate(startDate, dateFormat);
        }

        this.loansService.bulkWaiveOverdueCharges(this.loanDetails.id, payload).subscribe({
          next: () => {
            // Force a full page reload to ensure repayment schedule updates
            setTimeout(() => {
              this.reload();
            }, 500);
          },
          error: (error) => {
            console.error('Error bulk waiving overdue charges:', error);
          }
        });
      }
    });
  }

  /**
   * Bulk waives complete EMI overdue charges for selected EMI(s)
   */
  bulkWaiveEmiOverdueCharges(selectedEmiNumbers: number[]) {
    if (!selectedEmiNumbers || selectedEmiNumbers.length === 0) {
      return;
    }

    const emiList = selectedEmiNumbers.join(', ');
    const dialogContext = `Are you sure you want to waive all outstanding overdue charges for EMI(s) ${emiList}?`;
    const additionalNotes =
      'Only the outstanding amount of each charge is waived; paid portions are preserved. Waive transactions with accounting entries are posted. Repayment schedule dates are not affected.';

    const confirmDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: 'Bulk Waive EMI Overdue Charges',
        dialogContext: dialogContext,
        type: 'Mild',
        additionalNotes: additionalNotes
      }
    });

    confirmDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;

        // Send payload with selected EMI numbers
        const payload: any = {
          dateFormat,
          locale,
          removeCompleteEmiOverdue: true,
          selectedEmiNumbers: selectedEmiNumbers
        };

        this.loansService.bulkWaiveOverdueCharges(this.loanDetails.id, payload).subscribe({
          next: () => {
            // Force a full page reload to ensure repayment schedule updates
            setTimeout(() => {
              this.reload();
            }, 500);
          },
          error: (error) => {
            console.error('Error bulk waiving EMI overdue charges:', error);
          }
        });
      }
    });
  }

  /**
   * Bulk waives all outstanding overdue charges (no filter)
   */
  bulkWaiveAllOverdueCharges() {
    const dialogContext = 'Are you sure you want to waive all outstanding overdue charges for this loan?';
    const additionalNotes =
      'Only the outstanding amount of each charge is waived; paid portions are preserved. Waive transactions with accounting entries are posted. Repayment schedule dates are not affected.';

    const confirmDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: 'Bulk Waive Overdue Charges',
        dialogContext: dialogContext,
        type: 'Mild',
        additionalNotes: additionalNotes
      }
    });

    confirmDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;

        // Empty payload (no filters) => waive all outstanding overdue charges
        const payload: any = {
          dateFormat,
          locale
        };

        this.loansService.bulkWaiveOverdueCharges(this.loanDetails.id, payload).subscribe({
          next: () => {
            // Force a full page reload to ensure repayment schedule updates
            setTimeout(() => {
              this.reload();
            }, 500);
          },
          error: (error) => {
            console.error('Error bulk waiving overdue charges:', error);
          }
        });
      }
    });
  }

  /**
   * Refetches data fot the component
   * TODO: Replace by a custom reload component instead of hard-coded back-routing.
   */
  private reload() {
    const clientId = this.loanDetails.clientId;
    const url: string = this.router.url;
    this.router
      .navigateByUrl(`/clients/${clientId}/loans-accounts`, { skipLocationChange: true })
      .then(() => this.router.navigate([url]));
  }
}
