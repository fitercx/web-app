import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import LoansViewComponent from './loans-view.component';

describe('LoansViewComponent', () => {
  let component: LoansViewComponent;
  let fixture: ComponentFixture<LoansViewComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [LoansViewComponent]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LoansViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(!!component).equal(true);
  });

  describe('getAdjustedCurrentBalance', () => {
    it('returns 0 when no data', () => {
      component.loanDetailsData = null as any;
      expect(component.getAdjustedCurrentBalance()).equal(0);
    });
    it('returns totalOutstanding when no overpayment', () => {
      component.loanDetailsData = { summary: { totalOutstanding: 150 } } as any;
      expect(component.getAdjustedCurrentBalance()).equal(150);
    });
    it('subtracts overPaidAmount', () => {
      component.loanDetailsData = { summary: { totalOutstanding: 200 }, totalOverpaid: 30 } as any;
      expect(component.getAdjustedCurrentBalance()).equal(170);
    });
    it('never goes below zero', () => {
      component.loanDetailsData = { summary: { totalOutstanding: 100 }, totalOverpaid: 150 } as any;
      expect(component.getAdjustedCurrentBalance()).equal(0);
    });
  });
});
