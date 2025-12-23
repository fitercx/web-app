/** Angular Imports */
import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

/** Custom Services */
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';

/** Custom Dialogs */
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { DeleteDialogComponent } from 'app/shared/delete-dialog/delete-dialog.component';
import { ConfirmationDialogComponent } from 'app/shared/confirmation-dialog/confirmation-dialog.component';
import { BulkRemoveChargesDialogComponent } from '../custom-dialogs/bulk-remove-charges-dialog/bulk-remove-charges-dialog.component';

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
  /** Columns to be displayed in charges table. */
  displayedColumns: string[] = [
    'name',
    'feepenalty',
    'paymentdueat',
    'dueDate',
    'calculationtype',
    'due',
    'paid',
    'waived',
    'outstanding',
    'actions'
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
    private systemService: SystemService
  ) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetails = data.loanDetailsData;
    });
  }

  ngOnInit() {
    this.systemService.getConfigurationByName('charge-accrual-date').subscribe((config: GlobalConfiguration) => {
      this.useDueDate = config.stringValue === 'due-date';
    });
    this.chargesData = this.loanDetails.charges;
    this.status = this.loanDetails.status.value;
    let actionFlag;
    this.chargesData.forEach((element: any) => {
      if (element.chargeTimeType.value === 'Disbursement') {
        element.dueDate = this.loanDetails.timeline.actualDisbursementDate;
      }
      element.dueDate = this.dateUtils.parseDate(element.dueDate);
      if (
        element.paid ||
        element.waived ||
        element.chargeTimeType.value === 'Disbursement' ||
        this.loanDetails.status.value !== 'Active'
      ) {
        actionFlag = true;
      } else {
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
   * Deletes the charge
   * @param {any} chargeId Charge Id
   */
  deleteCharge(chargeId: any) {
    const deleteChargeDialogRef = this.dialog.open(DeleteDialogComponent, {
      data: { deleteContext: `charge id:${chargeId}` }
    });
    deleteChargeDialogRef.afterClosed().subscribe((response: any) => {
      if (response.delete) {
        this.loansService.deleteLoansAccountCharge(this.loanDetails.id, chargeId).subscribe(() => {
          this.reload();
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
    if (!this.chargesData || this.chargesData.length === 0) {
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
   * Opens the bulk remove charges dialog
   */
  openBulkRemoveDialog() {
    const dialogRef = this.dialog.open(BulkRemoveChargesDialogComponent, {
      width: '500px',
      data: {}
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result && result.confirm) {
        if (result.removeAll) {
          this.bulkDeactivateAllOverdueCharges();
        } else {
          this.bulkDeactivateOverdueCharges(result.startDate, result.endDate);
        }
      }
    });
  }

  /**
   * Bulk deactivates overdue charges from the selected date range
   */
  bulkDeactivateOverdueCharges(startDate: Date, endDate?: Date) {
    if (!startDate) {
      return;
    }

    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const startDateStr = this.dateUtils.formatDate(startDate, 'dd MMMM yyyy');

    let dialogContext: string;
    let additionalNotes: string;

    if (endDate) {
      // Date range
      const endDateStr = this.dateUtils.formatDate(endDate, 'dd MMMM yyyy');
      dialogContext =
        this.translateService.instant(
          'labels.dialogContext.Are you sure you want to deactivate all overdue charges with due dates between'
        ) + ` ${startDateStr} ${this.translateService.instant('labels.text.and')} ${endDateStr}?`;
      additionalNotes = this.translateService.instant(
        'labels.text.This action will permanently deactivate all overdue charges with due dates within the selected date range. This action cannot be undone.'
      );
    } else {
      // Single date or from date onwards
      dialogContext =
        this.translateService.instant(
          'labels.dialogContext.Are you sure you want to deactivate all overdue charges with due date on or after'
        ) + ` ${startDateStr}?`;
      additionalNotes = this.translateService.instant(
        'labels.text.This action will permanently deactivate all overdue charges with due date on or after the selected date. This action cannot be undone.'
      );
    }

    const confirmDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: this.translateService.instant('labels.heading.Bulk Remove Overdue Charges'),
        dialogContext: dialogContext,
        type: 'Dangerous',
        additionalNotes: additionalNotes
      }
    });

    confirmDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        const payload: any = {
          dueDate: this.dateUtils.formatDate(startDate, dateFormat),
          dateFormat,
          locale
        };

        // Add end date if provided
        if (endDate) {
          payload.toDueDate = this.dateUtils.formatDate(endDate, dateFormat);
        }

        this.loansService.deactivateOverdueCharges(this.loanDetails.id, payload).subscribe({
          next: () => {
            this.reload();
          },
          error: (error) => {
            console.error('Error deactivating overdue charges:', error);
          }
        });
      }
    });
  }

  /**
   * Bulk deactivates all overdue charges (no date filter)
   */
  bulkDeactivateAllOverdueCharges() {
    const dialogContext = this.translateService.instant(
      'labels.dialogContext.Are you sure you want to deactivate all overdue charges for this loan?'
    );
    const additionalNotes = this.translateService.instant(
      'labels.text.This action will permanently deactivate all overdue charges. This action cannot be undone.'
    );

    const confirmDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: this.translateService.instant('labels.heading.Bulk Remove Overdue Charges'),
        dialogContext: dialogContext,
        type: 'Dangerous',
        additionalNotes: additionalNotes
      }
    });

    confirmDialogRef.afterClosed().subscribe((response: any) => {
      if (response.confirm) {
        const locale = this.settingsService.language.code;
        const dateFormat = this.settingsService.dateFormat;

        // Send empty payload or null dates to indicate "remove all"
        const payload: any = {
          dateFormat,
          locale
        };

        this.loansService.deactivateOverdueCharges(this.loanDetails.id, payload).subscribe({
          next: () => {
            this.reload();
          },
          error: (error) => {
            console.error('Error deactivating overdue charges:', error);
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
