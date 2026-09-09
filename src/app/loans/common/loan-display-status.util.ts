/**
 * Status shown on loan header / account list.
 * Closure checkboxes drive the overlay: Forced Closure, else Restructured, else core status.
 * Substatus Foreclosed is a fallback when flags were not posted.
 */
export function loanDisplayStatus(loan: any): string {
  if (!loan) {
    return '';
  }
  if (loan.additionalProperties?.isForcedClosure || loan.isForcedClosure) {
    return 'Foreclosed';
  }
  if (loan.additionalProperties?.isRestructured || loan.isRestructured) {
    return 'Restructured';
  }
  const subStatus = loan.subStatus?.value || loan.loanSubStatus?.value;
  if (subStatus === 'Foreclosed') {
    return 'Foreclosed';
  }
  return loan.status?.value || loan.status?.code || '';
}
