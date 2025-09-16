import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ClientsService } from '../clients.service';

/**
 * Resolves list of Lines of Credit for a client (v1 endpoint returns array of objects with { lineOfCredit, loans })
 */
@Injectable({ providedIn: 'root' })
export class ClientLocListResolver implements Resolve<any> {
  constructor(private clientsService: ClientsService) {}
  resolve(route: ActivatedRouteSnapshot): Observable<any> {
    const clientId = route.paramMap.get('clientId') || route.parent?.paramMap.get('clientId');
    if (!clientId) {
      return of([]);
    }
    return this.clientsService.getClientCreditLines(clientId).pipe(catchError(() => of([])));
  }
}
