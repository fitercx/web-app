/** Angular Imports */
import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTable } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { UntypedFormGroup, UntypedFormBuilder, UntypedFormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

/** Custom Services */
import { OrganizationService } from '../organization.service';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import { AlertService } from 'app/core/alert/alert.service';

/** Custom Dialogs */
import { ReverseStandingInstructionDialogComponent } from 'app/shared/reverse-standing-instruction-dialog/reverse-standing-instruction-dialog.component';

/**
 * View Standing Instructions History Component.
 */
@Component({
  selector: 'mifosx-standing-instructions-history',
  templateUrl: './standing-instructions-history.component.html',
  styleUrls: ['./standing-instructions-history.component.scss']
})
export class StandingInstructionsHistoryComponent implements OnInit {
  /** Minimum Date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed. */
  maxDate = new Date();
  /** Instruction  form. */
  instructionForm: UntypedFormGroup;
  /** Standing Instructions Template */
  standingInstructionsTemplate: any;
  /** Toggles b/w form and table */
  isCollapsed = false;

  /** Columns to be displayed in instructions table. */
  displayedColumns: string[] = [
    'fromClient',
    'fromAccount',
    'toClient',
    'toAccount',
    'executionTime',
    'amount',
    'status',
    'errorLog',
    'actions'
  ];

  /** Stores last search params for table refresh after reversal. */
  private lastSearchData: any = null;
  /** Data source for instructions table. */
  dataSource: MatTableDataSource<any>;

  /** Paginator for instructions table. */
  @ViewChild(MatPaginator) paginator: MatPaginator;
  /** Sorter for instructions table. */
  @ViewChild(MatSort) sort: MatSort;

  /**
   * Retrieves the instructions template from `resolve`.
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {OrganizationService} organizationService Organization Service.
   * @param {SettingsService} settingsService Settings Service.
   * @param {ActivatedRoute} route Activated Route.
   * @param {Router} router Router for navigation.
   * @param {Dates} dateUtils Date Utils to format date.
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private organizationService: OrganizationService,
    private settingsService: SettingsService,
    private router: Router,
    private route: ActivatedRoute,
    private dateUtils: Dates,
    private dialog: MatDialog,
    private alertService: AlertService
  ) {
    this.route.data.subscribe((data: { standingInstructionsTemplate: any }) => {
      this.standingInstructionsTemplate = data.standingInstructionsTemplate;
    });
  }

  ngOnInit() {
    this.maxDate = this.settingsService.businessDate;
    this.createInstructionForm();
    this.buildDependencies();
  }

  /**
   * Creates the Instruction Form
   */
  createInstructionForm() {
    this.instructionForm = this.formBuilder.group({
      clientName: [''],
      clientId: [''],
      transferType: [''],
      fromAccountType: [''],
      fromDate: [''],
      toDate: ['']
    });
  }

  /**
   * Sets conditional child controls.
   */
  buildDependencies() {
    this.instructionForm.get('fromAccountType').valueChanges.subscribe(() => {
      this.instructionForm.addControl('fromAccountId', new UntypedFormControl(''));
    });
  }

  /**
   * Initializes the data source, paginator and sorter for instructions table.
   * @param {any} data
   */
  setInstructions(data: any) {
    this.dataSource = new MatTableDataSource(data);
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * Searches standing instructions.
   */
  search() {
    this.isCollapsed = true;
    const instructionFormData = this.instructionForm.value;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const prevFromDate: Date = this.instructionForm.value.fromDate;
    const prevToDate: Date = this.instructionForm.value.toDate;
    if (instructionFormData.fromDate instanceof Date) {
      instructionFormData.fromDate = this.dateUtils.formatDate(prevFromDate, dateFormat);
    }
    if (instructionFormData.toDate instanceof Date) {
      instructionFormData.toDate = this.dateUtils.formatDate(prevToDate, dateFormat);
    }
    const data = {
      ...instructionFormData,
      dateFormat,
      locale
    };
    this.lastSearchData = data;
    this.organizationService.getStandingInstructions(data).subscribe((response: any) => {
      this.setInstructions(response.pageItems);
    });
  }

  /**
   * Opens the reverse confirmation dialog for a history row.
   * @param instruction The history row data.
   */
  reverseExecution(instruction: any) {
    const dialogRef = this.dialog.open(ReverseStandingInstructionDialogComponent, {
      width: '500px',
      data: {
        historyId: instruction.historyId,
        amount: instruction.amount,
        executionTime: instruction.executionTime
      }
    });

    dialogRef.afterClosed().subscribe((result: { confirmed: boolean; note: string } | undefined) => {
      if (!result?.confirmed) {
        return;
      }
      this.organizationService.reverseStandingInstructionExecution(instruction.historyId, result.note).subscribe({
        next: () => {
          this.alertService.alert({ type: 'Payment Reversed', message: 'Payment reversed successfully' });
          if (this.lastSearchData) {
            this.organizationService.getStandingInstructions(this.lastSearchData).subscribe((response: any) => {
              this.setInstructions(response.pageItems);
            });
          }
        },
        error: (err: any) => {
          const errorCode = err?.error?.errors?.[0]?.userMessageGlobalisationCode;
          const defaultMessage = err?.error?.errors?.[0]?.defaultUserMessage || 'An unexpected error occurred.';
          const errorMap: { [key: string]: string } = {
            'error.msg.standing.instruction.execution.already.reversed': 'This payment has already been reversed.',
            'error.msg.standing.instruction.reversal.subsequent.transactions.exist':
              'A later payment exists on this loan. Please reverse that one first, then retry.',
            'error.msg.standing.instruction.loan.written.off': 'Cannot reverse — the loan has been written off.',
            'error.msg.standing.instruction.loan.foreclosed': 'Cannot reverse — the loan has been foreclosed.',
            'error.msg.standing.instruction.transfer.not.found':
              'The original transfer record could not be found. Contact support.',
            'error.msg.standing.instruction.transfer.ambiguous':
              'Multiple transfers match this record. Contact support to resolve.',
            'error.msg.standing.instruction.reversal.note.required': 'A reason is required.'
          };
          const message = errorCode ? errorMap[errorCode] || defaultMessage : defaultMessage;
          this.alertService.alert({ type: 'Reversal Failed', message });
        }
      });
    });
  }
}
