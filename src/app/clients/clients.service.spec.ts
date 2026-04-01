import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ClientsService } from './clients.service';

describe('ClientsService LOC blocked amount APIs', () => {
  let service: ClientsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(ClientsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('calls blockamount endpoint with expected payload', () => {
    const payload = {
      amount: 100,
      actionDate: '2026-03-31',
      dateFormat: 'yyyy-MM-dd',
      locale: 'en',
      note: 'Reserve funds'
    };

    service.blockLocAmount('1', '2', payload).subscribe();

    const req = httpMock.expectOne('/v1/clients/1/creditlines/2/blockamount');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ resourceId: 2 });
  });

  it('calls unblockamount endpoint with expected payload', () => {
    const payload = {
      amount: 40,
      actionDate: '2026-03-31',
      dateFormat: 'yyyy-MM-dd',
      locale: 'en'
    };

    service.unblockLocAmount('1', '2', payload).subscribe();

    const req = httpMock.expectOne('/v1/clients/1/creditlines/2/unblockamount');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ resourceId: 2 });
  });
});
