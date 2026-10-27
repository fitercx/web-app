import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';

import { LoanRecordSearchResult, SearchService } from '../search.service';
import { SearchPageComponent } from './search-page.component';

describe('SearchPageComponent', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let searchService: jasmine.SpyObj<SearchService>;
  let queryParamMap: BehaviorSubject<ParamMap>;

  const loan: LoanRecordSearchResult = {
    loanId: 5,
    loanAccountNo: '000000005',
    clientId: 12,
    borrowerName: 'Acme',
    product: 'Invoice Discounting',
    outstanding: 1000,
    currencyCode: 'AED',
    status: 'Active'
  };

  const emptyStateText = (): string => (fixture.nativeElement.querySelector('.empty-state')?.textContent || '').trim();

  beforeEach(async () => {
    searchService = jasmine.createSpyObj('SearchService', [
      'searchLoanRecords',
      'searchLoansBySavingsAccountNo'
    ]);
    queryParamMap = new BehaviorSubject<ParamMap>(convertToParamMap({}));

    await TestBed.configureTestingModule({
      declarations: [SearchPageComponent],
      imports: [
        ReactiveFormsModule,
        MatSelectModule,
        MatInputModule,
        NoopAnimationsModule,
        RouterTestingModule
      ],
      providers: [
        { provide: SearchService, useValue: searchService },
        { provide: ActivatedRoute, useValue: { queryParamMap } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('offers Savings Account No. as a search type with its own label', () => {
    expect(component.searchTypeOptions.map((option) => option.label)).toEqual([
      'Loan ID',
      'Invoice Number',
      'Savings Account No.'
    ]);
    component.searchType.setValue('savingsAccountNo');
    expect(component.inputLabel).toBe('Enter Savings Account No.');
  });

  it('lists loans linked to the savings account and links to the loan general tab', () => {
    searchService.searchLoansBySavingsAccountNo.and.returnValue(
      of({ savingsAccountFound: true, savingsAccountNo: '000001234', loans: [loan] })
    );
    component.searchType.setValue('savingsAccountNo');
    component.searchValue.setValue(' 1234 ');

    component.search();

    expect(searchService.searchLoansBySavingsAccountNo).toHaveBeenCalledWith('1234');
    expect(component.results).toEqual([loan]);
    expect(component.savingsAccountNo).toBe('000001234');
    expect(component.loanLink(loan)).toEqual([
      '/',
      'clients',
      12,
      'loans-accounts',
      5,
      'general'
    ]);
    expect(component.queryParams(loan)).toEqual({});

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.result-card').textContent).toContain('Savings Account No. 000001234');
  });

  it('shows the no-linked-loans message when the account exists without loans', () => {
    searchService.searchLoansBySavingsAccountNo.and.returnValue(
      of({ savingsAccountFound: true, savingsAccountNo: '000001234', loans: [] })
    );
    component.searchType.setValue('savingsAccountNo');
    component.searchValue.setValue('1234');

    component.search();
    fixture.detectChanges();

    expect(emptyStateText()).toBe('No loans linked to this savings account');
  });

  it('shows the standard no-record message when the savings account does not exist', () => {
    searchService.searchLoansBySavingsAccountNo.and.returnValue(of({ savingsAccountFound: false, loans: [] }));
    component.searchType.setValue('savingsAccountNo');
    component.searchValue.setValue('999');

    component.search();
    fixture.detectChanges();

    expect(emptyStateText()).toBe('No record found for 999');
  });

  it('runs a savings account search from the deep link query params', () => {
    searchService.searchLoansBySavingsAccountNo.and.returnValue(of({ savingsAccountFound: false, loans: [] }));

    queryParamMap.next(convertToParamMap({ type: 'savingsAccountNo', value: '1234' }));

    expect(component.searchType.value).toBe('savingsAccountNo');
    expect(searchService.searchLoansBySavingsAccountNo).toHaveBeenCalledWith('1234');
  });

  it('keeps result links tied to the searched type when the dropdown changes afterwards', () => {
    searchService.searchLoanRecords.and.returnValue(of([{ ...loan, invoiceNo: 'INV-1' }]));
    component.searchType.setValue('invoiceNo');
    component.searchValue.setValue('INV-1');
    component.search();

    component.searchType.setValue('savingsAccountNo');

    expect(component.loanLink(loan)[5]).toBe('loc-details');
  });
});
