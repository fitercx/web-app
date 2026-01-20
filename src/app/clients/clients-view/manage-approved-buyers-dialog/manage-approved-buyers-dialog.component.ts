/** Angular Imports */
import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UntypedFormArray, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';

/** Custom Services */
import { ClientsService } from '../../clients.service';

/** Custom Models */
import { ApprovedBuyer, ManageApprovedBuyersDialogData } from '../../models/credit-line.model';

/**
 * Manage Approved Buyers Dialog Component
 */
@Component({
  selector: 'mifosx-manage-approved-buyers-dialog',
  templateUrl: './manage-approved-buyers-dialog.component.html',
  styleUrls: ['./manage-approved-buyers-dialog.component.scss']
})
export class ManageApprovedBuyersDialogComponent implements OnInit {
  /** Manage Approved Buyers Form */
  manageApprovedBuyersForm: UntypedFormGroup;

  /** Loading state */
  isLoading = false;

  /** Validation errors */
  errors: string[] = [];

  /** Original form state for rollback on API failure */
  private originalFormState: any[] = [];

  /**
   * @param {MatDialogRef} dialogRef Component reference to dialog.
   * @param {ManageApprovedBuyersDialogData} data Dialog data.
   * @param {UntypedFormBuilder} formBuilder Form Builder.
   * @param {ClientsService} clientsService Clients Service.
   */
  constructor(
    public dialogRef: MatDialogRef<ManageApprovedBuyersDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ManageApprovedBuyersDialogData,
    private readonly formBuilder: UntypedFormBuilder,
    private readonly clientsService: ClientsService
  ) {
    this.createManageApprovedBuyersForm();
  }

  ngOnInit() {
    // Initialize form with current buyers
    this.initializeFormWithCurrentBuyers();
  }

  /**
   * Creates the manage approved buyers form
   */
  createManageApprovedBuyersForm() {
    this.manageApprovedBuyersForm = this.formBuilder.group({
      approvedBuyers: this.formBuilder.array([])
    });
  }

  /**
   * Get the approved buyers form array
   */
  get approvedBuyersFormArray(): UntypedFormArray {
    return this.manageApprovedBuyersForm.get('approvedBuyers') as UntypedFormArray;
  }

  /**
   * Initialize form with current buyers
   */
  initializeFormWithCurrentBuyers() {
    const buyersArray = this.approvedBuyersFormArray;

    // Clear existing form array
    while (buyersArray.length !== 0) {
      buyersArray.removeAt(0);
    }

    // Add current buyers to form
    if (this.data.currentBuyers && this.data.currentBuyers.length > 0) {
      this.data.currentBuyers.forEach((buyer: ApprovedBuyer) => {
        buyersArray.push(this.createBuyerFormGroup(buyer));
      });
    } else {
      // Add one empty buyer if none exist
      this.addBuyer();
    }

    // Capture the initial state for rollback purposes
    this.captureOriginalFormState();
  }

  /**
   * Create a form group for a single buyer
   */
  createBuyerFormGroup(buyer?: ApprovedBuyer): UntypedFormGroup {
    return this.formBuilder.group({
      name: [
        buyer?.name || '',
        [
          Validators.required,
          Validators.maxLength(100)]
      ]
    });
  }

  /**
   * Add a new buyer to the form array
   */
  addBuyer() {
    this.approvedBuyersFormArray.push(this.createBuyerFormGroup());
    this.errors = []; // Clear errors when user makes changes
  }

  /**
   * Remove a buyer from the form array
   */
  removeBuyer(index: number) {
    this.approvedBuyersFormArray.removeAt(index);
    this.errors = []; // Clear errors when user makes changes
  }

  /**
   * Validate the approved buyers form
   */
  validateForm(): string[] {
    const errors: string[] = [];
    const buyersFormArray = this.approvedBuyersFormArray;

    if (buyersFormArray.length === 0) {
      errors.push('At least one buyer/supplier is required');
      return errors;
    }

    // Check for required fields and duplicates
    const names: string[] = [];
    buyersFormArray.controls.forEach((buyerControl, index) => {
      const buyer = buyerControl.value;

      if (!buyer.name?.trim()) {
        errors.push(`Row ${index + 1}: Name is required`);
      } else {
        const name = buyer.name.trim().toLowerCase();
        if (names.includes(name)) {
          errors.push(`Row ${index + 1}: Name "${buyer.name}" is already used`);
        } else {
          names.push(name);
        }
      }
    });

    return errors;
  }

  /**
   * Save the approved buyers
   */
  save() {
    this.errors = [];

    // Mark all fields as touched to show validation errors
    this.manageApprovedBuyersForm.markAllAsTouched();

    // Validate the form
    const validationErrors = this.validateForm();
    if (validationErrors.length > 0) {
      this.errors = validationErrors;
      return;
    }

    // Prepare the approved buyers data
    const approvedBuyers: ApprovedBuyer[] = this.approvedBuyersFormArray.value.map((buyer: any) => ({
      name: buyer.name?.trim()
    }));

    this.isLoading = true;

    // Call the API to manage approved buyers
    this.clientsService.manageApprovedBuyers(this.data.clientId, this.data.lineOfCreditId, approvedBuyers).subscribe({
      next: (response) => {
        this.isLoading = false;
        // Close dialog and return the updated buyers list
        this.dialogRef.close({
          success: true,
          approvedBuyers: approvedBuyers
        });
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error managing approved buyers:', error);

        // Restore original form state on API failure
        this.restoreFormState();

        // Handle API errors - prioritize user-friendly messages
        if (error.error?.defaultUserMessage) {
          this.errors = [error.error.defaultUserMessage];
        } else if (error.error?.userMessage) {
          this.errors = [error.error.userMessage];
        } else if (error.error?.errors && error.error.errors.length > 0) {
          // Handle errors array with individual error messages
          this.errors = error.error.errors.map(
            (err: any) => err.defaultUserMessage || err.userMessage || err.developerMessage
          );
        } else if (error.error?.developerMessage) {
          this.errors = [error.error.developerMessage];
        } else {
          this.errors = ['An error occurred while updating approved buyers. Please try again.'];
        }
      }
    });
  }

  /**
   * Cancel and close the dialog
   */
  cancel() {
    this.dialogRef.close({ success: false });
  }

  /**
   * Capture original form state for rollback purposes
   */
  private captureOriginalFormState() {
    this.originalFormState = this.approvedBuyersFormArray.value.map((buyer: any) => ({ ...buyer }));
  }

  /**
   * Restore form state to original values (used when API call fails)
   */
  private restoreFormState() {
    if (this.originalFormState.length === 0) {
      return;
    }

    // Clear existing form array
    while (this.approvedBuyersFormArray.length !== 0) {
      this.approvedBuyersFormArray.removeAt(0);
    }

    // Restore original buyers
    this.originalFormState.forEach((buyer: any) => {
      this.approvedBuyersFormArray.push(this.createBuyerFormGroup(buyer));
    });
  }

  /**
   * Get the appropriate label for buyers/suppliers based on LOC type
   */
  getBuyerLabel(): string {
    return this.data.locType === 'PAYABLE' ? 'Supplier' : 'Buyer';
  }

  /**
   * Get the appropriate plural label for buyers/suppliers based on LOC type
   */
  getBuyersLabel(): string {
    return this.data.locType === 'PAYABLE' ? 'Suppliers' : 'Buyers';
  }
}
