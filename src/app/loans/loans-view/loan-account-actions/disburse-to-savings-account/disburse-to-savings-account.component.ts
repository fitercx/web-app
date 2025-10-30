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

    if (this.dataObject?.currency) {
      this.currency = this.dataObject.currency;
    }

    // Build form once so user input isn't lost when async data arrives
    this.setDisbursementToSavingsForm();

    const loanId = this.route.snapshot.params['loanId'];
    this.loanService.getLoanAccountAssociationDetails(loanId).subscribe((loanDetails: any) => {
      this.loanDetailsData = loanDetails;
      // Only perform LOC-specific adjustments; do NOT rebuild the form.
      if (this.isLineOfCreditReceivable()) {
        this.disbursementForm.get('transactionAmount')?.disable();
      }
    });
  }

  /**
   * Set Disbursement Loan form.
   * Preserves existing user-selected date if already chosen.
   */
  setDisbursementToSavingsForm() {
    const existingDate = this.disbursementForm?.get('actualDisbursementDate')?.value;
    const providedDate = this.dataObject?.actualDisbursementDate; // may come pre-populated

    let initialDate: Date;
    if (existingDate instanceof Date) {
      initialDate = existingDate;
    } else if (typeof existingDate === 'string' && existingDate) {
      // attempt to parse previously entered string
      const parsed = new Date(existingDate);
      initialDate = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else if (providedDate) {
      const parsedProvided = new Date(providedDate);
      initialDate = isNaN(parsedProvided.getTime()) ? new Date() : parsedProvided;
    } else {
      initialDate = new Date();
    }

    const existingNote = this.disbursementForm?.get('note')?.value || '';

    this.disbursementForm = this.formBuilder.group({
      actualDisbursementDate: [
        initialDate,
        Validators.required
      ],
      transactionAmount: [
        this.dataObject?.amount,
        Validators.required
      ],
      note: [existingNote]
    });

    if (this.dataObject?.fixedEmiAmount) {
      if (!this.disbursementForm.get('fixedEmiAmount')) {
        this.disbursementForm.addControl(
          'fixedEmiAmount',
          new UntypedFormControl(this.dataObject.fixedEmiAmount, [Validators.required])
        );
      } else {
        this.disbursementForm.get('fixedEmiAmount')?.setValue(this.dataObject.fixedEmiAmount);
      }
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
    let chosenDate = disbursementLoanFormData.actualDisbursementDate;

    if (chosenDate && !(chosenDate instanceof Date)) {
      chosenDate = new Date(chosenDate);
    }

    if (chosenDate instanceof Date && !isNaN(chosenDate.getTime())) {
      disbursementLoanFormData.actualDisbursementDate = this.dateUtils.formatDate(chosenDate, dateFormat);
    }

    const data = {
      ...disbursementLoanFormData,
      dateFormat,
      locale,
      transactionAmount: disbursementLoanFormData.transactionAmount * 1
    };

    const loanId = this.route.snapshot.params['loanId'];
    this.loanService.loanActionButtons(loanId, 'disbursetosavings', data).subscribe(() => {
      this.router.navigate(['../../general'], { relativeTo: this.route });
    });
  }

  /**
   * Checks if the loan is a Line of Credit Receivable loan
   */
  isLineOfCreditReceivable(): boolean {
    const loanInfo = this.loanDetailsData || this.dataObject;
    if (!loanInfo) {
      return false;
    }
    const hasLineOfCredit = !!(loanInfo.lineOfCreditId || loanInfo.additionalProperties?.lineOfCreditId);
    if (!hasLineOfCredit) {
      return false;
    }
    const locType = loanInfo.locType || loanInfo.additionalProperties?.locProductType;
    return locType === 'RECEIVABLE';
  }
}
