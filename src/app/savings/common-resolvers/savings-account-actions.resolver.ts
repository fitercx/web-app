/** Angular Imports */
import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';

/** rxjs Imports */
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

/** Custom Services */
import { SavingsService } from '../savings.service';
import { ClientsService } from 'app/clients/clients.service';

/**
 * Savings Account Actions data resolver.
 */
@Injectable()
export class SavingsAccountActionsResolver implements Resolve<Object> {
  /**
   * @param {SavingsService} savingsService Savings service.
   * @param {ClientsService} clientsService Clients service.
   */
  constructor(
    private savingsService: SavingsService,
    private clientsService: ClientsService
  ) {}

  /**
   * Returns the Savings account actions data.
   * @param {ActivatedRouteSnapshot} route Route Snapshot
   * @returns {Observable<any>}
   */
  resolve(route: ActivatedRouteSnapshot): Observable<any> {
    const actionName = route.paramMap.get('name');
    const savingAccountId =
      route.paramMap.get('savingAccountId') || route.parent.parent.paramMap.get('savingAccountId');
    switch (actionName) {
      case 'Assign Staff':
        return this.savingsService.getSavingsAccountAndTemplate(savingAccountId, true);
      case 'Add Charge':
        // Fetch savings account data first to get clientId, then fetch charge template and client accounts
        return this.savingsService.getSavingsAccountData(savingAccountId).pipe(
          switchMap((savingsAccountData: any) => {
            const clientId = savingsAccountData.clientId;
            // Fetch both charge template and client accounts data
            return forkJoin({
              chargeTemplate: this.savingsService.getSavingsChargeTemplateResource(savingAccountId),
              clientAccounts: clientId ? this.clientsService.getClientAccountData(clientId) : of({ loanAccounts: [] })
            }).pipe(
              map((data: any) => {
                // Combine the data with the structure expected by the component
                return {
                  chargeOptions: data.chargeTemplate.chargeOptions,
                  loanAccounts: data.clientAccounts.loanAccounts || []
                };
              })
            );
          })
        );
      case 'Withdrawal':
      case 'Deposit':
      case 'Hold Amount':
        return this.savingsService.getSavingsTransactionTemplateResource(savingAccountId);
      case 'Close':
        return forkJoin([
          this.savingsService.getSavingsTransactionTemplateResource(savingAccountId),
          this.savingsService.getSavingsAccountData(savingAccountId)]);
      case 'Apply Annual Fees':
        return this.savingsService.getSavingsAccountData(savingAccountId);
      default:
        return undefined;
    }
  }
}
