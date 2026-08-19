/** Angular Imports */
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** rxjs Imports */
import { Observable } from 'rxjs';
import { Dates } from 'app/core/utils/dates';
import { SettingsService } from 'app/settings/settings.service';

/** Accrual report row from backend (Generate Loan Monthly Accrual Summations logic) */
export interface AccrualReportPeriod {
  index: number;
  endOfMonth: string;
  openingPrincipal: number;
  closingPrincipal: number;
  interestAccrued: number;
  actualInterestAccrued: number | null;
}

/**
 * Loans service.
 */
@Injectable({
  providedIn: 'root'
})
export class LoansService {
  constructor(
    private http: HttpClient,
    private settingsService: SettingsService,
    private dateUtils: Dates
  ) {}
  /**
   * @param {string} loanId loanId of the loan.
   * @returns {Observable<any>}
   */
  getLoanChargeTemplateResource(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/charges/template`);
  }

  getLoanActionTemplate(loanId: string, command: string): Observable<any> {
    const httpParams = new HttpParams().set('command', command);
    return this.http.get(`/loans/${loanId}/transactions/template`, { params: httpParams });
  }

  /** Repayment template for a specific transaction date (authoritative pay-now amount on the loan). */
  getLoanRepaymentTemplate(loanId: string, transactionDate: string): Observable<any> {
    const httpParams = new HttpParams()
      .set('command', 'repayment')
      .set('transactionDate', transactionDate)
      .set('locale', this.settingsService.language.code)
      .set('dateFormat', this.settingsService.dateFormat);
    return this.http.get(`/loans/${loanId}/transactions/template`, { params: httpParams });
  }

  getLoanPenaltiesTemplate(loanId: string, transactionDate?: string): Observable<any> {
    let httpParams = new HttpParams()
      .set('locale', this.settingsService.language.code)
      .set('dateFormat', this.settingsService.dateFormat);

    if (transactionDate) {
      httpParams = httpParams.set('transactionDate', transactionDate);
    }

    return this.http.get(`/loans/crediblex/${loanId}/transactions/template/penalties`, { params: httpParams });
  }

  /**
   * Calculates additional future LPI (late payment interest) charges for a selected transaction date.
   */
  getFutureLPICharges(loanId: string, transactionDate: string): Observable<any> {
    const httpParams = new HttpParams()
      .set('locale', this.settingsService.language.code)
      .set('dateFormat', this.settingsService.dateFormat)
      .set('transactionDate', transactionDate);

    return this.http.get(`/loans/crediblex/${loanId}/transactions/future-charges`, { params: httpParams });
  }

  getLoanPrepayLoanActionTemplate(loanId: string, transactionDate: string): Observable<any> {
    if (!transactionDate) {
      transactionDate = this.dateUtils.formatDate(this.settingsService.businessDate, this.settingsService.dateFormat);
    }
    const httpParams = new HttpParams()
      .set('command', 'prepayLoan')
      .set('transactionDate', transactionDate)
      .set('locale', this.settingsService.language.code)
      .set('dateFormat', this.settingsService.dateFormat);
    return this.http.get(`/loans/${loanId}/transactions/template`, { params: httpParams });
  }

  getLoanForeclosureActionTemplate(loanId: string): Observable<any> {
    const httpParams = new HttpParams()
      .set('command', 'foreclosure')
      .set('locale', this.settingsService.language.code)
      .set('dateFormat', this.settingsService.dateFormat)
      .set(
        'transactionDate',
        this.dateUtils.formatDate(this.settingsService.businessDate, this.settingsService.dateFormat)
      );
    return this.http.get(`/loans/${loanId}/transactions/template`, { params: httpParams });
  }

  getLoanAccountResource(loanId: string, associations: string): Observable<any> {
    const httpParams = new HttpParams().set('associations', associations);
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  getLoanData(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}`);
  }

  /**
   * Retrieves accrual report for a loan (same data as "Generate Loan Monthly Accrual Summations" job).
   */
  getAccrualReport(loanId: string): Observable<{ periods: AccrualReportPeriod[] }> {
    return this.http.get(`/loans/${loanId}/accrual-report`) as Observable<{ periods: AccrualReportPeriod[] }>;
  }

  getLoanKeyFactStatement(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/key-fact-statement`);
  }

  getGuarantorTemplate(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/guarantors/template`);
  }

  createNewGuarantor(loanId: string, data: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/guarantors`, data);
  }

  deleteGuarantor(loanId: any, guarantorId: any): Observable<any> {
    return this.http.delete(`/loans/${loanId}/guarantors/${guarantorId}`);
  }

  deleteLoanAccount(loanId: any): Observable<any> {
    return this.http.delete(`/loans/${loanId}`);
  }

  getDelinquencyTags(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/delinquencytags`);
  }

  getDelinquencyData(loanId: string) {
    const httpParams = new HttpParams().set('associations', 'collection').set('exclude', 'guarantors,futureSchedule');
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  getDelinquencyActions(loanId: string) {
    return this.http.get(`/loans/${loanId}/delinquency-actions`);
  }

  createDelinquencyActions(loanId: string, delinquencyActions: any) {
    return this.http.post(`/loans/${loanId}/delinquency-actions`, delinquencyActions);
  }

  /**
   * Returns the loan template data with specific condition
   * @param loanId Loan Id
   */
  getLoanTemplate(loanId: string): Observable<any> {
    const httpParams = new HttpParams()
      .set('fields', 'id,loanOfficerId,loanOfficerOptions')
      .set('staffInSelectedOfficeOnly', 'true')
      .set('template', 'true');
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  /**
   * @param {any} loanCharge to apply on a Loan Account.
   * @returns {Observable<any>}
   */
  createLoanCharge(loanId: string, resourceType: string, loanCharge: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/${resourceType}`, loanCharge);
  }

  /**
   * Get Loan Account Details
   * @param loanId Loan Id
   */
  getLoanAccountDetails(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}`);
  }

  /**
   * Payload for client general-tab expanded loan row: nominal interest, interest kind, repayment schedule (for next EMI).
   * Schedule EMI in UI uses totalDueForPeriod (see repayment-schedule tab).
   */
  getLoanGeneralTabExpandData(loanId: string): Observable<any> {
    let httpParams = new HttpParams()
      .set('fields', 'annualInterestRate,interestRatePerPeriod,interestType,numberOfRepayments,loanProductId')
      .set('associations', 'repaymentSchedule');
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  /**
   * @deprecated Prefer getLoanGeneralTabExpandData — includes schedule-aligned EMI.
   */
  getLoanCoreInterestFields(loanId: string): Observable<any> {
    const httpParams = new HttpParams().set('fields', 'annualInterestRate,interestRatePerPeriod');
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  /**
   * Get collateral template.
   * @param {string} loanId Loan Id.
   * @returns {Observable<any>}
   */
  getLoanCollateralTemplate(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/collaterals/template`);
  }

  /**
   * Get collaterals.
   * @param {string} loanId Loan Id.
   * @returns {Observable<any>}
   */
  getLoanCollaterals(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/collaterals`);
  }

  /**
   * Create Loan Collateral.
   * @param {string} loanId Loan Id.
   * @param {any} collateralData Collateral Data.
   * @returns {Observable<any>}
   */
  createLoanCollateral(loanId: string, collateralData: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/collaterals`, collateralData);
  }

  /**
   * Get Loans details with httpParams
   * @param loanId Loan ID
   */
  getLoanAccountAssociationDetails(loanId: string, includeReversed = false) {
    const httpParams = new HttpParams()
      .set('associations', 'all')
      .set('exclude', 'guarantors,futureSchedule')
      .set('includeReversed', String(includeReversed));
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  /** Lists all charges on a loan account (including paid/waived history). */
  getLoanAccountCharges(loanId: string | number): Observable<any> {
    return this.http.get(`/loans/${loanId}/charges`);
  }

  /**
   * Loads loan transactions only. Use includeReversed=true to include system-reversed rows
   * (e.g. replaced repayments, original charge-adjustment rows).
   */
  getLoanTransactions(loanId: string, includeReversed = true): Observable<any> {
    const httpParams = new HttpParams()
      .set('associations', 'transactions')
      .set('includeReversed', String(includeReversed));
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  getApproveAssociationsDetails(loanId: any) {
    const httpParams = new HttpParams().set('associations', 'multiDisburseDetails');
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }
  /**
   * @param loanId Loan Id
   * @returns The notes for particular loan
   */
  getLoanNotes(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/notes`);
  }

  /**
   * Gets loan notes with document attachments (includes presigned URLs for viewing)
   * @param loanId Loan ID
   */
  getLoanNotesWithDocuments(loanId: string): Observable<any> {
    return this.http.get(`/loans/${loanId}/notes-with-documents`);
  }

  /**
   * Adds a note to the particular Loan Id
   * @param loanId Loan ID
   * @param noteData Note Data to be added
   * @returns {Observable<any>}
   */
  createLoanNote(loanId: string, noteData: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/notes`, noteData);
  }

  /**
   * Creates a loan note with document attachments
   * @param loanId Loan ID
   * @param noteData Note data with documents
   */
  createLoanNoteWithDocuments(loanId: string, noteData: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/notes-with-documents`, noteData);
  }

  /**
   * Edits the Loan Note
   * @param loanId Loan ID
   * @param noteId Note ID
   * @param noteData Note Data
   */
  editLoanNote(loanId: string, noteId: string, noteData: any) {
    return this.http.put(`/loans/${loanId}/notes/${noteId}`, noteData);
  }

  /**
   * Deletes the particular Note
   * @param loanId Loan ID
   * @param noteId Note ID
   */
  deleteLoanNote(loanId: string, noteId: string) {
    return this.http.delete(`/loans/${loanId}/notes/${noteId}`);
  }

  /**
   * Used For: Close Action, Prepay Loan Action
   * Returns the response of the action
   * @param loanId Loan Id
   * @param data Data
   * @param command Command
   */
  submitLoanActionButton(loanId: string, data: any, command: any) {
    const httpParams = new HttpParams().set('command', command);
    return this.http.post(`/loans/${loanId}/transactions`, data, { params: httpParams });
  }

  getLoanScreenReportsData(): Observable<any> {
    const httpParams = new HttpParams().set('entityId', '1').set('typeId', '0');
    return this.http.get(`/templates`, { params: httpParams });
  }

  /**
   * Get Loan Datatables
   */
  getLoanDataTables() {
    const httpParams = new HttpParams().set('apptable', 'm_loan');
    return this.http.get(`/datatables`, { params: httpParams });
  }

  /**
   * Get Loan Datatable
   * @param loanId Loan ID
   * @param datatableName Datatable Name
   */
  getLoanDatatable(loanId: string, datatableName: string) {
    const httpParams = new HttpParams().set('genericResultSet', 'true');
    return this.http.get(`/datatables/${datatableName}/${loanId}`, { params: httpParams });
  }

  /**
   * @param loanId Loan Id of loan to get add datatable entry for.
   * @param datatableName Data Table name.
   * @param data Data.
   * @returns {Observable<any>}
   */
  addLoanDatatableEntry(loanId: string, datatableName: string, data: any): Observable<any> {
    const httpParams = new HttpParams().set('genericResultSet', 'true');
    return this.http.post(`/datatables/${datatableName}/${loanId}`, data, { params: httpParams });
  }

  /**
   * @param loanId Loan Id of loan to get add datatable entry for.
   * @param datatableName Data Table name.
   * @param data Data.
   * @returns {Observable<any>}
   */
  editLoanDatatableEntry(loanId: string, datatableName: string, data: any): Observable<any> {
    const httpParams = new HttpParams().set('genericResultSet', 'true');
    return this.http.put(`/datatables/${datatableName}/${loanId}`, data, { params: httpParams });
  }

  /**
   * @param loanId Loan Id of loan to get add datatable entry for.
   * @param datatableName Data Table name.
   * @returns {Observable<any>}
   */
  deleteDatatableContent(loanId: string, datatableName: string): Observable<any> {
    const httpParams = new HttpParams().set('genericResultSet', 'true');
    return this.http.delete(`/datatables/${datatableName}/${loanId}`, { params: httpParams });
  }

  /**
   * @param {string} loanId Loan Id.
   * @param {any} data Data.
   * @returns {Observable<any>}
   */
  loanActionButtons(loanId: any, command: any, data?: any): Observable<any> {
    const httpParams = new HttpParams().set('command', command);
    return this.http.post(`/loans/${loanId}`, data, { params: httpParams });
  }

  addInterestPauseToLoan(loanId: any, data?: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/interest-pauses`, data);
  }

  getInterestPausesOfLoan(loanId: any): Observable<any> {
    return this.http.get(`/loans/${loanId}/interest-pauses`);
  }

  updateInterestPause(loanId: number, variationId: number, data?: any): Observable<any> {
    return this.http.put(`/loans/${loanId}/interest-pauses/${variationId}`, data);
  }

  deleteInterestPause(loanId: number, variationId: number): Observable<any> {
    return this.http.delete(`/loans/${loanId}/interest-pauses/${variationId}`);
  }

  /**
   * @param {string|number} loanId Loan Id.
   * @param {any} foreclosuredata ForeClosure Data
   */
  getForeclosureData(loanId: string | number, foreclosuredata: any) {
    const httpParams = new HttpParams()
      .set('command', foreclosuredata.command)
      .set('dateFormat', foreclosuredata.dateFormat)
      .set('locale', foreclosuredata.locale)
      .set('transactionDate', foreclosuredata.transactionDate);
    return this.http.get(`/loans/${loanId}/transactions/template`, { params: httpParams });
  }

  /**
   * @param {string|number} loanId Loan Id
   * @param {any} data Data
   */
  loanForclosureData(loanId: any, data: any) {
    const httpParams = new HttpParams().set('command', 'foreclosure');
    return this.http.post(`/loans/${loanId}/transactions`, data, { params: httpParams });
  }

  /**
   * @param {string|number} loanId Loan Id
   * @param {any} data Data
   */
  editDisbursements(loanId: any, data: any) {
    return this.http.put(`/loans/${loanId}/disbursements/editDisbursements`, data);
  }

  /**
   * Returns the Reschedule Loans Template
   */
  rescheduleLoanTemplate() {
    return this.http.get('/rescheduleloans/template');
  }

  /**
   * Returns the Loan Reschedule request
   */
  loanRescheduleRequests(loanId: any) {
    const httpParams = new HttpParams().set('loanId', loanId);
    return this.http.get('/rescheduleloans', { params: httpParams });
  }

  /**
   * Returns the Loan Reschedule request
   */
  applyCommandLoanRescheduleRequests(rescheduleId: any, command: string, data: any) {
    const httpParams = new HttpParams().set('command', command);
    return this.http.post(`/rescheduleloans/${rescheduleId}`, data, { params: httpParams });
  }

  /**
   * Submits Reschedule Data
   * @param {any} data Data
   */
  submitRescheduleData(data: any) {
    const httpParams = new HttpParams().set('command', 'reschedule');
    return this.http.post('/rescheduleloans', data, { params: httpParams });
  }

  /**
   * Gets Loan Account Template
   * @param {any} clientId Client ID
   * @param {any} productId Product ID
   */
  getLoansAccountTemplateResource(entityId: any, isGroup: boolean, productId?: any): Observable<any> {
    let httpParams = new HttpParams().set('activeOnly', 'true').set('staffInSelectedOfficeOnly', 'true');
    httpParams = productId ? httpParams.set('productId', productId) : httpParams;
    httpParams = isGroup
      ? httpParams.set('groupId', entityId).set('templateType', 'group')
      : httpParams.set('clientId', entityId).set('templateType', 'individual');
    return this.http.get('/loans/template', { params: httpParams });
  }

  getLoansAccountAndTemplateResource(loanId: any): Observable<any> {
    const httpParams = new HttpParams()
      .set('associations', 'charges,collateral,meeting,multiDisburseDetails')
      .set('staffInSelectedOfficeOnly', 'true')
      .set('template', 'true');
    return this.http.get(`/loans/${loanId}`, { params: httpParams });
  }

  /**
   * Get Loans Collateral Template
   * @param {any} productId Product ID
   */
  getLoansCollateralTemplateResource(productId: any): Observable<any> {
    const httpParams = new HttpParams()
      .set('fields', 'id, loanCollateralOptions')
      .set('productId', productId)
      .set('templateType', 'collateral');
    return this.http.get('/loans/template', { params: httpParams });
  }

  /**
   * Creates Loans Account
   * @param {any} loanAccount Loan Account
   */
  createLoansAccount(loanAccount: any): Observable<any> {
    return this.http.post('/loans', loanAccount);
  }

  getLoanDocuments(loanId: any): Observable<any> {
    return this.http.get(`/loans/${loanId}/documents`);
  }

  downloadLoanDocument(parentEntityId: string, documentId: string) {
    return this.http.get(`/loans/${parentEntityId}/documents/${documentId}/attachment`, { responseType: 'blob' });
  }

  deleteLoanDocument(loanId: any, documentId: any): Observable<any> {
    return this.http.delete(`/loans/${loanId}/documents/${documentId}`);
  }

  loadLoanDocument(loanId: any, data: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/documents`, data);
  }

  /**
   * @param clientId Client Id
   * @param clientName Client Name
   * @param fromAccountId Account Id
   * @param locale Locale
   * @param dateFormat Date Format
   * @returns {Observable<any>} Standing Instructions
   */
  getStandingInstructions(
    clientId: string,
    clientName: string,
    fromAccountId: string,
    locale: string,
    dateFormat: string
  ): Observable<any> {
    const httpParams = new HttpParams()
      .set('clientId', clientId)
      .set('clientName', clientName)
      .set('fromAccountId', fromAccountId)
      .set('fromAccountType', '1')
      .set('locale', locale)
      .set('dateFormat', dateFormat)
      .set('limit', '14')
      .set('offset', '0');
    return this.http.get(`/standinginstructions`, { params: httpParams });
  }

  updateLoansAccount(loanId: any, loanData: any): Observable<any> {
    return this.http.put(`/loans/${loanId}`, loanData);
  }

  getTemplateData(templateId: any, loanId: any): Observable<any> {
    const httpParams = new HttpParams().set('loanId', loanId);
    return this.http.post(`/templates/${templateId}`, {}, { params: httpParams, responseType: 'text' });
  }

  /**
   * Get Loan Charge Aproval template.
   * @param {string} loanId Loan Id.
   * @returns {Observable<any>}
   */
  getLoanApprovalTemplate(loanId: string): Observable<any> {
    const httpParams = new HttpParams().set('templateType', 'approval');
    return this.http.get(`/loans/${loanId}/template`, { params: httpParams });
  }

  guarantorAccountResource(loanId: string, clientId: any): Observable<any> {
    const httpParams = new HttpParams().set('clientId', clientId);
    return this.http.get(`/loans/${loanId}/guarantors/accounts/template`, { params: httpParams });
  }

  /**
   * @param {string} accountId loans account Id
   * @param {string} chargeId loans charge Id
   * @returns {Observable<any>}
   */
  getLoansAccountCharge(accountId: string, chargeId: string): Observable<any> {
    return this.http.get(`/loans/${accountId}/charges/${chargeId}`);
  }

  /**
   * @param {string} accountId Loans Account Id
   * @param {string} command Command
   * @param {any} data Data
   * @param {string} chargeId Charge Id
   * @returns {Observable<any>}
   */
  executeLoansAccountChargesCommand(accountId: string, command: string, data: any, chargeId: any): Observable<any> {
    const httpParams = new HttpParams().set('command', command);
    return this.http.post(`/loans/${accountId}/charges/${chargeId}`, data, { params: httpParams });
  }

  /**
   * @param {string} accountId Loans Account Id
   * @param {any} data Charge Data
   * @param {any} chargeId Charge Id
   * @returns {Observable<any>}
   */
  editLoansAccountCharge(accountId: string, data: any, chargeId: any): Observable<any> {
    return this.http.put(`/loans/${accountId}/charges/${chargeId}`, data);
  }

  /**
   * @param {string} accountId Loans Account Id
   * @param {any} data Adjust Installment Date Data
   * @returns {Observable<any>}
   */
  adjustInstallmentDate(accountId: string, data: any): Observable<any> {
    return this.http.post(`/loan-adjust-installment/${accountId}`, data);
  }

  /**
   * Template for the Adjust Installment Date dialog: whether interest recalculation is available for this loan and,
   * if not, the reason (used to disable the option and show an on-screen message).
   * @param {string} accountId Loans Account Id
   * @returns {Observable<any>}
   */
  adjustInstallmentDateTemplate(accountId: string): Observable<any> {
    return this.http.get(`/loan-adjust-installment/${accountId}/template`);
  }

  /**
   * Bulk-waives outstanding overdue charges (LPI). Selection payload supports dueDate/toDueDate,
   * removeCompleteEmiOverdue + selectedEmiNumbers, or no filters (waive all). Charges are waived through the
   * standard waiver flow so accounting entries and the audit trail are preserved; charges are never
   * destructively deactivated.
   * @param {string} accountId Loans Account Id
   * @param {any} data Selection payload
   * @returns {Observable<any>}
   */
  bulkWaiveOverdueCharges(accountId: string, data: any): Observable<any> {
    const httpParams = new HttpParams().set('command', 'bulkWaiveOverdue');
    return this.http.post(`/loans/${accountId}/charges`, data, { params: httpParams });
  }

  /**
   * @param {string} loanId Loans Account Id
   * @param {string} command Schedule command
   * @returns {Observable<any>}
   */
  applyCommandLoanScheduleVariations(loanId: string, command: string, payload: any): Observable<any> {
    return this.http.post(`/loans/${loanId}/schedule?command=${command}`, payload);
  }

  /**
   * @param {string} accountId Loans Account Id
   * @param {string} transactionId Transaction Id
   * @returns {Observable<any>}
   */
  getLoansAccountTransaction(accountId: string, transactionId: string): Observable<any> {
    return this.http.get(`/loans/${accountId}/transactions/${transactionId}`);
  }

  /**
   * @param {string} accountId Loans Account Id
   * @param {string} transactionId Transaction Id
   * @returns {Observable<any>}
   */
  getLoansAccountTransactionTemplate(accountId: string, transactionId: string): Observable<any> {
    const httpParams = new HttpParams().set('template', 'true');
    return this.http.get(`/loans/${accountId}/transactions/${transactionId}`, { params: httpParams });
  }

  /**
   * @param {string} accountId Loans Account Id
   * @param {string} command Command
   * @param {any} data Data
   * @param {string} transactionId Transaction Id
   * @returns {Observable<any>}
   */
  executeLoansAccountTransactionsCommand(
    accountId: string,
    command: string,
    data: any,
    transactionId?: any
  ): Observable<any> {
    const httpParams = new HttpParams().set('command', command);
    if (transactionId) {
      return this.http.post(`/loans/${accountId}/transactions/${transactionId}`, data, { params: httpParams });
    }
    return this.http.post(`/loans/${accountId}/transactions`, data, { params: httpParams });
  }

  /**
   * @param glimId GLIM Id of account to get data for.
   * @returns {Observable<any>} GLIM Account data.
   */
  getGLIMAccountData(glimId: string, groupId: string): Observable<any> {
    return this.http.get(`/loans/glimAccount/${glimId}`);
  }

  getGLIMLoanAccountTemplate(groupId: any): Observable<any> {
    const httpParams = new HttpParams()
      .set('groupId', groupId)
      // Commenting parameter, because it doesn't exist:
      // https://localhost:8443/fineract-provider/swagger-ui/index.html#/Loans/template_10
      //   .set('lendingStrategy', '300')
      .set('templateType', 'jlgbulk');
    return this.http.get('/loans/template', { params: httpParams });
  }

  createGlimAccount(payload: any): Observable<any> {
    return this.http.post('/batches?enclosingTransaction=true', payload);
  }

  calculateLoanSchedule(payload: any): Observable<any> {
    return this.http.post('/loans?command=calculateLoanSchedule', payload);
  }

  /**
   * @param loansAccount Loan account data used for the request
   * @param loansAccountTemplate Loan account template for getting product default values
   * @param calendarOptions Calendar options
   * @param locale String to send to backend
   * @param dateFormat String with date format to manage dates
   * @returns Object with Loan Account payload data.
   */
  buildLoanRequestPayload(
    loansAccount: any,
    loansAccountTemplate: any,
    calendarOptions: any,
    locale: string,
    dateFormat: string
  ): any {
    const loansAccountData = {
      ...loansAccount,
      charges: loansAccount.charges.map((charge: any) => ({
        chargeId: charge.id,
        amount: charge.amount,
        dueDate: charge.dueDate && this.dateUtils.formatDate(charge.dueDate, dateFormat)
      })),
      disbursementData: loansAccount.disbursementData.map((item: any) => ({
        expectedDisbursementDate: this.dateUtils.formatDate(item.expectedDisbursementDate, dateFormat),
        principal: item.principal
      })),
      interestChargedFromDate: this.dateUtils.formatDate(loansAccount.interestChargedFromDate, dateFormat),
      repaymentsStartingFromDate: this.dateUtils.formatDate(loansAccount.repaymentsStartingFromDate, dateFormat),
      submittedOnDate: this.dateUtils.formatDate(loansAccount.submittedOnDate, dateFormat),
      expectedDisbursementDate: this.dateUtils.formatDate(loansAccount.expectedDisbursementDate, dateFormat),
      dateFormat,
      locale
    };

    if (loansAccount.collateral) {
      loansAccountData.collateral = loansAccount.collateral.map((collateralEle: any) => ({
        clientCollateralId: collateralEle.type.collateralId,
        quantity: collateralEle.value
      }));
    }

    if (loansAccountTemplate.clientId && loansAccountTemplate.group?.id) {
      loansAccountData.clientId = loansAccountTemplate.clientId;
      loansAccountData.groupId = loansAccountTemplate.group.id;
      loansAccountData.loanType = 'glim';
    } else if (loansAccountTemplate.clientId) {
      loansAccountData.clientId = loansAccountTemplate.clientId;
      loansAccountData.loanType = 'individual';
    } else {
      loansAccountData.groupId = loansAccountTemplate.group.id;
      loansAccountData.loanType = 'group';
    }

    if (loansAccountData.syncRepaymentsWithMeeting) {
      loansAccountData.calendarId = calendarOptions[0].id;
      delete loansAccountData.syncRepaymentsWithMeeting;
    }

    if (loansAccountData.recalculationRestFrequencyDate) {
      loansAccountData.recalculationRestFrequencyDate = this.dateUtils.formatDate(
        loansAccount.recalculationRestFrequencyDate,
        dateFormat
      );
    }

    if (loansAccountData.interestCalculationPeriodType === 0) {
      loansAccountData.allowPartialPeriodInterestCalculation = false;
    }
    if (!(loansAccountData.isFloatingInterestRate === false)) {
      delete loansAccountData.isFloatingInterestRate;
    }
    if (!loansAccountData.multiDisburseLoan) {
      delete loansAccountData.disbursementData;
    }
    delete loansAccountData.isValid;
    loansAccountData.principal = loansAccountData.principalAmount;
    delete loansAccountData.principalAmount;
    delete loansAccountData.multiDisburseLoan; // this was just added so that disbursement data can be send in the backend

    loansAccountData.allowPartialPeriodInterestCalcualtion = loansAccountData.allowPartialPeriodInterestCalculation;
    delete loansAccountData.allowPartialPeriodInterestCalculation;

    if (loansAccount.lineOfCreditId && loansAccount.lineOfCreditId !== '') {
      loansAccountData.lineOfCreditId = loansAccount.lineOfCreditId;
    } else {
      delete loansAccountData.lineOfCreditId;
    }

    // Handle LOC Details fields (they come flattened at root level)
    if (loansAccount.invoiceNo) {
      loansAccountData.invoiceNo = loansAccount.invoiceNo;
    }
    if (loansAccount.invoiceDate) {
      loansAccountData.invoiceDate = this.dateUtils.formatDate(loansAccount.invoiceDate, dateFormat);
    }
    if (loansAccount.invoiceDueDate) {
      loansAccountData.invoiceDueDate = this.dateUtils.formatDate(loansAccount.invoiceDueDate, dateFormat);
    }
    if (loansAccount.invoiceAmount !== undefined && loansAccount.invoiceAmount !== null) {
      loansAccountData.invoiceAmount = loansAccount.invoiceAmount;
    }
    if (loansAccount.invoiceCurrency) {
      loansAccountData.invoiceCurrency = loansAccount.invoiceCurrency;
    }
    if (loansAccount.disapprovedAmount !== undefined && loansAccount.disapprovedAmount !== null) {
      loansAccountData.disapprovedAmount = loansAccount.disapprovedAmount;
    }
    if (loansAccount.approvedReceivableAmount !== undefined && loansAccount.approvedReceivableAmount !== null) {
      loansAccountData.approvedReceivableAmount = loansAccount.approvedReceivableAmount;
    }
    if (loansAccount.advancePercentage !== undefined && loansAccount.advancePercentage !== null) {
      loansAccountData.advancePercentage = loansAccount.advancePercentage;
    }
    if (loansAccount.amountAfterAdvance !== undefined && loansAccount.amountAfterAdvance !== null) {
      loansAccountData.amountAfterAdvance = loansAccount.amountAfterAdvance;
    }
    if (loansAccount.buyerDetails) {
      // Ensure backend receives an array as expected
      loansAccountData.buyerDetails = Array.isArray(loansAccount.buyerDetails)
        ? loansAccount.buyerDetails
        : [loansAccount.buyerDetails];
    }
    if (loansAccount.exchangeRate !== undefined && loansAccount.exchangeRate !== null) {
      loansAccountData.exchangeRate = loansAccount.exchangeRate;
    }
    if (loansAccount.markup !== undefined && loansAccount.markup !== null) {
      loansAccountData.markup = loansAccount.markup;
    }
    if (loansAccount.amountInFacilityCurrency !== undefined && loansAccount.amountInFacilityCurrency !== null) {
      loansAccountData.amountInFacilityCurrency = loansAccount.amountInFacilityCurrency;
    }
    if (loansAccount.approvedPayableAmount !== undefined && loansAccount.approvedPayableAmount !== null) {
      loansAccountData.approvedPayableAmount = loansAccount.approvedPayableAmount;
    }
    if (loansAccount.supplierDetails) {
      // Ensure backend receives an array as expected
      loansAccountData.supplierDetails = Array.isArray(loansAccount.supplierDetails)
        ? loansAccount.supplierDetails
        : [loansAccount.supplierDetails];
    }

    // Handle Short Disbursal flag for RBF loans
    if (loansAccount.isShortDisbursal !== undefined && loansAccount.isShortDisbursal !== null) {
      loansAccountData.isShortDisbursal = loansAccount.isShortDisbursal;
    }

    return loansAccountData;
  }
}
