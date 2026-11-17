import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { AccountDetailsComponent } from './account-details.component';

describe('AccountDetailsComponent', () => {
  let component: AccountDetailsComponent;
  let fixture: ComponentFixture<AccountDetailsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [AccountDetailsComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            parent: {
              data: of({
                loanDetailsData: {
                  transactionProcessingStrategyName: 'Pro-Rata Penalties, Fees, Interest, Principal order',
                  additionalProperties: {
                    dpdPrincipalOnlyActive: true,
                    effectiveRepaymentStrategyName: 'DPD Principal Only (auto-applied when DPD > threshold)'
                  }
                }
              })
            }
          }
        }
      ]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AccountDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows effective repayment strategy when DPD principal-only is active', () => {
    expect(component.displayRepaymentStrategyName).toBe('DPD Principal Only (auto-applied when DPD > threshold)');
  });
});
