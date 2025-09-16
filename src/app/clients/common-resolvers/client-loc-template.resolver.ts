import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ClientsService } from '../clients.service';

/** Fetches LOC template for create form */
@Injectable({ providedIn: 'root' })
export class ClientLocTemplateResolver implements Resolve<any> {
  constructor(private clientsService: ClientsService) {}
  resolve(route: ActivatedRouteSnapshot): Observable<any> {
    const clientId = route.paramMap.get('clientId') || route.parent?.paramMap.get('clientId');
    if (!clientId) {
      return of(null);
    }
    return this.clientsService.getClientLocTemplate(clientId).pipe(catchError(() => of(null)));
  }
}
