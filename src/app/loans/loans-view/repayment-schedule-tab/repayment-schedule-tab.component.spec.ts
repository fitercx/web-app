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
      const period: any = { complete: false, principalDue: 50, totalPaidForPeriod: 0 };
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
        principalDue: 5177.97,
        totalPaidForPeriod: 0,
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
        totalPaidForPeriod: 576.08,
        totalOutstandingForPeriod: 87691.87
      };
      component.repaymentScheduleDetails = {
        periods: [period],
        totalOutstanding: 87691.87
      };

      expect(component.getOriginalEmiAmount(period)).toBeCloseTo(87619.86, 6);
      expect(component.getDisplayTotalDueForPeriod(period)).toBeCloseTo(88267.95, 6);
      expect(component.getDisplayTotalOutstandingForPeriod(period)).toBeCloseTo(87691.87, 6);
      expect(component.getDisplayedTotalOutstanding()).toBeCloseTo(87691.87, 6);
    });

    it('includes LPI in Due Payment and footer without changing EMI or Overdue Interest', () => {
      const overdue: any = {
        period: 1,
        principalDue: 85000,
        interestDue: 2619.86,
        feeChargesDue: 0,
        taxChargesDue: 0,
        penaltyChargesDue: 648.09,
        penaltyChargesWaived: 0,
        totalDueForPeriod: 88267.95
      };
      const current: any = {
        period: 2,
        principalDue: 85000,
        interestDue: 2000,
        penaltyChargesDue: 0,
        totalDueForPeriod: 87000
      };
      component.repaymentScheduleDetails = { periods: [
          overdue,
          current
        ] };

      expect(component.getOriginalEmiAmount(overdue)).toBeCloseTo(87619.86, 6);
      expect(component.getDisplayTotalDueForPeriod(overdue)).toBeCloseTo(88267.95, 6);
      expect(component.getDisplayOverdueInterestForPeriod(overdue)).toBeCloseTo(648.09, 6);
      expect(component.getDisplayTotalDueForPeriod(current)).toBeCloseTo(87000, 6);
      expect(component.getDisplayTotalRepaymentExpected()).toBeCloseTo(175267.95, 6);
    });

    it('does not add waived LPI into Due Payment', () => {
      const period: any = {
        principalDue: 1000,
        interestDue: 50,
        penaltyChargesDue: 0,
        penaltyChargesWaived: 25,
        totalWaivedForPeriod: 25,
        totalDueForPeriod: 1050
      };

      expect(component.getDisplayTotalDueForPeriod(period)).toBeCloseTo(1050, 6);
      expect(component.getDisplayOverdueInterestForPeriod(period)).toBeCloseTo(25, 6);
      expect(component.isWaivedOverdueInterestOnly(period)).toBe(true);
    });

    it('after paying EMI plus LPI, Due includes LPI and Outstanding is zero', () => {
      const period: any = {
        principalDue: 15000,
        interestDue: 688.22,
        feeChargesDue: 0,
        taxChargesDue: 0,
        penaltyChargesDue: 99.27,
        penaltyChargesWaived: 0,
        totalWaivedForPeriod: 0,
        totalPaidForPeriod: 15787.49,
        totalOutstandingForPeriod: 99.27
      };

      expect(component.getOriginalEmiAmount(period)).toBeCloseTo(15688.22, 6);
      expect(component.getDisplayTotalDueForPeriod(period)).toBeCloseTo(15787.49, 6);
      expect(component.getDisplayTotalOutstandingForPeriod(period)).toBeCloseTo(0, 6);
    });

    it('subtracts waived charged amounts from Due Payment', () => {
      const period: any = {
        principalDue: 15000,
        interestDue: 688.22,
        penaltyChargesDue: 99.27,
        penaltyChargesWaived: 99.27,
        totalWaivedForPeriod: 99.27,
        totalPaidForPeriod: 0
      };

      expect(component.getDisplayTotalDueForPeriod(period)).toBeCloseTo(15688.22, 6);
      expect(component.getDisplayTotalOutstandingForPeriod(period)).toBeCloseTo(15688.22, 6);
    });

    it('matches arrears when a refunded LPI is outstanding on an overdue installment', () => {
      const period: any = {
        principalDue: 11930.56,
        penaltyChargesDue: 8.97,
        totalPaidForPeriod: 0,
        penaltyChargesOutstanding: 8.97,
        totalOutstandingForPeriod: 11939.53
      };

      expect(component.getDisplayTotalDueForPeriod(period)).toBeCloseTo(11939.53, 6);
      expect(component.getDisplayTotalOutstandingForPeriod(period)).toBeCloseTo(11939.53, 6);
    });
  });
});
