/** Angular Imports */
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** rxjs Imports */
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

/**
 * Tasks Service
 */
@Injectable({
  providedIn: 'root'
})
export class TasksService {
  private readonly clientNameActionEntityMap = new Set([
    'client:create',
    'savingsaccount:withdrawal',
    'savingsaccount:withdraw',
    'accounttransfer:create'
  ]);

  /**
   * @param {HttpClient} http Http Client to send requests.
   */
  constructor(private http: HttpClient) {}

  isClientNameFromCommandSourceSupported(checker: any): boolean {
    const actionEntityKey = this.getActionEntityKey(checker);
    return this.clientNameActionEntityMap.has(actionEntityKey);
  }

  parseCommandData(commandData: any): any {
    if (!commandData) {
      return {};
    }

    if (typeof commandData === 'object') {
      return commandData;
    }

    if (typeof commandData !== 'string') {
      return {};
    }

    try {
      return JSON.parse(commandData);
    } catch {
      return {};
    }
  }

  extractClientNameFromCheckerData(checker: any, checkerDetail?: any): string | undefined {
    if (checker?.clientName) {
      return checker.clientName;
    }

    const actionEntityKey = this.getActionEntityKey(checkerDetail || checker);
    if (!this.clientNameActionEntityMap.has(actionEntityKey)) {
      return undefined;
    }

    const commandSource = this.parseCommandData(checkerDetail?.commandSource);
    const commandAsJson = this.parseCommandData(checkerDetail?.commandAsJson);

    const genericClientName = this.firstNonEmptyValue([
      this.findValueByKnownKeys(commandSource, [
        'clientName',
        'clientDisplayName',
        'displayName',
        'fullName',
        'fullname'
      ]),
      this.findValueByKnownKeys(commandAsJson, [
        'clientName',
        'clientDisplayName',
        'displayName',
        'fullName',
        'fullname'
      ])

    ]);

    if (actionEntityKey === 'accounttransfer:create') {
      const fromClientName = this.firstNonEmptyValue([
        this.findValueByKnownKeys(commandSource, [
          'fromClientName',
          'fromClientDisplayName',
          'sourceClientName'
        ]),
        this.findValueByKnownKeys(commandAsJson, [
          'fromClientName',
          'fromClientDisplayName',
          'sourceClientName'
        ])

      ]);
      const toClientName = this.firstNonEmptyValue([
        this.findValueByKnownKeys(commandSource, [
          'toClientName',
          'toClientDisplayName',
          'destinationClientName'
        ]),
        this.findValueByKnownKeys(commandAsJson, [
          'toClientName',
          'toClientDisplayName',
          'destinationClientName'
        ])

      ]);

      if (fromClientName && toClientName && fromClientName !== toClientName) {
        return `${fromClientName} -> ${toClientName}`;
      }

      return fromClientName || toClientName || genericClientName;
    }

    if (actionEntityKey === 'savingsaccount:withdrawal' || actionEntityKey === 'savingsaccount:withdraw') {
      return (
        this.firstNonEmptyValue([
          this.findValueByKnownKeys(commandSource, [
            'accountHolderName',
            'accountOwnerName',
            'savingsClientName',
            'clientDisplayName'
          ]),
          this.findValueByKnownKeys(commandAsJson, [
            'accountHolderName',
            'accountOwnerName',
            'savingsClientName',
            'clientDisplayName'
          ])

        ]) || genericClientName
      );
    }

    if (actionEntityKey === 'client:create') {
      const fullNameFromParts =
        this.buildClientNameFromNameParts(commandSource) || this.buildClientNameFromNameParts(commandAsJson);
      return fullNameFromParts || genericClientName;
    }

    return genericClientName;
  }

  resolveClientNameFromCheckerData(checker: any, checkerDetail?: any): Observable<string | undefined> {
    const mappedChecker = checkerDetail || checker;
    const actionEntityKey = this.getActionEntityKey(mappedChecker);

    const extractedName = this.extractClientNameFromCheckerData(checker, checkerDetail);
    if (extractedName || !this.clientNameActionEntityMap.has(actionEntityKey)) {
      return of(extractedName);
    }

    const ids = this.extractClientIdsFromCheckerData(checker, checkerDetail);

    if (actionEntityKey === 'accounttransfer:create') {
      if (ids.fromClientId && ids.toClientId && ids.fromClientId !== ids.toClientId) {
        return forkJoin([
          this.getClientNameById(ids.fromClientId),
          this.getClientNameById(ids.toClientId)]).pipe(
          map(
            ([
              fromName,
              toName
            ]: [
              (
                | string
                | undefined
              ),
              (
                | string
                | undefined
              )
            ]) => {
              if (fromName && toName && fromName !== toName) {
                return `${fromName} -> ${toName}`;
              }
              return fromName || toName;
            }
          )
        );
      }

      return this.getClientNameById(ids.fromClientId || ids.toClientId);
    }

    if (actionEntityKey === 'savingsaccount:withdrawal' || actionEntityKey === 'savingsaccount:withdraw') {
      const explicitOnly = this.extractSavingsWithdrawalExplicitClientId(checker, checkerDetail);
      return this.getClientNameById(explicitOnly).pipe(
        switchMap((name: string | undefined) =>
          name
            ? of(name)
            : this.getClientNameFromSavingsAccountId(this.pickSavingsAccountPkForWithdrawal(checker, checkerDetail))
        )
      );
    }

    return this.getClientNameById(ids.clientId);
  }

  /**
   * For withdrawal, never treat resource_id as client id — it usually points at the savings account or txn.
   * Uses joined client_id on the checker row plus ids embedded in JSON only.
   */
  private extractSavingsWithdrawalExplicitClientId(checker: any, checkerDetail?: any): string | undefined {
    const commandSource = this.parseCommandData(checkerDetail?.commandSource);
    const commandAsJson = this.parseCommandData(checkerDetail?.commandAsJson);
    const fromJson = (keys: string[]): string | undefined =>
      this.firstNonEmptyValue([
        this.findValueByKnownKeys(commandSource, keys),
        this.findValueByKnownKeys(commandAsJson, keys)])?.toString();

    return this.firstNonEmptyValue([
      fromJson([
        'clientId',
        'accountHolderId',
        'savingsClientId'
      ]),
      checkerDetail?.clientId?.toString(),
      checker?.clientId?.toString()

    ]);
  }

  /**
   * Mirrors Fineract portfolio command fields: savings id on resource/subresource plus JSON savingsId when present.
   */
  private pickSavingsAccountPkForWithdrawal(checker: any, checkerDetail?: any): string | undefined {
    const commandSource = this.parseCommandData(checkerDetail?.commandSource);
    const commandAsJson = this.parseCommandData(checkerDetail?.commandAsJson);
    const merged = checkerDetail || checker;

    const fromCommands = this.firstNonEmptyValue([
      this.findValueByKnownKeys(commandSource, [
        'savingsId',
        'savingsAccountId'
      ]),
      this.findValueByKnownKeys(commandAsJson, [
        'savingsId',
        'savingsAccountId'
      ])

    ])?.toString();

    return this.firstNonEmptyValue([
      fromCommands,
      merged?.resourceId?.toString(),
      merged?.subresourceId?.toString()
    ]);
  }

  private getClientNameFromSavingsAccountId(savingsAccountId?: string): Observable<string | undefined> {
    if (!savingsAccountId) {
      return of(undefined);
    }

    return this.http.get(`/savingsaccounts/${savingsAccountId}`).pipe(
      map((acc: any) => this.firstNonEmptyValue([acc?.clientName])),
      catchError(() => of(undefined))
    );
  }

  private getActionEntityKey(checker: any): string {
    const actionName = (checker?.actionName || '').toString().trim().toLowerCase();
    const entityName = (checker?.entityName || '').toString().trim().toLowerCase();
    return `${entityName}:${actionName}`;
  }

  private firstNonEmptyValue(values: any[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
      }

      if (typeof value === 'number' && !Number.isNaN(value)) {
        return value.toString();
      }
    }

    return undefined;
  }

  private findValueByKnownKeys(source: any, keys: string[]): string | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }

    const matchedValue = this.findValueByKnownKeysRecursive(
      source,
      new Set(keys.map((key: string) => key.toLowerCase()))
    );
    if (typeof matchedValue === 'string') {
      return matchedValue.trim();
    }

    if (typeof matchedValue === 'number' && !Number.isNaN(matchedValue)) {
      return matchedValue.toString();
    }

    return undefined;
  }

  private extractClientIdsFromCheckerData(
    checker: any,
    checkerDetail?: any
  ): {
    clientId?: string;
    fromClientId?: string;
    toClientId?: string;
  } {
    const target = checkerDetail || checker;
    const actionEntityKey = this.getActionEntityKey(target);
    const commandSource = this.parseCommandData(checkerDetail?.commandSource);
    const commandAsJson = this.parseCommandData(checkerDetail?.commandAsJson);

    const getIdFromSources = (keys: string[]): string | undefined => {
      const value = this.firstNonEmptyValue([
        this.findValueByKnownKeys(commandSource, keys),
        this.findValueByKnownKeys(commandAsJson, keys)]);
      return value ? value.toString() : undefined;
    };

    if (actionEntityKey === 'accounttransfer:create') {
      const fromClientId = getIdFromSources([
        'fromClientId',
        'sourceClientId'
      ]);
      const toClientId = getIdFromSources([
        'toClientId',
        'destinationClientId'
      ]);
      return { fromClientId, toClientId };
    }

    const clientId = this.firstNonEmptyValue([
      getIdFromSources([
        'clientId',
        'accountHolderId',
        'savingsClientId'
      ]),
      checkerDetail?.clientId?.toString(),
      checker?.clientId?.toString(),
      checkerDetail?.resourceId?.toString(),
      checker?.resourceId?.toString()

    ]);

    return { clientId };
  }

  private getClientNameById(clientId?: string): Observable<string | undefined> {
    if (!clientId) {
      return of(undefined);
    }

    return this.http.get(`/clients/${clientId}`).pipe(
      map((client: any) =>
        this.firstNonEmptyValue([
          client?.displayName,
          client?.clientName,
          client?.fullName,
          client?.fullname,
          client?.accountNo
        ])
      ),
      catchError(() => of(undefined))
    );
  }

  private findValueByKnownKeysRecursive(source: any, keys: Set<string>): string | number | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }

    for (const [
      key,
      value
    ] of Object.entries(source)) {
      if (keys.has(key.toLowerCase()) && typeof value === 'string' && value.trim() !== '') {
        return value;
      }

      if (keys.has(key.toLowerCase()) && typeof value === 'number' && !Number.isNaN(value)) {
        return value;
      }

      if (value && typeof value === 'object') {
        const nestedValue = this.findValueByKnownKeysRecursive(value, keys);
        if (nestedValue) {
          return nestedValue;
        }
      }
    }

    return undefined;
  }

  private buildClientNameFromNameParts(source: any): string | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }

    const firstName = this.findValueByKnownKeys(source, [
      'firstname',
      'firstName',
      'givenName'
    ]);
    const middleName = this.findValueByKnownKeys(source, [
      'middlename',
      'middleName'
    ]);
    const lastName = this.findValueByKnownKeys(source, [
      'lastname',
      'lastName',
      'surname',
      'familyName'
    ]);

    const fullName = [
      firstName,
      middleName,
      lastName
    ]
      .filter((name: string | undefined) => !!name)
      .join(' ')
      .trim();
    return fullName || undefined;
  }

  /**
   * Get Maker Checker Data
   * @param {searchData} SearchData search the maker checker data.
   */
  getMakerCheckerData(searchData?: any): Observable<any> {
    let httpParams = new HttpParams().set('includeJson', 'true');
    if (searchData) {
      const propNames = Object.getOwnPropertyNames(searchData);
      for (let i = 0; i < propNames.length; i++) {
        const propName = propNames[i];
        if (!(searchData[propName] === '' || searchData[propName] === undefined || searchData[propName] === null)) {
          httpParams = httpParams.set(propName, searchData[propName]);
        }
      }
    }
    return this.http.get('/makercheckers', { params: httpParams });
  }

  /**
   * Get Maker Checker Template
   */
  getMakerCheckerTemplate(): Observable<any> {
    return this.http.get('/makercheckers');
  }

  /**
   * Get Grouped Clients Data
   */
  getGroupedClientsData(): Observable<any> {
    const httpParams = new HttpParams().set('limit', '1000').set('status', 'PENDING');
    return this.http.get('/clients', { params: httpParams });
  }

  /**
   * Get all Offices Data
   */
  getAllOffices(): Observable<any> {
    return this.http.get('/offices');
  }

  /**
   * Get all loans to be approved
   */
  getAllLoansToBeApproved(): Observable<any> {
    const httpParams = new HttpParams().set('limit', '1000').set('status', '100');
    return this.http.get('/loans', { params: httpParams });
  }

  /**
   * Get all loans to be created
   */
  getAllLoansToBeDisbursed(): Observable<any> {
    const httpParams = new HttpParams().set('limit', '1000').set('status', '200');
    return this.http.get('/loans', { params: httpParams });
  }

  /**
   * Get Loans Locked Data using pages and limit
   */
  getAllLoansLocked(page: number, limit: number): Observable<any> {
    const httpParams = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get('/loans/locked', { params: httpParams });
  }

  /**
   * Get Pending Rescheduled Loans
   */
  getPendingRescheduleLoans(): Observable<any> {
    const httpParams = new HttpParams().set('command', 'pending');
    return this.http.get('/rescheduleloans', { params: httpParams });
  }

  /**
   * Submit data in batches.
   * @param {data} Data to be submitted
   */
  submitBatchData(data: any): Observable<any> {
    return this.http.post('/batches', data);
  }

  /**
   * Execute Maker Checker Approve and Reject Action.
   * @param {makerCheckerId} MakerCheckerId
   * @param {command} Command
   */
  executeMakerCheckerAction(makerCheckerId: any, command: any): Observable<any> {
    const httpParams = new HttpParams().set('command', command);
    return this.http.post(`/makercheckers/${makerCheckerId}`, {}, { params: httpParams });
  }

  /**
   * Execute Maker Checker Delete Action
   * @param {makerCheckerId} MakerCheckerId
   */
  deleteMakerChecker(makerCheckerId: any): Observable<any> {
    return this.http.delete(`/makercheckers/${makerCheckerId}`);
  }

  /**
   * Get Maker Checker Details.
   * @param {makerCheckerId} MakerCheckerId
   */
  getCheckerInboxDetail(makerCheckerId: any): Observable<any> {
    return this.http.get(`/audits/${makerCheckerId}`);
  }
}
