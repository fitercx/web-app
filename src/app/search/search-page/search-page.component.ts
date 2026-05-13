/** Angular Imports */
import { Component } from '@angular/core';
import { UntypedFormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

/** rxjs Imports */
import { finalize } from 'rxjs/operators';

/** Custom Services */
import { LoanRecordSearchResult, SearchService } from '../search.service';

type SearchType = 'loanId' | 'invoiceNo';

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
  searchTypeOptions = [
    { value: 'loanId', label: 'Loan ID' },
    { value: 'invoiceNo', label: 'Invoice Number' }
  ];
  results: LoanRecordSearchResult[] = [];
  searchedValue = '';
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
      if ((type === 'loanId' || type === 'invoiceNo') && value) {
        this.searchType.patchValue(type, { emitEvent: false });
        this.searchValue.patchValue(value, { emitEvent: false });
        this.search();
      }
    });
  }

  get inputLabel(): string {
    return this.searchType.value === 'invoiceNo' ? 'Enter Invoice Number' : 'Enter Loan ID';
  }

  search(): void {
    const value = String(this.searchValue.value || '').trim();
    if (!value || this.loading) {
      return;
    }
    this.submitted = true;
    this.searchedValue = value;
    this.results = [];
    this.loading = true;

    this.searchService
      .searchLoanRecords(this.searchType.value, value)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe(
        (results: LoanRecordSearchResult[]) => {
          this.results = this.searchType.value === 'loanId' ? results.slice(0, 1) : results;
        },
        () => {
          this.results = [];
        }
      );
  }

  loanLink(result: LoanRecordSearchResult): any[] {
    const parentSegment = result.clientId ? 'clients' : 'groups';
    const parentId = result.clientId || result.groupId;
    const tab = this.searchType.value === 'invoiceNo' ? 'loc-details' : 'general';
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
    return this.searchType.value === 'invoiceNo' ? { invoiceNo: result.invoiceNo } : {};
  }
}
