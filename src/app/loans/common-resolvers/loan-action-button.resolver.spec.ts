import { of, throwError } from 'rxjs';
import { foreclosureTemplateFailurePayload, LoanActionButtonResolver } from './loan-action-button.resolver';

describe('LoanActionButtonResolver foreclosure', () => {
  function paramMap(action: string, loanId = '16487') {
    return {
      paramMap: {
        get: (key: string) => (key === 'action' ? action : key === 'loanId' ? loanId : null)
      },
      parent: { paramMap: { get: () => loanId } }
    } as any;
  }

  it('maps overdue-LOC template errors so Foreclosure navigation still succeeds', (done) => {
    const loansService = {
      getLoanForeclosureActionTemplate: () =>
        throwError({
          error: {
            errors: [
              {
                defaultUserMessage:
                  'Loan 16487 cannot be foreclosed on 2026-09-02 because it is on or past its earliest unpaid installment due date (2026-08-29).',
                userMessageGlobalisationCode: 'error.msg.loan.foreclosure.not.allowed.on.or.after.due.date'
              }
            ]
          }
        }),
      getLoanData: () =>
        of({ currency: { code: 'AED', displaySymbol: 'AED' }, timeline: { expectedMaturityDate: [
              2026,
              8,
              29
            ] } })
    };
    const resolver = new LoanActionButtonResolver(loansService as any);

    resolver.resolve(paramMap('Foreclosure')).subscribe((data) => {
      expect(data.foreclosureTemplateError).toContain('cannot be foreclosed on 2026-09-02');
      expect(data.foreclosureTemplateErrorCode).toBe('error.msg.loan.foreclosure.not.allowed.on.or.after.due.date');
      expect(data.currency.code).toBe('AED');
      expect(data.expectedMaturityDate).toEqual([
        2026,
        8,
        29
      ]);
      done();
    });
  });

  it('extracts the Fineract user message from the errors array', () => {
    expect(
      foreclosureTemplateFailurePayload({
        error: { errors: [{ defaultUserMessage: 'blocked', userMessageGlobalisationCode: 'error.x' }] }
      })
    ).toEqual({
      foreclosureTemplateError: 'blocked',
      foreclosureTemplateErrorCode: 'error.x'
    });
  });
});
