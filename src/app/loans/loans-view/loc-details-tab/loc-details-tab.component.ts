/** Angular Imports */
import { AfterViewInit, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Invoice Details Tab Component
 */
@Component({
  selector: 'mifosx-loc-details-tab',
  templateUrl: './loc-details-tab.component.html',
  styleUrls: ['./loc-details-tab.component.scss']
})
export class LocDetailsTabComponent implements AfterViewInit {
  /** Loan Details Data */
  loanDetailsData: any;
  /** Invoice Details from additionalProperties */
  locDetails: any;

  /**
   * @param {ActivatedRoute} route Activated Route
   */
  constructor(private route: ActivatedRoute) {
    this.route.parent?.data.subscribe((data: { loanDetailsData: any }) => {
      this.loanDetailsData = data.loanDetailsData;
      this.locDetails = data.loanDetailsData.additionalProperties;
    });
  }

  ngAfterViewInit(): void {
    const invoiceNo = this.route.snapshot.queryParamMap.get('invoiceNo');
    if (invoiceNo && invoiceNo === this.locDetails?.invoiceNo) {
      setTimeout(() =>
        document.getElementById('matched-invoice-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
    }
  }

  isMatchedInvoice(): boolean {
    return this.route.snapshot.queryParamMap.get('invoiceNo') === this.locDetails?.invoiceNo;
  }

  /**
   * Checks if the selected LOC type is receivable based on locProductType
   */
  get isReceivableType(): boolean {
    return this.locDetails?.locProductType === 'RECEIVABLE';
  }

  /**
   * Checks if the selected LOC type is payable based on locProductType
   */
  get isPayableType(): boolean {
    return this.locDetails?.locProductType === 'PAYABLE';
  }

  /**
   * Gets the buyer details names from the buyer details objects
   */
  getBuyerDetailsNames(): string {
    if (!this.locDetails?.buyerDetails) return '';

    // Handle both array and single object cases
    const buyerDetails = Array.isArray(this.locDetails.buyerDetails)
      ? this.locDetails.buyerDetails
      : [this.locDetails.buyerDetails];

    return buyerDetails
      .map((buyer: any) => buyer?.name || buyer)
      .filter((name: any) => name)
      .join(', ');
  }

  /**
   * Gets the supplier details names from the supplier details objects
   */
  getSupplierDetailsNames(): string {
    if (!this.locDetails?.supplierDetails) return '';

    // Handle both array and single object cases
    const supplierDetails = Array.isArray(this.locDetails.supplierDetails)
      ? this.locDetails.supplierDetails
      : [this.locDetails.supplierDetails];

    return supplierDetails
      .map((supplier: any) => supplier?.name || supplier)
      .filter((name: any) => name)
      .join(', ');
  }
}
