import { FormBuilder } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { EditBlockedAmountDialogComponent } from './edit-blocked-amount-dialog.component';

describe('EditBlockedAmountDialogComponent', () => {
  function createComponent() {
    const dialogRefSpy = jasmine.createSpyObj<MatDialogRef<EditBlockedAmountDialogComponent>>('MatDialogRef', [
      'close'
    ]);
    const component = new EditBlockedAmountDialogComponent(new FormBuilder(), dialogRefSpy, {
      currentBlockedAmount: 100,
      currencyCode: 'USD',
      currencyDecimalPlaces: 2
    });
    return { component, dialogRefSpy };
  }

  it('requires positive amount for block action', () => {
    const { component } = createComponent();
    component.form.patchValue({ action: 'block', amount: 0 });
    component.submit();

    expect(component.form.get('amount')?.hasError('positive')).toBeTrue();
  });

  it('prevents unblock amount greater than current blocked amount', () => {
    const { component } = createComponent();
    component.form.patchValue({ action: 'unblock', amount: 200 });
    component.submit();

    expect(component.form.get('amount')?.hasError('exceedsBlocked')).toBeTrue();
  });

  it('returns action payload with yyyy-MM-dd date and optional note', () => {
    const { component, dialogRefSpy } = createComponent();
    component.form.patchValue({
      action: 'unblock',
      amount: 25.5,
      actionDate: new Date('2026-03-31T00:00:00.000Z'),
      note: 'release part'
    });

    component.submit();

    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      action: 'unblockamount',
      payload: {
        amount: 25.5,
        actionDate: '2026-03-31',
        dateFormat: 'yyyy-MM-dd',
        locale: 'en',
        note: 'release part'
      }
    });
  });
});
