import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'mifosx-general-tab',
  templateUrl: './general-tab.component.html',
  styleUrls: ['./general-tab.component.scss']
})
export class GeneralTabComponent implements OnInit {
  /** Currency Code */
  currencyCode: string;
  loanDetails: any;
  status: any;
  loanSummaryColumns: string[] = [
    'Empty',
    'Original',
    'Paid',
    'Waived',
    'Written Off',
    'Outstanding',
    'Over Due'
  ];
  loanDetailsColumns: string[] = [
    'Key',
    'Value'
  ];
  loanSummaryTableData: {
    property: string;
    original: string;
    adjustment: string;
    paid: string;
    waived: string;
    writtenOff: string;
    outstanding: string;
    overdue: string;
  }[];
  loanDetailsTableData: {
    key: string;
    value?: string | number;
  }[];

  /** Data source for loans summary table. */
  dataSource: MatTableDataSource<any>;
  detailsDataSource: MatTableDataSource<any>;

  netDisbursedAmount: number = null;

  constructor(private route: ActivatedRoute) {
    this.route.parent.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetails = data.loanDetailsData;
      this.currencyCode = this.loanDetails.currency.code;
      if (this.loanDetails.transactions) {
        this.loanDetails.transactions.some((transaction: any) => {
          if (transaction.type.code === 'loanTransactionType.chargeback') {
            this.loanSummaryColumns = [
              'Empty',
              'Original',
              'Adjustments',
              'Paid',
              'Waived',
              'Written Off',
              'Outstanding',
              'Over Due'
            ];
            return;
          }
        });
      }
    });
  }

  ngOnInit() {
    this.status = this.loanDetails.value;
    this.calculateNetDisbursedAmount();
    if (this.loanDetails.summary) {
      this.setloanSummaryTableData();
      this.setloanDetailsTableData();
    } else {
      this.setloanNonDetailsTableData();
    }
  }

  /** Calculates the Net Disbursed Amount = Disbursed Amount - Processing Fee (if processing fee is not found, assumes zero.) */
  calculateNetDisbursedAmount() {
    // Only show disbursed amount if loan is active (status 300)
    // For pending approval (100) and approved (200), show 0.00
    const isActive = this.loanDetails?.status?.id === 300;
    const disbursedAmount = isActive ? this.loanDetails?.principal || 0 : 0;
    let processingFee = this.loanDetails.summary?.feeChargesCharged || 0;
    const factorRateEnabled = this.loanDetails?.factorRateEnabled || false;
    if (factorRateEnabled) {
      // If factor rate is enabled, processing fee is considered zero
      processingFee = 0;
    }
    const netDisbursedAmount = disbursedAmount - processingFee;
    const isLineOfCreditReceivable = this.loanDetails.additionalProperties?.locProductType === 'RECEIVABLE';
    this.netDisbursedAmount = isLineOfCreditReceivable
      ? netDisbursedAmount - this.loanDetails.summary.interestCharged
      : netDisbursedAmount;
  }

  /** Returns the disbursed amount based on loan status */
  getDisbursedAmount(): number {
    // Only show disbursed amount if loan is active (status 300)
    // For pending approval (100) and approved (200), show 0.00
    const isActive = this.loanDetails?.status?.id === 300;
    if (!isActive) {
      return 0;
    }

    if (this.loanDetails.factorRateEnabled) {
      return this.loanDetails.factorRateLoanAmount;
    }
    return this.loanDetails?.principal || 0;
  }

  /** Returns the approved amount based on loan status */
  getApprovedAmount(): number {
    // Show approved amount for approved (200) and active (300) loans
    // For pending approval (100), show 0.00
    const statusId = this.loanDetails?.status?.id;
    if (statusId === 100) {
      // Submitted and pending approval
      return 0;
    }

    if (this.loanDetails.factorRateEnabled) {
      return this.loanDetails.factorRateLoanAmount;
    }

    return this.loanDetails?.approvedPrincipal || 0;
  }

  setloanSummaryTableData() {
    this.loanSummaryTableData = [
      {
        property: 'Principal',
        original: this.loanDetails.summary.principalDisbursed,
        adjustment: this.loanDetails.summary.principalAdjustments || 0,
        paid: this.loanDetails.summary.principalPaid,
        waived: this.loanDetails.summary.principalWaived || 0,
        writtenOff: this.loanDetails.summary.principalWrittenOff,
        outstanding: this.loanDetails.summary.principalOutstanding,
        overdue: this.loanDetails.summary.principalOverdue
      },
      {
        property: 'Interest',
        original: this.loanDetails.summary.interestCharged,
        adjustment: '0',
        paid: this.loanDetails.summary.interestPaid,
        waived: this.loanDetails.summary.interestWaived,
        writtenOff: this.loanDetails.summary.interestWrittenOff,
        outstanding: this.loanDetails.summary.interestOutstanding,
        overdue: this.loanDetails.summary.interestOverdue
      },
      {
        property: 'Fees',
        original: this.loanDetails.summary.feeChargesCharged,
        adjustment: '0',
        paid: this.loanDetails.summary.feeChargesPaid,
        waived: this.loanDetails.summary.feeChargesWaived,
        writtenOff: this.loanDetails.summary.feeChargesWrittenOff,
        outstanding: this.loanDetails.summary.feeChargesOutstanding,
        overdue: this.loanDetails.summary.feeChargesOverdue
      },
      {
        property: 'Taxes',
        original: this.loanDetails.summary.taxChargesCharged,
        adjustment: '0',
        paid: this.loanDetails.summary.taxChargesPaid,
        waived: this.loanDetails.summary.taxChargesWaived,
        writtenOff: this.loanDetails.summary.taxChargesWrittenOff,
        outstanding: this.loanDetails.summary.taxChargesOutstanding,
        overdue: this.loanDetails.summary.taxChargesOverdue
      },
      {
        property: 'Penalties',
        original: this.loanDetails.summary.penaltyChargesCharged,
        adjustment: '0',
        paid: this.loanDetails.summary.penaltyChargesPaid,
        waived: this.loanDetails.summary.penaltyChargesWaived,
        writtenOff: this.loanDetails.summary.penaltyChargesWrittenOff,
        outstanding: this.loanDetails.summary.penaltyChargesOutstanding,
        overdue: this.loanDetails.summary.penaltyChargesOverdue
      },
      {
        property: 'Total',
        original: this.loanDetails.summary.totalExpectedRepayment,
        adjustment: this.loanDetails.summary.principalAdjustments || 0,
        paid: this.loanDetails.summary.totalRepayment,
        waived: this.loanDetails.summary.totalWaived,
        writtenOff: this.loanDetails.summary.totalWrittenOff,
        outstanding: this.loanDetails.summary.totalOutstanding,
        overdue: this.loanDetails.summary.totalOverdue
      }
    ];
    this.dataSource = new MatTableDataSource(this.loanSummaryTableData);
  }

  setloanDetailsTableData() {
    this.loanDetailsTableData = [
      {
        key: 'Disbursement Date'
      },
      {
        key: 'Loan Purpose'
      },
      {
        key: 'Loan Officer'
      },
      {
        key: 'Currency'
      },
      {
        key: 'External Id'
      },
      {
        key: 'Proposed Amount',
        value: this.loanDetails.factorRateEnabled
          ? this.loanDetails.factorRateLoanAmount
          : this.loanDetails.proposedPrincipal
      },
      {
        key: 'Approved Amount',
        value: this.getApprovedAmount()
      },
      {
        key: 'Disburse Amount',
        value: this.getDisbursedAmount()
      },
      {
        key: 'Net Disbursed Amount',
        value: this.netDisbursedAmount
      }
    ];
    this.detailsDataSource = new MatTableDataSource(this.loanDetailsTableData);
  }

  setloanNonDetailsTableData() {
    this.loanDetailsTableData = [
      {
        key: 'Disbursement Date'
      },
      {
        key: 'Currency'
      },
      {
        key: 'Loan Officer'
      },
      {
        key: 'External Id'
      },
      {
        key: 'Net Disbursed Amount',
        value: this.netDisbursedAmount
      }
    ];
    this.detailsDataSource = new MatTableDataSource(this.loanDetailsTableData);
  }

  showApprovedAmountBasedOnStatus() {
    // Always show approved amount, but it will be 0.00 for pending approval loans
    // Only hide for withdrawn or rejected loans
    if (this.status === 'Withdrawn by applicant' || this.status === 'Rejected') {
      return false;
    }
    return true;
  }

  showDisbursedAmountBasedOnStatus = function () {
    // Always show disbursed amount, but it will be 0.00 for pending approval and approved loans
    // Only hide for withdrawn or rejected loans
    if (this.status === 'Withdrawn by applicant' || this.status === 'Rejected') {
      return false;
    }
    return true;
  };
}
