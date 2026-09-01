import { NgModule } from '@angular/core';

import { SharedModule } from 'app/shared/shared.module';
import { PipesModule } from 'app/pipes/pipes.module';
import { DirectivesModule } from 'app/directives/directives.module';
import { TransferFromSavingsDialogComponent } from './transfer-from-savings-dialog.component';

@NgModule({
  imports: [
    SharedModule,
    PipesModule,
    DirectivesModule
  ],
  declarations: [TransferFromSavingsDialogComponent],
  exports: [TransferFromSavingsDialogComponent]
})
export class TransferFromSavingsDialogModule {}
