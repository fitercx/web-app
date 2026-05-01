import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(TasksService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    if (!service) {
      throw new Error('Expected service instance to be created');
    }
  });

  it('supports savingsaccount withdraw action alias for client-name enrichment', () => {
    const isSupported = service.isClientNameFromCommandSourceSupported({
      actionName: 'WITHDRAW',
      entityName: 'SAVINGSACCOUNT'
    });

    if (!isSupported) {
      throw new Error('Expected SAVINGSACCOUNT + WITHDRAW to be supported for client name enrichment');
    }
  });

  it('resolves savingsaccount withdrawal client name by clientId when command payload has no name', () => {
    const checker = { actionName: 'WITHDRAWAL', entityName: 'SAVINGSACCOUNT' };
    const detail = {
      actionName: 'WITHDRAWAL',
      entityName: 'SAVINGSACCOUNT',
      commandSource: JSON.stringify({ clientId: '2426', savingsId: '3673' })
    };

    let resolvedName: string | undefined;
    service.resolveClientNameFromCheckerData(checker, detail).subscribe((name: string | undefined) => {
      resolvedName = name;
    });

    const req = httpMock.expectOne('/clients/2426');
    if (req.request.method !== 'GET') {
      throw new Error(`Expected GET request, got ${req.request.method}`);
    }
    req.flush({ displayName: 'POKE AND CO RESTAURANT LTD.' });

    if (resolvedName !== 'POKE AND CO RESTAURANT LTD.') {
      throw new Error(`Expected resolved name to match savings client, got ${resolvedName}`);
    }
  });

  it('resolves savings withdrawal client name via savings account id when client id is absent', () => {
    const row = {
      actionName: 'WITHDRAWAL',
      entityName: 'SAVINGSACCOUNT',
      resourceId: 3673
    };

    let resolvedName: string | undefined;
    service.resolveClientNameFromCheckerData(row, row).subscribe((name: string | undefined) => {
      resolvedName = name;
    });

    const req = httpMock.expectOne('/savingsaccounts/3673');
    if (req.request.method !== 'GET') {
      throw new Error(`Expected GET savings account request, got ${req.request.method}`);
    }
    req.flush({ clientName: 'POKE AND CO RESTAURANT LTD.' });

    if (resolvedName !== 'POKE AND CO RESTAURANT LTD.') {
      throw new Error(`Expected resolved name from savings account, got ${resolvedName}`);
    }
  });

  it('resolves accounttransfer create client names from fromClientId/toClientId', () => {
    const checker = { actionName: 'CREATE', entityName: 'ACCOUNTTRANSFER' };
    const detail = {
      actionName: 'CREATE',
      entityName: 'ACCOUNTTRANSFER',
      commandSource: JSON.stringify({ fromClientId: '1327', toClientId: '1800' })
    };

    let resolvedName: string | undefined;
    service.resolveClientNameFromCheckerData(checker, detail).subscribe((name: string | undefined) => {
      resolvedName = name;
    });

    const reqFromClient = httpMock.expectOne('/clients/1327');
    if (reqFromClient.request.method !== 'GET') {
      throw new Error(`Expected GET request for source client, got ${reqFromClient.request.method}`);
    }
    reqFromClient.flush({ displayName: 'Client From' });

    const reqToClient = httpMock.expectOne('/clients/1800');
    if (reqToClient.request.method !== 'GET') {
      throw new Error(`Expected GET request for destination client, got ${reqToClient.request.method}`);
    }
    reqToClient.flush({ displayName: 'Client To' });

    if (resolvedName !== 'Client From -> Client To') {
      throw new Error(`Expected account transfer client name to include source and destination, got ${resolvedName}`);
    }
  });
});
