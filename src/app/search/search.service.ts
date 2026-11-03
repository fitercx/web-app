/** Angular Imports */
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** rxjs Imports */
import { Observable } from 'rxjs';

export interface LoanRecordSearchResult {
  loanId: number;
  loanAccountNo: string;
  clientId?: number;
  groupId?: number;
  borrowerName: string;
  product: string;
  outstanding: number;
  currencyCode: string;
  status: string;
  invoiceNo?: string;
}

export interface SavingsAccountLoanSearchResult {
  savingsAccountFound: boolean;
  savingsAccountNo?: string;
  loans: LoanRecordSearchResult[];
}

/**
 * Search service.
 */
@Injectable({
  providedIn: 'root'
})
export class SearchService {
  /**
   * @param {HttpClient} http Http Client to send requests.
   */
  constructor(private http: HttpClient) {}

  /**
   * @param {string} query Query String
   * @param {string} resource Entity resource
   * @returns {Observable<any>} Search Results.
   */
  getSearchResults(query: string, resource: string): Observable<any> {
    const httpParams = new HttpParams().set('exactMatch', 'false').set('query', query).set('resource', resource);
    return this.http.get('/search', { params: httpParams });
  }

  searchLoanRecords(type: 'loanId' | 'invoiceNo', value: string): Observable<LoanRecordSearchResult[]> {
    const httpParams = new HttpParams().set('type', type).set('value', value);
    return this.http.get<LoanRecordSearchResult[]>('/loans/crediblex/search', { params: httpParams });
  }

  searchLoansBySavingsAccountNo(accountNo: string): Observable<SavingsAccountLoanSearchResult> {
    const httpParams = new HttpParams().set('accountNo', accountNo);
    return this.http.get<SavingsAccountLoanSearchResult>('/loans/crediblex/search/savings-account', {
      params: httpParams
    });
  }
}
