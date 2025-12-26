import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { LoansService } from 'app/loans/loans.service';

export interface AddBuyerSupplierDialogData {
  locId: number;
  type: 'buyer' | 'supplier';
}

@Component({
  selector: 'mifosx-add-buyer-supplier-dialog',
  templateUrl: './add-buyer-supplier-dialog.component.html',
  styleUrls: ['./add-buyer-supplier-dialog.component.scss']
})
export class AddBuyerSupplierDialogComponent implements OnInit {
  buyerSupplierForm: FormGroup;
  isLoading = false;
  entityType: string;

  constructor(
    private formBuilder: FormBuilder,
    private loansService: LoansService,
    public dialogRef: MatDialogRef<AddBuyerSupplierDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddBuyerSupplierDialogData
  ) {
    this.entityType = this.data.type === 'buyer' ? 'Buyer' : 'Supplier';
  }

  ngOnInit() {
    this.createBuyerSupplierForm();
  }

  createBuyerSupplierForm() {
    this.buyerSupplierForm = this.formBuilder.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2)]
      ],
      email: [
        '',
        [Validators.email]
      ],
      phoneNumber: [''],
      address: [''],
      taxId: [''],
      description: ['']
    });
  }

  onSubmit() {
    if (this.buyerSupplierForm.valid) {
      this.isLoading = true;
      const entityData = {
        ...this.buyerSupplierForm.value,
        locId: this.data.locId,
        type: this.data.type
      };

      // Call API to add buyer/supplier to LOC
      this.loansService.addBuyerSupplierToLoc(this.data.locId, entityData).subscribe({
        next: (response) => {
          this.isLoading = false;
          this.dialogRef.close(response);
        },
        error: (error) => {
          this.isLoading = false;
          console.error(`Error adding ${this.data.type}:`, error);
          // You might want to show an error message here
        }
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
