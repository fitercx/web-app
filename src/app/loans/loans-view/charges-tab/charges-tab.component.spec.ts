import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ChargesTabComponent } from './charges-tab.component';

describe('ChargesTabComponent', () => {
  let component: ChargesTabComponent;
  let fixture: ComponentFixture<ChargesTabComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ChargesTabComponent]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ChargesTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows when a paid LPI was reversed and paid again', () => {
    const charge = {
      paid: true,
      isReversed: true,
      penalty: true,
      name: 'Daily Late Repayment Fee'
    };

    expect(component.chargeStatusLabel(charge)).toBe('Paid (LPI reversed earlier)');
    expect(component.chargeStatusClass(charge)).toBe('charge-status--paid-lpi-reversed-earlier');
  });

  it('keeps the normal paid label when the LPI has no reversal history', () => {
    expect(
      component.chargeStatusLabel({
        paid: true,
        isReversed: false,
        penalty: true,
        name: 'Daily Late Repayment Fee'
      })
    ).toBe('Paid');
  });

  it('keeps paid LPI reversal unavailable in the UI', () => {
    spyOn(component.dialog, 'open');

    component.undoPaidCharge({ id: 1, name: 'Daily Late Repayment Fee' });

    expect(component.lpiReversalAvailable).toBe(false);
    expect(component.dialog.open).not.toHaveBeenCalled();
  });
});
