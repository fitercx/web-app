import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RepaymentScheduleTabComponent } from './repayment-schedule-tab.component';

describe('RepaymentScheduleTabComponent', () => {
  let component: RepaymentScheduleTabComponent;
  let fixture: ComponentFixture<RepaymentScheduleTabComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [RepaymentScheduleTabComponent]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RepaymentScheduleTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(!!component).equal(true);
  });

  describe('shouldShowOutstanding', () => {
    it('returns false when installment complete', () => {
      const period: any = { complete: true, totalOutstandingForPeriod: 100 };
      expect(component.shouldShowOutstanding(period)).equal(false);
    });

    it('returns false when outstanding is zero', () => {
      const period: any = { complete: false, totalOutstandingForPeriod: 0 };
      expect(component.shouldShowOutstanding(period)).equal(false);
    });

    it('returns true when outstanding positive and not complete', () => {
      const period: any = { complete: false, totalOutstandingForPeriod: 50 };
      expect(component.shouldShowOutstanding(period)).equal(true);
    });
  });

  describe('installmentStyle', () => {
    beforeEach(() => {
      component.businessDate = new Date(2026, 6, 27); // 27 Jul 2026
    });

    it('does not mark past-due rows red when outstanding is zero', () => {
      const period: any = {
        complete: false,
        totalOutstandingForPeriod: 0,
        fromDate: [
          2026,
          6,
          26
        ],
        dueDate: [
          2026,
          6,
          26
        ]
      };
      expect(component.installmentStyle(period)).equal('paid');
    });

    it('marks past-due rows red when outstanding remains', () => {
      const period: any = {
        complete: false,
        totalOutstandingForPeriod: 5177.97,
        fromDate: [
          2026,
          6,
          2
        ],
        dueDate: [
          2026,
          6,
          2
        ]
      };
      expect(component.installmentStyle(period)).equal('overdued');
    });
  });
});
