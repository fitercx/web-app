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
});
