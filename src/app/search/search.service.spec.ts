import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { SavingsAccountLoanSearchResult, SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(SearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('searches loans by savings account number', () => {
    const response: SavingsAccountLoanSearchResult = {
      savingsAccountFound: true,
      savingsAccountNo: '000001234',
      loans: []
    };
    let actual: SavingsAccountLoanSearchResult | undefined;

    service.searchLoansBySavingsAccountNo('1234').subscribe((result) => (actual = result));

    const request = httpMock.expectOne(
      (req) => req.url === '/loans/crediblex/search/savings-account' && req.params.get('accountNo') === '1234'
    );
    expect(request.request.method).toBe('GET');
    request.flush(response);
    expect(actual).toEqual(response);
  });
});
