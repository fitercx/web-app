import { Component, Input, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { Currency } from 'app/shared/models/general.model';

@Component({
  selector: 'mifosx-disburse-to-savings-account',
  templateUrl: './disburse-to-savings-account.component.html',
  styleUrls: ['./disburse-to-savings-account.component.scss']
})
export class DisburseToSavingsAccountComponent implements OnInit {
  @Input() dataObject: any;

  /** Minimum Date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed. */
  maxDate = new Date();
  /** Disbursement Loan form. */
  disbursementForm: UntypedFormGroup;
  /** Full Loan Details Data */
  loanDetailsData: any;
  currency: Currency;

  /**
   * Get data from `Resolver`.
   * @param {FormBuilder} formBuilder FormBuilder.
   * @param {ActivatedRoute} route ActivatedRoute.
   * @param {Router} router Router.
   * @param {LoansService} loanService Loan Service.
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private dateUtils: Dates,
    private loanService: LoansService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.maxDate = this.settingsService.businessDate;

    if (this.dataObject.currency) {
      this.currency = this.dataObject.currency;
    }

    // Fetch loan details to check LOC status
    const loanId = this.route.snapshot.params['loanId'];
    this.loanService.getLoanAccountAssociationDetails(loanId).subscribe((loanDetails: any) => {
      this.loanDetailsData = loanDetails;
      this.setDisbursementToSavingsForm();
    });
  }

  /**
   * Set Disbursement Loan form.
   */
  setDisbursementToSavingsForm() {
    this.disbursementForm = this.formBuilder.group({
      actualDisbursementDate: [
        new Date(),
        Validators.required
      ],
      transactionAmount: [
        this.dataObject.amount,
        Validators.required
      ],
      note: ['']
    });
    if (this.dataObject.fixedEmiAmount) {
      this.disbursementForm.addControl(
        'fixedEmiAmount',
        new UntypedFormControl(this.dataObject.fixedEmiAmount, [Validators.required])
      );
    }

    // Disable amount field for LOC receivable loans
    if (this.isLineOfCreditReceivable()) {
      this.disbursementForm.get('transactionAmount')?.disable();
    }
  }

  /**
   * Submit Disburse Form.
   */
  submit() {
    // Get all form values including disabled fields
    const disbursementLoanFormData = this.disbursementForm.getRawValue();
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const prevActualDisbursementDate: Date = this.disbursementForm.value.actualDisbursementDate;
    if (disbursementLoanFormData.actualDisbursementDate instanceof Date) {
      disbursementLoanFormData.actualDisbursementDate = this.dateUtils.formatDate(
        prevActualDisbursementDate,
        dateFormat
      );
    }
    const data = {
      ...disbursementLoanFormData,
      dateFormat,
      locale
    };
    const loanId = this.route.snapshot.params['loanId'];
    data['transactionAmount'] = data['transactionAmount'] * 1;
    this.loanService.loanActionButtons(loanId, 'disbursetosavings', data).subscribe((response: any) => {
      this.router.navigate(['../../general'], { relativeTo: this.route });
    });
  }

  /**
   * Checks if the loan is a Line of Credit Receivable loan
   */
  isLineOfCreditReceivable(): boolean {
    // Use loanDetailsData which has the full loan information
    const loanInfo = this.loanDetailsData || this.dataObject;

    if (!loanInfo) {
      return false;
    }

    // Check if loan has a line of credit ID (indicating it's a LOC loan)
    const hasLineOfCredit = !!(loanInfo.lineOfCreditId || loanInfo.additionalProperties?.lineOfCreditId);

    if (!hasLineOfCredit) {
      return false;
    }

    // Check if it's of receivable type
    const locType = loanInfo.locType || loanInfo.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE';
  }
}
