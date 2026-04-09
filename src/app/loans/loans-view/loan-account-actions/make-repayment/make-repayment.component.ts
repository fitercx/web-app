/** Angular Imports */
import { Component, OnInit, Input } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, UntypedFormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

/** RxJS Imports */
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** Custom Services */
import { LoansService } from 'app/loans/loans.service';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import { Currency } from 'app/shared/models/general.model';

/**
 * Loan Make Repayment Component
 */
@Component({
  selector: 'mifosx-make-repayment',
  templateUrl: './make-repayment.component.html',
  styleUrls: ['./make-repayment.component.scss']
})
export class MakeRepaymentComponent implements OnInit {
  @Input() dataObject: any;
  /** Loan Id */
  loanId: string;
  /** Payment Type Options */
  paymentTypes: any;
  /** Show payment details */
  showPaymentDetails = false;
  /** Minimum Date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum Date allowed — extended 1 year ahead to allow future repayment date selection. */
  maxDate = new Date();
  /** Repayment Loan Form */
  repaymentLoanForm: UntypedFormGroup;
  currency: Currency | null = null;

  penaltyTemplate: Number;

  /**
   * Baseline principal/interest outstanding captured from the resolver's initial
   * penalty template (loaded for business date). The /template/penalties endpoint
   * returns 0 for these fields when no installment falls on the selected future date,
   * so we always fall back to these resolver-loaded values for display.
   */
  private baselinePrincipalOutstanding: number = 0;
  private baselineInterestOutstanding: number = 0;

  /**
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {LoansService} loanService Loan Service.
   * @param {ActivatedRoute} route Activated Route.
   * @param {Router} router Router for navigation.
   * @param {SettingsService} settingsService Settings Service
   */
  constructor(
    private formBuilder: UntypedFormBuilder,
    private loanService: LoansService,
    private route: ActivatedRoute,
    private router: Router,
    private dateUtils: Dates,
    private settingsService: SettingsService
  ) {
    this.loanId = this.route.snapshot.params['loanId'];
  }

  /**
   * Creates the repayment loan form
   * and initialize with the required values
   */
  ngOnInit() {
    const businessDate = this.settingsService.businessDate;
    this.maxDate = new Date(businessDate);
    this.maxDate.setFullYear(this.maxDate.getFullYear() + 1);
    this.createRepaymentLoanForm();
    this.setRepaymentLoanDetails();
    if (this.dataObject.repaymentTemplate.currency) {
      this.currency = this.dataObject.repaymentTemplate.currency;
    }

    // Capture resolver-loaded outstanding amounts as baseline fallback values.
    if (this.dataObject.penaltyTemplate) {
      this.baselinePrincipalOutstanding = this.dataObject.penaltyTemplate.principalOutstanding || 0;
      this.baselineInterestOutstanding = this.dataObject.penaltyTemplate.interestOutstanding || 0;
    }

    this.repaymentLoanForm.get('transactionDate')?.valueChanges.subscribe((newDate: Date) => {
      if (newDate) {
        const formattedDate = this.dateUtils.formatDate(newDate, this.settingsService.dateFormat);
        this.refreshPenaltyTemplate(formattedDate);
      }
    });
  }

  /**
   * Creates the create close form.
   */
  createRepaymentLoanForm() {
    this.repaymentLoanForm = this.formBuilder.group({
      transactionDate: [
        this.settingsService.businessDate,
        Validators.required
      ],
      transactionAmount: [
        '',
        Validators.required
      ],
      externalId: '',
      paymentTypeId: '',
      note: ''
    });
  }

  setRepaymentLoanDetails() {
    this.paymentTypes = this.dataObject.repaymentTemplate.paymentTypeOptions;
    this.repaymentLoanForm.patchValue({
      transactionAmount: this.dataObject.repaymentTemplate.amount
    });
  }

  /**
   * Add payment detail fields to the UI.
   */
  addPaymentDetails() {
    this.showPaymentDetails = !this.showPaymentDetails;
    if (this.showPaymentDetails) {
      this.repaymentLoanForm.addControl('accountNumber', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('checkNumber', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('routingCode', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('receiptNumber', new UntypedFormControl(''));
      this.repaymentLoanForm.addControl('bankNumber', new UntypedFormControl(''));
    } else {
      this.repaymentLoanForm.removeControl('accountNumber');
      this.repaymentLoanForm.removeControl('checkNumber');
      this.repaymentLoanForm.removeControl('routingCode');
      this.repaymentLoanForm.removeControl('receiptNumber');
      this.repaymentLoanForm.removeControl('bankNumber');
    }
  }

  /** Submits the repayment form */
  submit() {
    const repaymentLoanFormData = this.repaymentLoanForm.value;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const prevTransactionDate: Date = this.repaymentLoanForm.value.transactionDate;
    if (repaymentLoanFormData.transactionDate instanceof Date) {
      repaymentLoanFormData.transactionDate = this.dateUtils.formatDate(prevTransactionDate, dateFormat);
    }
    const data = {
      ...repaymentLoanFormData,
      dateFormat,
      locale
    };
    const command = this.dataObject.repaymentTemplate.type.code.split('.')[1];
    data['transactionAmount'] = data['transactionAmount'] * 1;
    this.loanService.submitLoanActionButton(this.loanId, data, command).subscribe((response: any) => {
      this.router.navigate(['../../transactions'], { relativeTo: this.route });
    });
  }

  private refreshPenaltyTemplate(transactionDate: string): void {
    const businessDate = this.settingsService.businessDate;
    const selectedDate = this.dateUtils.parseDate(transactionDate);
    const isFutureDate = selectedDate && businessDate && selectedDate.getTime() > businessDate.getTime();

    this.loanService
      .getLoanPenaltiesTemplate(this.loanId, transactionDate)
      .pipe(
        switchMap((template: any) => {
          this.dataObject.penaltyTemplate = template;
          if (isFutureDate) {
            return this.loanService
              .getFutureLPICharges(this.loanId, transactionDate)
              .pipe(switchMap((futureLPI: any) => of({ template, futureLPI })));
          }
          return of({ template, futureLPI: null as any });
        })
      )
      .subscribe(({ template, futureLPI }: { template: any; futureLPI: any }) => {
        // /template/penalties returns 0 for principal/interest when no installment falls
        // on the selected date (always the case for future dates). Fall back to the
        // baseline values captured from the resolver so the display stays correct.
        const principalAmount = template.principalOutstanding || this.baselinePrincipalOutstanding;
        const interestAmount = template.interestOutstanding || this.baselineInterestOutstanding;
        const feesAmount = this.dataObject.repaymentTemplate.feeChargesPortion || 0;
        const penaltyAmount = template.penaltyAmountDue || 0;
        const additionalLPIAmount = Number(futureLPI?.totalLPIAmount || 0);

        this.dataObject.penaltyTemplate.principalOutstanding = principalAmount;
        this.dataObject.penaltyTemplate.interestOutstanding = interestAmount;
        this.dataObject.penaltyTemplate.penaltyAmountDue = penaltyAmount + additionalLPIAmount;

        const totalAmount = principalAmount + interestAmount + feesAmount + penaltyAmount + additionalLPIAmount;
        this.repaymentLoanForm.patchValue({
          transactionAmount: Math.round(totalAmount * 100) / 100
        });
      });
  }
}
