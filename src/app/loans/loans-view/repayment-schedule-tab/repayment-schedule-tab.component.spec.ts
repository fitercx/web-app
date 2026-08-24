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
    expect(!!component).toBe(true);
  });

  describe('shouldShowOutstanding', () => {
    it('returns false when installment complete', () => {
      const period: any = { complete: true, totalOutstandingForPeriod: 100 };
      expect(component.shouldShowOutstanding(period)).toBe(false);
    });

    it('returns false when outstanding is zero', () => {
      const period: any = { complete: false, totalOutstandingForPeriod: 0 };
      expect(component.shouldShowOutstanding(period)).toBe(false);
    });

    it('returns true when outstanding positive and not complete', () => {
      const period: any = { complete: false, totalOutstandingForPeriod: 50 };
      expect(component.shouldShowOutstanding(period)).toBe(true);
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
      expect(component.installmentStyle(period)).toBe('paid');
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
      expect(component.installmentStyle(period)).toBe('overdued');
    });
  });

  describe('paid LPI display', () => {
    it('keeps net paid LPI in amount paid and late paid', () => {
      const period: any = {
        totalPaidForPeriod: 36.54,
        totalPaidLateForPeriod: 36.54,
        penaltyChargesPaid: 36.54
      };
      component.repaymentScheduleDetails = { periods: [period] };

      expect(component.getDisplayTotalPaidForPeriod(period)).toBe(36.54);
      expect(component.getDisplayTotalPaidLateForPeriod(period)).toBe(36.54);
      expect(component.getDisplayTotalRepayment()).toBe(36.54);
      expect(component.getDisplayTotalPaidLate()).toBe(36.54);
    });

    it('keeps contractual EMI unchanged and includes reopened LPI in current outstanding', () => {
      const period: any = {
        principalDue: 85000,
        interestDue: 2619.86,
        penaltyChargesDue: 648.09,
        penaltyChargesOutstanding: 72.01,
        totalDueForPeriod: 88267.95,
        totalOutstandingForPeriod: 87691.87
      };
      component.repaymentScheduleDetails = {
        periods: [period],
        totalOutstanding: 87691.87
      };

      expect(component.getOriginalEmiAmount(period)).toBeCloseTo(87619.86, 6);
      expect(component.getDisplayTotalDueForPeriod(period)).toBeCloseTo(87619.86, 6);
      expect(component.getDisplayTotalOutstandingForPeriod(period)).toBeCloseTo(87691.87, 6);
      expect(component.getDisplayedTotalOutstanding()).toBeCloseTo(87691.87, 6);
    });

    it('matches arrears when a refunded LPI is outstanding on an overdue installment', () => {
      const period: any = {
        penaltyChargesOutstanding: 8.97,
        totalOutstandingForPeriod: 11939.53
      };

      expect(component.getDisplayTotalOutstandingForPeriod(period)).toBeCloseTo(11939.53, 6);
    });
  });
});
