/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Audit Trail Tab Component
 */
@Component({
  selector: 'mifosx-audit-trail-tab',
  templateUrl: './audit-trail-tab.component.html',
  styleUrls: ['./audit-trail-tab.component.scss']
})
export class AuditTrailTabComponent implements OnInit {
  /** Audit trail data */
  auditData: any = {};

  /** Display columns for audit table */
  displayedColumns: string[] = [
    'date',
    'action',
    'user',
    'details'
  ];

  /** Audit trail entries */
  auditEntries: any[] = [];

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    // Get LOC data from parent route
    const locData = this.route.parent?.snapshot.data['locData'];
    if (locData) {
      this.processAuditData(locData);
    }
  }

  /**
   * Process audit data from LOC details
   */
  private processAuditData(data: any): void {
    // Check if timeLineData exists and use it, otherwise fallback to direct properties
    const timelineData = data.timeLineData || data;

    // Extract audit information from timeLineData structure
    this.auditData = {
      // Submitted information
      submittedDate: this.parseDate(timelineData.submittedOnDate),
      submittedByUsername:
        timelineData.submittedByFirstname && timelineData.submittedByLastname
          ? `${timelineData.submittedByFirstname} ${timelineData.submittedByLastname}`
          : null,

      // Approved information
      approvedDate: this.parseDate(timelineData.approvedOnDate),
      approvedByUsername:
        timelineData.approvedByFirstname && timelineData.approvedByLastname
          ? `${timelineData.approvedByFirstname} ${timelineData.approvedByLastname}`
          : null,

      // Activated information
      activatedDate: this.parseDate(timelineData.activatedOnDate),
      activatedByUsername:
        timelineData.activatedByFirstname && timelineData.activatedByLastname
          ? `${timelineData.activatedByFirstname} ${timelineData.activatedByLastname}`
          : null,

      // Last modified information
      lastModifiedDate: this.parseDate(timelineData.updatedOnDate),
      lastModifiedByUsername:
        timelineData.updatedByFirstname && timelineData.updatedByLastname
          ? `${timelineData.updatedByFirstname} ${timelineData.updatedByLastname}`
          : null,

      // Fallback to original structure if timeLineData is not available
      createdDate: this.parseDate(timelineData.createdDate || data.createdDate),
      createdByUsername: data.createdByUsername,
      closedDate: this.parseDate(data.closedDate),
      closedByUsername: data.closer?.username,
      rejectedDate: this.parseDate(data.rejectedDate),
      rejectedByUsername: data.rejectedByUsername,
      withdrawnDate: this.parseDate(data.withdrawnDate),
      withdrawnByUsername: data.withdrawnByUsername
    };

    // Build audit entries timeline
    this.buildAuditEntries();
  }

  /**
   * Build audit entries for timeline display
   */
  private buildAuditEntries(): void {
    const entries: any[] = [];

    // Submission entry (from timeLineData)
    if (this.auditData.submittedDate) {
      entries.push({
        date: this.auditData.submittedDate,
        action: 'Submitted',
        user: this.auditData.submittedByUsername || 'System',
        details: 'Line of Credit was submitted for approval',
        icon: 'send',
        color: 'accent'
      });
    }

    // Approval entry (from timeLineData)
    if (this.auditData.approvedDate) {
      entries.push({
        date: this.auditData.approvedDate,
        action: 'Approved',
        user: this.auditData.approvedByUsername || 'System',
        details: 'Line of Credit was approved',
        icon: 'check_circle',
        color: 'primary'
      });
    }

    // Activation entry (from timeLineData)
    if (this.auditData.activatedDate) {
      entries.push({
        date: this.auditData.activatedDate,
        action: 'Activated',
        user: this.auditData.activatedByUsername || 'System',
        details: 'Line of Credit was activated',
        icon: 'play_circle',
        color: 'primary'
      });
    }

    // Last modification entry (from timeLineData)
    if (this.auditData.lastModifiedDate) {
      entries.push({
        date: this.auditData.lastModifiedDate,
        action: 'Updated',
        user: this.auditData.lastModifiedByUsername || 'System',
        details: 'Line of Credit details were updated',
        icon: 'edit',
        color: 'accent'
      });
    }

    // Creation entry (fallback if available)
    if (this.auditData.createdDate) {
      entries.push({
        date: this.auditData.createdDate,
        action: 'Created',
        user: this.auditData.createdByUsername || 'System',
        details: 'Line of Credit was created',
        icon: 'add_circle',
        color: 'primary'
      });
    }

    // Rejection entry (if available)
    if (this.auditData.rejectedDate) {
      entries.push({
        date: this.auditData.rejectedDate,
        action: 'Rejected',
        user: this.auditData.rejectedByUsername || 'System',
        details: 'Line of Credit was rejected',
        icon: 'cancel',
        color: 'warn'
      });
    }

    // Withdrawal entry (if available)
    if (this.auditData.withdrawnDate) {
      entries.push({
        date: this.auditData.withdrawnDate,
        action: 'Withdrawn',
        user: this.auditData.withdrawnByUsername || 'System',
        details: 'Line of Credit was withdrawn',
        icon: 'remove_circle',
        color: 'warn'
      });
    }

    // Closure entry (if available)
    if (this.auditData.closedDate) {
      entries.push({
        date: this.auditData.closedDate,
        action: 'Closed',
        user: this.auditData.closedByUsername || 'System',
        details: 'Line of Credit was closed',
        icon: 'block',
        color: 'warn'
      });
    }

    // Sort entries by date (newest first)
    this.auditEntries = entries
      .filter((entry) => entry.date) // Only include entries with valid dates
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Parse date from backend format
   */
  private parseDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    if (Array.isArray(value) && value.length >= 3) {
      // Backend uses 1-based months in arrays
      const [
        y,
        m,
        d
      ] = value;
      return new Date(y, (m as number) - 1, d);
    }
    try {
      const dt = new Date(value);
      return isNaN(dt.getTime()) ? null : dt;
    } catch (e) {
      return null;
    }
  }

  /**
   * Get relative time description
   */
  getRelativeTime(date: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return months === 1 ? '1 month ago' : `${months} months ago`;
    } else {
      const years = Math.floor(diffInDays / 365);
      return years === 1 ? '1 year ago' : `${years} years ago`;
    }
  }
}
