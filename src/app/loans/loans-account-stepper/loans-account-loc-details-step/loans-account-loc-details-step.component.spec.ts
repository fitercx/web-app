import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoansAccountLocDetailsStepComponent } from './loans-account-loc-details-step.component';

describe('LoansAccountLocDetailsStepComponent', () => {
  let component: LoansAccountLocDetailsStepComponent;
  let fixture: ComponentFixture<LoansAccountLocDetailsStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LoansAccountLocDetailsStepComponent]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LoansAccountLocDetailsStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
