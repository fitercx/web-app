/** Angular Imports */
import { Component } from '@angular/core';
import { UntypedFormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

/** rxjs Imports */
import { finalize } from 'rxjs/operators';

/** Custom Services */
import { LoanRecordSearchResult, SavingsAccountLoanSearchResult, SearchService } from '../search.service';

type SearchType = 'loanId' | 'invoiceNo' | 'savingsAccountNo';

const SEARCH_TYPES: SearchType[] = [
  'loanId',
  'invoiceNo',
  'savingsAccountNo'
];

/**
 * Search Page Component
 */
@Component({
  selector: 'mifosx-search-page',
  templateUrl: './search-page.component.html',
  styleUrls: ['./search-page.component.scss']
})
export class SearchPageComponent {
  searchType = new UntypedFormControl('loanId');
  searchValue = new UntypedFormControl('');
  searchTypeOptions: { value: SearchType; label: string }[] = [
    { value: 'loanId', label: 'Loan ID' },
    { value: 'invoiceNo', label: 'Invoice Number' },
    { value: 'savingsAccountNo', label: 'Savings Account No.' }
  ];
  results: LoanRecordSearchResult[] = [];
  searchedValue = '';
  searchedType: SearchType = 'loanId';
  savingsAccountFound = false;
  savingsAccountNo = '';
  submitted = false;
  loading = false;

  /**
   * @param {ActivatedRoute} route Activated Route
   * @param {SearchService} searchService Search Service
   */
  constructor(
    private route: ActivatedRoute,
    private searchService: SearchService
  ) {
    this.route.queryParamMap.subscribe((params) => {
      const type = params.get('type') as SearchType;
      const value = params.get('value');
      if (SEARCH_TYPES.includes(type) && value) {
        this.searchType.patchValue(type, { emitEvent: false });
        this.searchValue.patchValue(value, { emitEvent: false });
        this.search();
      }
    });
  }

  get inputLabel(): string {
    const type: SearchType = this.searchType.value;
    switch (type) {
      case 'loanId':
        return 'Enter Loan ID';
      case 'invoiceNo':
        return 'Enter Invoice Number';
      case 'savingsAccountNo':
        return 'Enter Savings Account No.';
      default: {
        const exhaustive: never = type;
        return exhaustive;
      }
    }
  }

  get showNoLinkedLoans(): boolean {
    return this.searchedType === 'savingsAccountNo' && this.savingsAccountFound;
  }

  search(): void {
    const value = String(this.searchValue.value || '').trim();
    if (!value || this.loading) {
      return;
    }
    const type: SearchType = this.searchType.value;
    this.submitted = true;
    this.searchedValue = value;
    this.searchedType = type;
    this.savingsAccountFound = false;
    this.savingsAccountNo = '';
    this.results = [];
    this.loading = true;

    if (type === 'savingsAccountNo') {
      this.searchService
        .searchLoansBySavingsAccountNo(value)
        .pipe(finalize(() => (this.loading = false)))
        .subscribe(
          (response: SavingsAccountLoanSearchResult) => {
            this.savingsAccountFound = response.savingsAccountFound;
            this.savingsAccountNo = response.savingsAccountNo || value;
            this.results = response.loans || [];
          },
          () => {
            this.results = [];
          }
        );
      return;
    }

    this.searchService
      .searchLoanRecords(type, value)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe(
        (results: LoanRecordSearchResult[]) => {
          this.results = type === 'loanId' ? results.slice(0, 1) : results;
        },
        () => {
          this.results = [];
        }
      );
  }

  loanLink(result: LoanRecordSearchResult): any[] {
    const parentSegment = result.clientId ? 'clients' : 'groups';
    const parentId = result.clientId || result.groupId;
    const tab = this.searchedType === 'invoiceNo' ? 'loc-details' : 'general';
    return [
      '/',
      parentSegment,
      parentId,
      'loans-accounts',
      result.loanId,
      tab
    ];
  }

  queryParams(result: LoanRecordSearchResult): any {
    return this.searchedType === 'invoiceNo' ? { invoiceNo: result.invoiceNo } : {};
  }
}
