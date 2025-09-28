import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditTrailTabComponent } from './audit-trail-tab.component';

describe('AuditTrailTabComponent', () => {
  let component: AuditTrailTabComponent;
  let fixture: ComponentFixture<AuditTrailTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuditTrailTabComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AuditTrailTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
