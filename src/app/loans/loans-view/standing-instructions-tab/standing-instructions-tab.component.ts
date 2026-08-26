/** Angular Imports */
import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource, MatTable } from '@angular/material/table';
import { ActivatedRoute } from '@angular/router';

/** Custom Services */
import { LoansService } from 'app/loans/loans.service';
import { AccountTransfersService } from 'app/account-transfers/account-transfers.service';
import { SettingsService } from 'app/settings/settings.service';
import { AlertService } from 'app/core/alert/alert.service';

/** Dialog Components */
import { DeleteDialogComponent } from 'app/shared/delete-dialog/delete-dialog.component';
import { ReverseStandingInstructionDialogComponent } from 'app/shared/reverse-standing-instruction-dialog/reverse-standing-instruction-dialog.component';

/**
 * Loans Standing Instructions Tab
 */
@Component({
  selector: 'mifosx-standing-instructions-tab',
  templateUrl: './standing-instructions-tab.component.html',
  styleUrls: ['./standing-instructions-tab.component.scss']
})
export class StandingInstructionsTabComponent implements OnInit {
  /** Loans Data */
  loanDetailsData: any;
  /** Instructions Data */
  instructionsData: any[];
  /** Data source for instructions table. */
  dataSource = new MatTableDataSource();
  /** Columns to be displayed in instructions table. */
  displayedColumns: string[] = [
    'client',
    'fromAccount',
    'beneficiary',
    'toAccount',
    'amount',
    'validity',
    'actions'
  ];

  /** Data source for execution history table. */
  historyDataSource = new MatTableDataSource<any>();
  /** Columns to be displayed in the execution history table. */
  historyDisplayedColumns: string[] = [
    'executionTime',
    'amount',
    'status',
    'errorLog',
    'actions'
  ];

  /** Instruction Table Reference */
  @ViewChild('instructionsTable', { static: true }) instructionTableRef: MatTable<Element>;

  /**
   * Retrieves Loans Account Data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private route: ActivatedRoute,
    private loansService: LoansService,
    private dialog: MatDialog,
    private accountTransfersService: AccountTransfersService,
    private settingsService: SettingsService,
    private alertService: AlertService
  ) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetailsData = data.loanDetailsData;
    });
  }

  ngOnInit() {
    this.getStandingInstructions();
    this.getStandingInstructionsHistory();
  }

  /**
   * Retrieves standing instructions and initializes instructions table.
   */
  getStandingInstructions() {
    const clientId = this.loanDetailsData.clientId;
    const clientName = this.loanDetailsData.clientName;
    const accountId = this.loanDetailsData.id;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    this.loansService
      .getStandingInstructions(clientId, clientName, accountId, locale, dateFormat)
      .subscribe((response: any) => {
        this.instructionsData = response.pageItems;
        this.dataSource.data = this.instructionsData;
        this.instructionTableRef.renderRows();
      });
  }

  deleteStandingInstruction(instructionId: any) {
    const deleteStandingInstructionDialogRef = this.dialog.open(DeleteDialogComponent, {
      data: { deleteContext: `standing instruction id: ${instructionId}` }
    });
    deleteStandingInstructionDialogRef.afterClosed().subscribe((response: any) => {
      if (response.delete) {
        this.accountTransfersService.deleteStandingInstrucions(instructionId).subscribe(() => {});
      }
    });
  }

  /**
   * Retrieves standing instruction execution history scoped to this loan.
   *
   * The API filters by client, so we fetch all client-level history rows and
   * keep only those whose from-account or to-account is this loan.
   */
  getStandingInstructionsHistory() {
    const clientId = this.loanDetailsData.clientId;
    const loanId = this.loanDetailsData.id;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    this.loansService.getStandingInstructionsHistory(clientId, locale, dateFormat).subscribe((response: any) => {
      const rows: any[] = (response?.pageItems ?? []).filter(
        (row: any) => row?.fromAccount?.id === loanId || row?.toAccount?.id === loanId
      );
      this.historyDataSource.data = rows;
    });
  }

  reverseHistoryRow(instruction: any) {
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
      this.loansService.reverseStandingInstructionExecution(instruction.historyId, result.note).subscribe({
        next: () => {
          this.alertService.alert({ type: 'Payment Reversed', message: 'Payment reversed successfully' });
          this.getStandingInstructionsHistory();
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
