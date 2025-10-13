import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { Dates } from 'app/core/utils/dates';
import { RepaymentSchedulePeriod } from 'app/loans/models/loan-account.model';
import { SettingsService } from 'app/settings/settings.service';
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { DatepickerBase } from 'app/shared/form-dialog/formfield/model/datepicker-base';
import { FormfieldBase } from 'app/shared/form-dialog/formfield/model/formfield-base';
import { InputBase } from 'app/shared/form-dialog/formfield/model/input-base';

import { jsPDF, jsPDFOptions } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'mifosx-repayment-schedule-tab',
  templateUrl: './repayment-schedule-tab.component.html',
  styleUrls: ['./repayment-schedule-tab.component.scss']
})
export class RepaymentScheduleTabComponent implements OnInit, OnChanges {
  /** Currency Code */
  @Input() currencyCode: string;
  /** Loan Repayment Schedule to be Edited */
  @Input() forEditing = false;
  /** Loan Repayment Schedule Details Data */
  @Input() repaymentScheduleDetails: any = null;
  /** Loan Data (used for creation flow) */
  @Input() loanData: any = null;
  loanDetailsDataRepaymentSchedule: any = [];

  editCache: { [key: string]: any } = {};
  listOfData: any[] = [];

  repaymentSchedulePeriods: RepaymentSchedulePeriod[] = [];

  totalRepaymentExpected: number = 0;

  /** Stores if there is any waived amount */
  isWaived: boolean;
  /** Loan details data from parent */
  loanDetailsData: any;
  /** Base columns for regular loans */
  baseDisplayedColumns: string[] = [
    'number',
    'days',
    'balanceOfLoan',
    'date',
    'emiAmount',
    'principalDue',
    'interest',
    'fees',
    'taxes',
    'penalties',
    'waived',
    'status',
    'check',
    'paiddate',
    'due',
    'paid',
    'inadvance',
    'late',
    'outstanding'
  ];
  /** Base columns for editable schedule table */
  baseDisplayedColumnsEdit: string[] = [
    'number',
    'date',
    'balanceOfLoan',
    'emiAmount',
    'principalDue',
    'interest',
    'fees',
    'due',
    'actions'
  ];
  /** Columns to be displayed in original schedule table. */
  displayedColumns: string[] = [];
  /** Columns to be displayed in editable schedule table. */
  displayedColumnsEdit: string[] = [];

  /** Form functions event */
  @Output() editPeriod = new EventEmitter();

  businessDate: Date = new Date();

  /**
   * Retrieves the loans with associations data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   */
  constructor(
    private route: ActivatedRoute,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private dialog: MatDialog
  ) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      if (data.loanDetailsData) {
        this.currencyCode = data.loanDetailsData.currency.code;
        this.loanDetailsData = data.loanDetailsData;
      }
      this.loanDetailsDataRepaymentSchedule = data.loanDetailsData ? data.loanDetailsData.repaymentSchedule : [];
    });
    this.businessDate = this.settingsService.businessDate;
  }

  ngOnInit() {
    if (this.repaymentScheduleDetails == null) {
      this.repaymentScheduleDetails = this.loanDetailsDataRepaymentSchedule;
    }
    this.isWaived = this.repaymentScheduleDetails.totalWaived > 0;
    this.updateDisplayedColumns();
    this.updateEditCache();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.totalRepaymentExpected = 0;
    this.listOfData.forEach((item) => {
      this.totalRepaymentExpected = this.totalRepaymentExpected + item.totalDueForPeriod;
    });

    // Update displayed columns if loanData changes
    if (changes['loanData']) {
      this.updateDisplayedColumns();
    }
  }

  installmentStyle(installment: RepaymentSchedulePeriod): string {
    if (installment.complete) {
      return 'paid';
    }
    const isCurrent: string = this.isCurrent(installment);
    if (isCurrent !== '') {
      return isCurrent;
    }
    if (installment.isAdditional) {
      return 'additional';
    } else if (installment.downPaymentPeriod) {
      return 'downpayment';
    }
    return '';
  }

  isCurrent(installment: RepaymentSchedulePeriod): string {
    if (!installment.fromDate) {
      return '';
    } else {
      const fromDate = this.dateUtils.parseDate(installment.fromDate);
      const dueDate = this.dateUtils.parseDate(installment.dueDate);
      if (fromDate <= this.businessDate && this.businessDate < dueDate) {
        return 'current';
      }
      if (this.businessDate > dueDate) {
        return 'overdued';
      }
    }
    return '';
  }

  exportToPDF() {
    const businessDate = this.dateUtils.formatDate(this.settingsService.businessDate, Dates.DEFAULT_DATEFORMAT);
    const fileName = `repaymentschedule-${businessDate}.pdf`;

    const options: jsPDFOptions = {
      orientation: 'l',
      unit: 'in',
      format: 'letter',
      precision: 2,
      compress: true,
      putOnlyUsedFonts: true
    };
    const pdf = new jsPDF(options);

    autoTable(pdf, {
      html: '#repaymentSchedule',
      bodyStyles: { lineColor: [
          0,
          0,
          0
        ] },
      styles: {
        fontSize: 8,
        cellWidth: 'auto',
        halign: 'center'
      }
    });
    pdf.save(fileName);
  }

  editInstallment(period: RepaymentSchedulePeriod): void {
    this.editCache[period.period].edit = true;
    const formfields: FormfieldBase[] = [
      new DatepickerBase({
        controlName: 'dueDate',
        label: 'Due Date',
        value: this.dateUtils.parseDate(period.dueDate),
        type: 'date',
        required: true
      }),
      new InputBase({
        controlName: 'principalDue',
        label: 'Amount',
        value: period.principalDue,
        type: 'number',
        required: true
      })

    ];

    const data = {
      title: 'Period',
      formfields: formfields
    };
    const addDialogRef = this.dialog.open(FormDialogComponent, { data, width: '50rem' });
    addDialogRef.afterClosed().subscribe((response: any) => {
      if (response.data) {
      }
    });
  }

  cancelEdit(id: string): void {
    const index = this.listOfData.findIndex((item) => item.id === id);
    this.editCache[id] = {
      data: { ...this.listOfData[index] },
      edit: false
    };
  }

  saveEdit(period: string): void {
    const index = this.listOfData.findIndex((item) => item.period === period);
    Object.assign(this.listOfData[index], this.editCache[period].data);
    this.editCache[period].edit = false;
    this.editPeriod.emit(period);
  }

  updateEditCache(): void {
    if (this.repaymentScheduleDetails != null) {
      this.listOfData = this.repaymentScheduleDetails.periods;
      this.totalRepaymentExpected = 0;
      this.listOfData.forEach((item) => {
        this.editCache[item.period] = {
          edit: false,
          data: { ...item }
        };
        this.totalRepaymentExpected = this.totalRepaymentExpected + item.totalDueForPeriod;
      });
    }
  }

  numberOnly(inputFormControl: any, event: any): boolean {
    const charCode = event.which ? event.which : event.keyCode;
    if (charCode === 46) {
      if (!(inputFormControl.value.indexOf('.') > -1)) {
        return true;
      }
      return false;
    } else if (charCode > 31 && (charCode < 48 || charCode > 57)) {
      return false;
    }
    return true;
  }

  /**
   * Checks if the loan is a line of credit of receivable type
   */
  private isLineOfCreditReceivable(): boolean {
    // Use loanData (for creation flow) or loanDetailsData (for view flow)
    const loanInfo = this.loanData || this.loanDetailsData;

    if (!loanInfo) {
      return false;
    }

    // Check if loan has a line of credit ID (indicating it's a LOC loan)
    const hasLineOfCredit = !!(loanInfo.lineOfCreditId || loanInfo.additionalProperties?.lineOfCreditId);

    if (!hasLineOfCredit) {
      return false;
    }

    // Check if it's of receivable type
    // For creation flow, check locType field
    // For view flow, check locProductType field
    const locType = loanInfo.locType || loanInfo.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE';
  }

  /**
   * Updates the displayed columns based on loan type
   */
  private updateDisplayedColumns(): void {
    if (this.isLineOfCreditReceivable()) {
      // For LOC Receivable: remove principal-related columns and add new LOC-specific columns at the end
      const columnsToRemove = [
        'principalDue',
        'due',
        'emiAmount'
      ];

      // Start with base columns and remove unwanted ones
      this.displayedColumns = [...this.baseDisplayedColumns].filter((col) => !columnsToRemove.includes(col));
      this.displayedColumnsEdit = [...this.baseDisplayedColumnsEdit].filter((col) => !columnsToRemove.includes(col));

      // Add LOC-specific columns at the end of the schedule
      this.displayedColumns.push('disbursedAmount', 'refundAmount');
      this.displayedColumnsEdit.push('disbursedAmount', 'refundAmount');
    } else {
      // For regular loans: use base columns as-is
      this.displayedColumns = [...this.baseDisplayedColumns];
      this.displayedColumnsEdit = [...this.baseDisplayedColumnsEdit];
    }
  }

  /**
   * Calculates the disbursed amount (principal - total interest on loan) for LOC receivable loans
   * Only shows when the loan is disbursed
   */
  getDisbursedAmount(item: any): number {
    if (!this.isLineOfCreditReceivable() || !item.principalDisbursed) {
      return 0;
    }

    const principal = item.principalDisbursed || 0;
    const totalInterest = this.repaymentScheduleDetails?.totalInterestCharged || 0;
    return Math.max(0, principal - totalInterest);
  }

  /**
   * Calculates the refund amount for overpayments in LOC receivable loans
   */
  getRefundAmount(item: any): number {
    if (!this.isLineOfCreditReceivable()) {
      return 0;
    }

    // Check if there's an overpayment (total paid > total due)
    const totalPaid = item.totalPaidForPeriod || 0;
    const totalDue = item.totalDueForPeriod || 0;

    if (totalPaid > totalDue) {
      return totalPaid - totalDue;
    }

    return 0;
  }
}
