import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of, forkJoin } from 'rxjs';
import { catchError, switchMap, map } from 'rxjs/operators';
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
    // Fetch single LOC, then enrich with loans from the LOC list (which includes detailed loan entries)
    return this.clientsService.getClientCreditLine(clientId, locId).pipe(
      switchMap((locData: any) => {
        // If LOC already contains loans, skip the list fetch
        const hasLoans =
          (Array.isArray(locData?.activeLoansList) && locData.activeLoansList.length) ||
          (Array.isArray(locData?.activeLoans) && locData.activeLoans.length) ||
          (Array.isArray((locData as any)?.loans) && (locData as any).loans.length);
        if (hasLoans) {
          return of(locData);
        }
        return this.clientsService.getClientCreditLines(clientId).pipe(
          map((locList: any[]) => {
            try {
              const match = Array.isArray(locList)
                ? locList.find((entry: any) => {
                    const e = entry?.lineOfCredit ? entry.lineOfCredit : entry;
                    return String(e?.id) === String(locId);
                  })
                : null;
              const loans = match?.loans || [];
              if (Array.isArray(loans) && loans.length) {
                return { ...locData, activeLoansList: loans, activeLoans: loans, loans };
              }
              return locData;
            } catch (e) {
              return locData;
            }
          }),
          catchError(() => of(locData))
        );
      }),
      catchError(() => of(null))
    );
  }
}
