/** Angular Imports */
import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { UntypedFormArray, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';

/** Custom Services */
import { ClientsService } from '../../clients.service';

/** Custom Components */
import { DeleteDialogComponent } from 'app/shared/delete-dialog/delete-dialog.component';

/** Custom Models */
import { Vendor, ApprovedBuyer, ManageApprovedBuyersDialogData } from '../../models/credit-line.model';

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

  /** Current vendors from the API */
  private currentVendors: Vendor[] = [];

  /** Vendors to be deleted (for batch deletion at save time) */
  private vendorsToDelete: Vendor[] = [];

  /** Track if any changes were made (for triggering parent refresh) */
  private hasChanges = false;

  /** Operations tracking */
  private pendingOperations: {
    create: Vendor[];
    update: { vendor: Vendor; originalName: string }[];
    delete: Vendor[];
  } = {
    create: [],
    update: [],
    delete: []
  };

  /**
   * @param {MatDialogRef} dialogRef Component reference to dialog.
   * @param {ManageApprovedBuyersDialogData} data Dialog data.
   * @param {UntypedFormBuilder} formBuilder Form Builder.
   * @param {ClientsService} clientsService Clients Service.
   * @param {MatDialog} dialog Material Dialog Service.
   */
  constructor(
    public dialogRef: MatDialogRef<ManageApprovedBuyersDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ManageApprovedBuyersDialogData,
    private readonly formBuilder: UntypedFormBuilder,
    private readonly clientsService: ClientsService,
    private readonly dialog: MatDialog
  ) {
    this.createManageApprovedBuyersForm();
  }

  ngOnInit() {
    // Load current vendors from API instead of using dialog data
    this.loadCurrentVendors();
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
   * Load current vendors from API
   */
  loadCurrentVendors() {
    this.clientsService.getVendors(this.data.clientId, this.data.lineOfCreditId).subscribe({
      next: (vendors: Vendor[]) => {
        this.currentVendors = vendors || [];
        this.initializeFormWithCurrentVendors();
      },
      error: (error) => {
        console.error('Error loading vendors:', error);
        this.errors = ['Failed to load current vendors'];
        // Initialize with empty form as fallback
        this.initializeFormWithCurrentVendors();
      }
    });
  }

  /**
   * Initialize form with current vendors
   */
  initializeFormWithCurrentVendors() {
    const vendorsArray = this.approvedBuyersFormArray;

    // Clear existing form array
    while (vendorsArray.length !== 0) {
      vendorsArray.removeAt(0);
    }

    // Add current vendors to form
    if (this.currentVendors && this.currentVendors.length > 0) {
      this.currentVendors.forEach((vendor: Vendor) => {
        vendorsArray.push(this.createVendorFormGroup(vendor));
      });
    } else {
      // Add one empty vendor if none exist
      this.addBuyer();
    }

    // Capture the initial state for rollback purposes
    this.captureOriginalFormState();
  }

  /**
   * Create a form group for a single vendor
   */
  createVendorFormGroup(vendor?: Vendor): UntypedFormGroup {
    return this.formBuilder.group({
      id: [vendor?.id || null], // Store vendor ID for updates/deletes
      name: [
        vendor?.name || '',
        [
          Validators.required,
          Validators.maxLength(100)]
      ],
      isNew: [!vendor?.id] // Track if this is a new vendor
    });
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use createVendorFormGroup instead
   */
  createBuyerFormGroup(buyer?: ApprovedBuyer | Vendor): UntypedFormGroup {
    return this.createVendorFormGroup(buyer as Vendor);
  }

  /**
   * Add a new buyer to the form array
   */
  addBuyer() {
    this.approvedBuyersFormArray.push(this.createBuyerFormGroup());
    this.errors = []; // Clear errors when user makes changes
  }

  /**
   * Remove a buyer from the form array or delete from backend if it exists
   */
  removeBuyer(index: number) {
    const buyerControl = this.approvedBuyersFormArray.at(index);
    const vendorId = buyerControl.get('id')?.value;
    const vendorName = buyerControl.get('name')?.value;
    const isNew = buyerControl.get('isNew')?.value;

    // If it's a new vendor (not saved yet), just remove from form
    if (isNew || !vendorId) {
      this.approvedBuyersFormArray.removeAt(index);
      this.errors = [];
      return;
    }

    // For existing vendors, show confirmation dialog and make API call
    const deleteVendorDialogRef = this.dialog.open(DeleteDialogComponent, {
      data: { deleteContext: `${this.getBuyerLabel()} "${vendorName}"` }
    });

    deleteVendorDialogRef.afterClosed().subscribe((response: any) => {
      if (response && response.delete) {
        // Show loading state
        this.isLoading = true;
        this.errors = [];

        // Make delete API call
        this.clientsService.deleteVendor(this.data.clientId, this.data.lineOfCreditId, vendorId.toString()).subscribe({
          next: () => {
            this.isLoading = false;
            // Remove from form array
            this.approvedBuyersFormArray.removeAt(index);
            // Update current vendors list
            this.currentVendors = this.currentVendors.filter((v) => v.id !== vendorId);
            // Update original form state
            this.captureOriginalFormState();
            // Clear errors
            this.errors = [];
            // Mark that changes were made
            this.hasChanges = true;
          },
          error: (error) => {
            this.isLoading = false;
            console.error('Error deleting vendor:', error);

            // Handle API errors - prioritize user-friendly messages
            if (error.error?.defaultUserMessage) {
              this.errors = [error.error.defaultUserMessage];
            } else if (error.error?.userMessage) {
              this.errors = [error.error.userMessage];
            } else if (error.error?.errors && error.error.errors.length > 0) {
              this.errors = error.error.errors.map(
                (err: any) => err.defaultUserMessage || err.userMessage || err.developerMessage
              );
            } else if (error.error?.developerMessage) {
              this.errors = [error.error.developerMessage];
            } else {
              this.errors = ['An error occurred while deleting the vendor. Please try again.'];
            }
          }
        });
      }
    });
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
   * Save the vendors using individual CRUD operations
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

    this.isLoading = true;

    // Analyze changes and prepare operations
    this.analyzeChanges();

    // Execute operations sequentially
    this.executeOperations();
  }

  /**
   * Analyze form changes to determine what CRUD operations are needed
   * Note: Delete operations are handled immediately when user clicks delete button
   */
  private analyzeChanges() {
    this.pendingOperations = { create: [], update: [], delete: [] };

    const currentFormValues = this.approvedBuyersFormArray.value;

    // Find vendors to create (new vendors without ID)
    currentFormValues.forEach((formValue: any) => {
      if (formValue.isNew && formValue.name?.trim()) {
        this.pendingOperations.create.push({
          name: formValue.name.trim()
        });
      }
    });

    // Find vendors to update (existing vendors with name changes)
    this.currentVendors.forEach((originalVendor: Vendor) => {
      const formValue = currentFormValues.find((fv: any) => fv.id === originalVendor.id);
      if (formValue && formValue.name?.trim() !== originalVendor.name) {
        this.pendingOperations.update.push({
          vendor: { ...originalVendor, name: formValue.name.trim() },
          originalName: originalVendor.name
        });
      }
    });

    // No need to find vendors to delete - they're deleted immediately via removeBuyer method
  }

  /**
   * Execute all pending operations sequentially
   * Note: Delete operations are already handled immediately
   */
  private executeOperations() {
    // Start with update operations
    if (this.pendingOperations.update.length > 0) {
      this.executeUpdateOperations();
    } else if (this.pendingOperations.create.length > 0) {
      this.executeCreateOperations();
    } else {
      // No changes detected
      this.isLoading = false;
      this.dialogRef.close({ success: true, vendors: this.currentVendors });
    }
  }

  /**
   * Execute update operations
   */
  private executeUpdateOperations() {
    const updateOperation = this.pendingOperations.update.shift();
    if (!updateOperation) {
      // Move to create operations
      if (this.pendingOperations.create.length > 0) {
        this.executeCreateOperations();
      } else {
        this.operationsComplete();
      }
      return;
    }

    this.clientsService
      .updateVendor(this.data.clientId, this.data.lineOfCreditId, updateOperation.vendor.id!.toString(), {
        name: updateOperation.vendor.name
      })
      .subscribe({
        next: () => {
          // Continue with remaining updates
          this.executeUpdateOperations();
        },
        error: (error) => {
          this.handleOperationError(error);
        }
      });
  }

  /**
   * Execute create operations
   */
  private executeCreateOperations() {
    const vendorToCreate = this.pendingOperations.create.shift();
    if (!vendorToCreate) {
      this.operationsComplete();
      return;
    }

    this.clientsService.createVendor(this.data.clientId, this.data.lineOfCreditId, vendorToCreate).subscribe({
      next: () => {
        // Continue with remaining creations
        this.executeCreateOperations();
      },
      error: (error) => {
        this.handleOperationError(error);
      }
    });
  }

  /**
   * Handle operation completion
   */
  private operationsComplete() {
    this.isLoading = false;
    // Mark that changes were made
    this.hasChanges = true;
    // Reload vendors to get the latest state
    this.loadCurrentVendors();
    this.dialogRef.close({ success: true, vendors: this.currentVendors });
  }

  /**
   * Handle operation errors
   */
  private handleOperationError(error: any) {
    this.isLoading = false;
    console.error('Error in vendor operation:', error);

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
      this.errors = ['An error occurred while updating vendors. Please try again.'];
    }
  }

  /**
   * Cancel and close the dialog
   */
  cancel() {
    // If changes were made (e.g., immediate deletes), signal success so parent refreshes
    this.dialogRef.close({ success: this.hasChanges });
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
