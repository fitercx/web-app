import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ClientsService } from '../clients.service';

/** Fetch single LOC */
@Injectable({ providedIn: 'root' })
export class ClientLocResolver implements Resolve<any> {
  constructor(private clientsService: ClientsService) {}
  resolve(route: ActivatedRouteSnapshot): Observable<any> {
    const clientId = route.parent?.paramMap.get('clientId') || route.paramMap.get('clientId');
    const locId = route.paramMap.get('locId');
    if (!clientId || !locId) {
      return of(null);
    }
    return this.clientsService.getClientCreditLine(clientId, locId).pipe(catchError(() => of(null)));
  }
}
