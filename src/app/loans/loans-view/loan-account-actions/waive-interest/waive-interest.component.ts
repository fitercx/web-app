/** Angular Imports. */
import { Component, OnInit, Input } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

/** Custom Services. */
import { LoansService } from 'app/loans/loans.service';
import { Dates } from 'app/core/utils/dates';
import { SettingsService } from 'app/settings/settings.service';
import { Currency } from 'app/shared/models/general.model';

/**
 * Waive Interest component.
 */
@Component({
  selector: 'mifosx-waive-interest',
  templateUrl: './waive-interest.component.html',
  styleUrls: ['./waive-interest.component.scss']
})
export class WaiveInterestComponent implements OnInit {
  @Input() dataObject: any;

  /** Loan Interest form. */
  loanInterestForm: UntypedFormGroup;
  /** Minimum Date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed. */
  maxDate = new Date();
  currency: Currency;
  /** Currently outstanding interest that can genuinely be waived, as quoted by the server
   *  (`GET .../transactions/template?command=waiveinterest`, same figure this form's amount field is
   *  pre-filled with). Waiving materially more than this does not error out server-side - the excess is
   *  silently absorbed as an overpayment/"unrecognized income" instead of forgiven interest, which is
   *  very likely an operational typo (e.g. an extra digit) rather than an intended waiver. */
  maxWaivableAmount: number = null;
  /** True once the user has entered an amount above `maxWaivableAmount` - blocks submission. */
  amountExceedsOutstandingInterest = false;

  /**
   * Get data from `Resolver`.
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {Router} router Router.
   * @param {LoansService} loanService Loan Service.
   * @param {ActivatedRoute} route Activated Route.
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private router: Router,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private loanService: LoansService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.maxDate = this.settingsService.businessDate;
    this.maxWaivableAmount = this.dataObject.amount != null ? Number(this.dataObject.amount) : null;
    this.setLoanInterestForm();
    if (this.dataObject.currency) {
      this.currency = this.dataObject.currency;
    }
  }

  /**
   * Set Loan Interest form.
   */
  setLoanInterestForm() {
    this.loanInterestForm = this.formBuilder.group({
      transactionAmount: [
        this.dataObject.amount,
        Validators.required
      ],
      transactionDate: [
        this.dataObject.date && new Date(this.dataObject.date),
        Validators.required
      ],
      note: ['']
    });
    this.loanInterestForm.controls.transactionAmount.valueChanges.subscribe((value: any) =>
      this.checkAmountAgainstOutstanding(value)
    );
    this.checkAmountAgainstOutstanding(this.dataObject.amount);
  }

  /**
   * Warns and blocks submission when the entered amount exceeds the loan's actual currently-
   * outstanding interest - waiving more than what is owed is not rejected by the server, it is instead
   * silently converted into an overpayment, which is very unlikely to be the operator's intent.
   */
  private checkAmountAgainstOutstanding(value: any): void {
    const enteredAmount = Number(value);
    this.amountExceedsOutstandingInterest =
      this.maxWaivableAmount != null && !isNaN(enteredAmount) && enteredAmount > this.maxWaivableAmount + 0.01;
  }

  /**
   * Submits loan interest form.
   */
  submit() {
    if (this.amountExceedsOutstandingInterest) {
      return;
    }
    const loanInterestFormData = this.loanInterestForm.value;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const prevTransactionDate = this.loanInterestForm.value.transactionDate;
    if (loanInterestFormData.transactionDate instanceof Date) {
      loanInterestFormData.transactionDate = this.dateUtils.formatDate(prevTransactionDate, dateFormat);
    }
    const data = {
      ...loanInterestFormData,
      dateFormat,
      locale
    };
    data['transactionAmount'] = data['transactionAmount'] * 1;
    const loanId = this.route.snapshot.params['loanId'];
    this.loanService.submitLoanActionButton(loanId, data, 'waiveinterest').subscribe((response: any) => {
      this.router.navigate(['../../general'], { relativeTo: this.route });
    });
  }
}
