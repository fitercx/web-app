import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

/** Routing Imports */
import { Route } from '../core/route/route.service';

/** Custom Components */
import { ClientsComponent } from './clients.component';
import { ClientsViewComponent } from './clients-view/clients-view.component';
import { GeneralTabComponent } from './clients-view/general-tab/general-tab.component';
import { FamilyMembersTabComponent } from './clients-view/family-members-tab/family-members-tab.component';
import { AddFamilyMemberComponent } from './clients-view/family-members-tab/add-family-member/add-family-member.component';
import { EditFamilyMemberComponent } from './clients-view/family-members-tab/edit-family-member/edit-family-member.component';
import { IdentitiesTabComponent } from './clients-view/identities-tab/identities-tab.component';
import { NotesTabComponent } from './clients-view/notes-tab/notes-tab.component';
import { DocumentsTabComponent } from './clients-view/documents-tab/documents-tab.component';
import { DatatableTabComponent } from './clients-view/datatable-tab/datatable-tab.component';
import { AddressTabComponent } from './clients-view/address-tab/address-tab.component';
import { ClientActionsComponent } from './clients-view/client-actions/client-actions.component';
import { ViewChargeComponent } from './clients-view/charges/view-charge/view-charge.component';
import { ClientPayChargesComponent } from './clients-view/charges/client-pay-charges/client-pay-charges.component';
import { EditClientComponent } from './edit-client/edit-client.component';
import { CreateClientComponent } from './create-client/create-client.component';

/** Custom Resolvers */
import { ClientViewResolver } from './common-resolvers/client-view.resolver';
import { ClientAccountsResolver } from './common-resolvers/client-accounts.resolver';
import { ClientAddressResolver } from './common-resolvers/client-address.resolver';
import { ClientChargesResolver } from './common-resolvers/client-charges.resolver';
import { ClientSummaryResolver } from './common-resolvers/client-summary.resolver';
import { ClientFamilyMembersResolver } from './common-resolvers/client-family-members.resolver';
import { ClientFamilyMemberResolver } from './common-resolvers/client-family-member.resolver';
import { ClientTemplateResolver } from './common-resolvers/client-template.resolver';
import { ClientIdentitiesResolver } from './common-resolvers/client-identities.resolver';
import { ClientNotesResolver } from './common-resolvers/client-notes.resolver';
import { ClientDocumentsResolver } from './common-resolvers/client-document.resolver';
import { ClientDatatablesResolver } from './common-resolvers/client-datatables.resolver';
import { ClientDatatableResolver } from './common-resolvers/client-datatable.resolver';
import { ClientIdentifierTemplateResolver } from './common-resolvers/client-identifier-template.resolver';
import { ClientAddressFieldConfigurationResolver } from './common-resolvers/client-address-fieldconfiguration.resolver';
import { ClientAddressTemplateResolver } from './common-resolvers/client-address-template.resolver';
import { ChargesOverviewComponent } from './clients-view/charges/charges-overview/charges-overview.component';
import { ClientChargeOverviewResolver } from './clients-view/charges/charges-overview/charge-overview.resolver';
import { ClientActionsResolver } from './common-resolvers/client-actions.resolver';
import { ClientLocTemplateResolver } from 'app/clients/common-resolvers/client-loc-template.resolver';
import { ClientLocResolver } from 'app/clients/common-resolvers/client-loc.resolver';
import { ClientLocListResolver } from 'app/clients/common-resolvers/client-loc-list.resolver';
import { ClientChargeViewResolver } from './common-resolvers/client-charge-view.resolver';
import { ClientTransactionPayResolver } from './common-resolvers/client-transaction-pay.resolver';
import { ClientDataAndTemplateResolver } from './common-resolvers/client-and-template.resolver';
import { ClientCollateralResolver } from './common-resolvers/client-collateral.resolver';
import { ViewLocDetailsComponent } from './clients-view/view-loc-details/view-loc-details.component';
import { CreateLocComponent } from './clients-view/client-actions/create-loc/create-loc.component';
import { CurrenciesResolver } from '../accounting/common-resolvers/currencies.resolver';
import { ChargesResolver } from 'app/products/charges/charges.resolver';
import { EditLocComponent } from './clients-view/client-actions/edit-loc/edit-loc.component';

const routes: Routes = [
  Route.withShell([
    {
      path: 'clients',
      data: { title: 'Clients', breadcrumb: 'Clients', routeParamBreadcrumb: false },
      children: [
        {
          path: '',
          component: ClientsComponent
        },
        {
          path: 'create',
          data: { title: 'Create Client', breadcrumb: 'Create Client', routeParamBreadcrumb: false },
          component: CreateClientComponent,
          resolve: {
            clientAddressFieldConfig: ClientAddressFieldConfigurationResolver,
            clientTemplate: ClientTemplateResolver
          }
        },
        {
          path: ':clientId',
          component: ClientsViewComponent,
          data: { title: 'Clients View', routeParamBreadcrumb: 'clientId' },
          resolve: {
            clientViewData: ClientViewResolver,
            clientTemplateData: ClientTemplateResolver,
            clientDatatables: ClientDatatablesResolver
          },
          children: [
            {
              path: '',
              redirectTo: 'general',
              pathMatch: 'full'
            },
            {
              path: 'general',
              component: GeneralTabComponent,
              data: { title: 'General', breadcrumb: 'General', routeParamBreadcrumb: false },
              resolve: {
                clientAccountsData: ClientAccountsResolver,
                clientChargesData: ClientChargesResolver,
                clientCollateralData: ClientCollateralResolver,
                clientLocList: ClientLocListResolver
              }
            },
            {
              path: 'address',
              component: AddressTabComponent,
              data: { title: 'Address', breadcrumb: 'Address', routeParamBreadcrumb: false },
              resolve: {
                clientAddressFieldConfig: ClientAddressFieldConfigurationResolver,
                clientAddressTemplateData: ClientAddressTemplateResolver,
                clientAddressData: ClientAddressResolver
              }
            },
            {
              path: 'family-members',
              data: { title: 'Family Members', breadcrumb: 'Family Members', routeParamBreadcrumb: false },
              children: [
                {
                  path: '',
                  component: FamilyMembersTabComponent,
                  resolve: {
                    clientFamilyMembers: ClientFamilyMembersResolver
                  }
                },
                {
                  path: 'add',
                  component: AddFamilyMemberComponent,
                  data: { title: 'Add', breadcrumb: 'Add', routeParamBreadcrumb: false },
                  resolve: {
                    clientTemplate: ClientTemplateResolver
                  }
                },
                {
                  path: ':familyMemberId',
                  children: [
                    {
                      path: 'edit',
                      component: EditFamilyMemberComponent,
                      data: { title: 'Family Member View', routeParamBreadcrumb: 'familyMemberId' },
                      resolve: {
                        clientTemplate: ClientTemplateResolver,
                        editFamilyMember: ClientFamilyMemberResolver
                      }
                    }
                  ]
                }
              ]
            },
            {
              path: 'identities',
              component: IdentitiesTabComponent,
              data: { title: 'Identities', breadcrumb: 'Identities', routeParamBreadcrumb: false },
              resolve: {
                clientIdentities: ClientIdentitiesResolver,
                clientIdentifierTemplate: ClientIdentifierTemplateResolver
              }
            },
            {
              path: 'documents',
              component: DocumentsTabComponent,
              data: { title: 'Documents', breadcrumb: 'Documents', routeParamBreadcrumb: false },
              resolve: {
                clientDocuments: ClientDocumentsResolver
              }
            },
            {
              path: 'notes',
              component: NotesTabComponent,
              data: { title: 'Notes', breadcrumb: 'Notes', routeParamBreadcrumb: false },
              resolve: {
                clientNotes: ClientNotesResolver
              }
            },
            {
              path: 'datatables',
              children: [
                {
                  path: ':datatableName',
                  component: DatatableTabComponent,
                  data: { title: 'Data Table View', routeParamBreadcrumb: 'datatableName' },
                  resolve: {
                    clientDatatable: ClientDatatableResolver
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    {
      path: 'clients',
      data: { title: 'Clients', breadcrumb: 'Clients', routeParamBreadcrumb: false },
      children: [
        {
          path: ':clientId',
          data: { title: 'Clients View', routeParamBreadcrumb: 'clientId' },
          resolve: {
            clientViewData: ClientViewResolver
          },
          children: [
            {
              path: 'edit',
              data: { title: 'Edit Client', breadcrumb: 'Edit', routeParamBreadcrumb: false },
              component: EditClientComponent,
              resolve: {
                clientDataAndTemplate: ClientDataAndTemplateResolver
              }
            },
            {
              path: 'actions/:name',
              data: { title: 'Client Actions', routeParamBreadcrumb: 'name' },
              component: ClientActionsComponent,
              resolve: {
                clientActionData: ClientActionsResolver,
                clientLocTemplate: ClientLocTemplateResolver,
                currencies: CurrenciesResolver
              }
            },
            {
              path: 'loc/create',
              component: CreateLocComponent,
              data: { title: 'Create LOC', breadcrumb: 'Create LOC' },
              resolve: {
                clientLocTemplate: ClientLocTemplateResolver,
                clientAccountsData: ClientAccountsResolver,
                currencies: CurrenciesResolver,
                charges: ChargesResolver
              }
            },
            {
              path: 'charges',
              children: [
                {
                  path: 'overview',
                  data: { title: 'Charges Overview', breadcrumb: 'Charges Overview' },
                  component: ChargesOverviewComponent,
                  resolve: {
                    clientChargesData: ClientChargeOverviewResolver
                  }
                },
                {
                  path: ':chargeId',
                  data: { title: 'Charges', routeParamBreadcrumb: 'chargeId' },
                  children: [
                    {
                      path: '',
                      component: ViewChargeComponent,
                      resolve: {
                        clientChargeData: ClientChargeViewResolver
                      }
                    },
                    {
                      path: 'pay',
                      data: { title: 'Pay Charge', routeParamBreadcrumb: false },
                      component: ClientPayChargesComponent,
                      resolve: {
                        transactionData: ClientTransactionPayResolver
                      }
                    }
                  ]
                }
              ]
            },
            {
              path: 'loans-accounts',
              loadChildren: () => import('../loans/loans.module').then((m) => m.LoansModule)
            },
            {
              path: 'client-collateral',
              loadChildren: () => import('../collaterals/collaterals.module').then((m) => m.CollateralsModule)
            },
            {
              path: 'fixed-deposits-accounts',
              loadChildren: () =>
                import('../deposits/fixed-deposits/fixed-deposits.module').then((m) => m.FixedDepositsModule)
            },
            {
              path: 'savings-accounts',
              loadChildren: () => import('../savings/savings.module').then((m) => m.SavingsModule)
            },
            {
              path: 'recurring-deposits-accounts',
              loadChildren: () =>
                import('../deposits/recurring-deposits/recurring-deposits.module').then(
                  (m) => m.RecurringDepositsModule
                )
            },
            {
              path: 'shares-accounts',
              loadChildren: () => import('../shares/shares.module').then((m) => m.SharesModule)
            },
            {
              path: 'standing-instructions',
              loadChildren: () =>
                import('../account-transfers/account-transfers.module').then((m) => m.AccountTransfersModule)
            },
            {
              path: 'lines-of-credit/:locId',
              redirectTo: 'loc/:locId',
              pathMatch: 'full'
            },
            {
              path: 'loc/:locId',
              component: ViewLocDetailsComponent,
              data: { title: 'View LOC Details', breadcrumb: 'View LOC Details' },
              resolve: {
                locData: ClientLocResolver
              }
            },
            {
              path: 'loc/:locId/edit',
              component: EditLocComponent,
              data: { title: 'Edit LOC', breadcrumb: 'Edit LOC' },
              resolve: {
                locData: ClientLocResolver,
                clientAccountsData: ClientAccountsResolver,
                currencies: CurrenciesResolver,
                charges: ChargesResolver,
                clientLocTemplate: ClientLocTemplateResolver
              }
            }
          ]
        }
      ]
    }
  ])

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
  providers: [
    ClientViewResolver,
    ClientAccountsResolver,
    ClientAddressResolver,
    ClientChargesResolver,
    ClientSummaryResolver,
    ClientFamilyMembersResolver,
    ClientFamilyMemberResolver,
    ClientTemplateResolver,
    ClientIdentitiesResolver,
    ClientNotesResolver,
    ClientDocumentsResolver,
    ClientDatatablesResolver,
    ClientDatatableResolver,
    ClientIdentifierTemplateResolver,
    ClientAddressFieldConfigurationResolver,
    ClientAddressTemplateResolver,
    ClientChargeOverviewResolver,
    ClientActionsResolver,
    ClientLocTemplateResolver,
    ClientLocResolver,
    ClientLocListResolver,
    CurrenciesResolver,
    ClientChargeViewResolver,
    ClientTransactionPayResolver,
    ClientDataAndTemplateResolver,
    ClientCollateralResolver
  ]
})
export class ClientsRoutingModule {}
