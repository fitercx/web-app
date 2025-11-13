/** Angular Imports */
import { Component, Input, ViewChild, OnChanges } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { DecimalPipe } from '@angular/common';

/** Custom Servies */
import { ReportsService } from '../../reports.service';
import { MatDialog } from '@angular/material/dialog';
import { FormfieldBase } from 'app/shared/form-dialog/formfield/model/formfield-base';
import { SelectBase } from 'app/shared/form-dialog/formfield/model/select-base';
import { InputBase } from 'app/shared/form-dialog/formfield/model/input-base';
import { FormDialogComponent } from 'app/shared/form-dialog/form-dialog.component';
import { environment } from 'environments/environment';
import { ProgressBarService } from 'app/core/progress-bar/progress-bar.service';

import * as XLSX from 'xlsx';

/**
 * Table and SMS Component
 */
@Component({
  selector: 'mifosx-table-and-sms',
  templateUrl: './table-and-sms.component.html',
  styleUrls: ['./table-and-sms.component.scss']
})
export class TableAndSmsComponent implements OnChanges {
  /** Run Report Data */
  @Input() dataObject: any;

  /** Columns to be displayed in mat-table */
  displayedColumns: string[] = [];
  /** Data source for run-report table. */
  dataSource = new MatTableDataSource();
  /** Maps column name to type */
  columnTypes: any[] = [];
  /** substitute for resolver */
  hideOutput = true;
  /** Data to be converted into CSV file */
  csvData: any;
  notExistsReportData = false;
  toBeExportedToRepo = false;

  /** Paginator for run-report table. */
  @ViewChild(MatPaginator) paginator: MatPaginator;

  /**
   * @param {ReportsService} reportsService Reports Service
   * @param {DecimalPipe} decimalPipe Decimal Pipe
   */
  constructor(
    private reportsService: ReportsService,
    public dialog: MatDialog,
    private decimalPipe: DecimalPipe,
    private progressBarService: ProgressBarService
  ) {}

  /**
   * Fetches run report data post changes in run report form.
   */
  ngOnChanges() {
    this.hideOutput = true;
    this.columnTypes = [];
    this.displayedColumns = [];
    this.getRunReportData();
  }

  getRunReportData() {
    const exportS3 = this.dataObject.formData.exportS3;
    this.reportsService
      .getRunReportData(this.dataObject.report.name, this.dataObject.formData)
      .subscribe((res: any) => {
        this.toBeExportedToRepo = exportS3;
        if (!this.toBeExportedToRepo) {
          this.csvData = res.data;
          this.notExistsReportData = res.data.length === 0;
          this.setOutputTable(res.data);
          res.columnHeaders.forEach((header: any) => {
            this.columnTypes.push(header.columnDisplayType);
            this.displayedColumns.push(header.columnName);
          });
        }
        this.hideOutput = false;
        this.progressBarService.decrease();
      });
  }

  /**
   * Sets up a dynamic Mat Table.
   * @param {any} data Mat Table data
   */
  setOutputTable(data: any) {
    this.dataSource = new MatTableDataSource(data);
    setTimeout(() => {
      this.dataSource.paginator = this.paginator;
    });
  }

  /**
   * Generates the CSV file dynamically for run report data.
   */
  exportFile() {
    const delimiterOptions: any[] = [
      { name: 'Comma (,)', char: ',' },
      { name: 'Colon (:)', char: ':' },
      { name: 'SemiColon (;)', char: ';' },
      { name: 'Pipe (|)', char: '|' },
      { name: 'Space ( )', char: ' ' }
    ];
    const fileName = `${this.dataObject.report.name}.csv`;
    const formfields: FormfieldBase[] = [
      new SelectBase({
        controlName: 'delimiter',
        label: 'Delimiter',
        value: environment.defaultCharDelimiter,
        options: { label: 'name', value: 'char', data: delimiterOptions },
        required: true,
        order: 1
      }),
      new InputBase({
        controlName: 'fileName',
        label: 'File Name',
        value: fileName,
        type: 'text',
        required: true,
        order: 2
      })

    ];
    const data = {
      title: 'Export data to File',
      layout: { addButtonText: 'Export to File' },
      formfields: formfields
    };
    const exportDialogRef = this.dialog.open(FormDialogComponent, { data });
    exportDialogRef.afterClosed().subscribe((response: { data: any }) => {
      if (response.data) {
        this.downloadCSV(response.data.value.fileName, response.data.value.delimiter);
      }
    });
  }

  exportToXLS(): void {
    const fileName = `${this.dataObject.report.name}.xlsx`;

    // Build plain objects, converting date-like cells to Date instances
    const data = this.csvData.map((object: any) => {
      const row: any = {};
      for (let i = 0; i < this.displayedColumns.length; i++) {
        const rawVal = object.row[i];
        if (this.isDateColumn(i)) {
          row[this.displayedColumns[i]] = this.parseDateValue(rawVal) || '';
        } else {
          row[this.displayedColumns[i]] = rawVal;
        }
      }
      return row;
    });

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data, { header: this.displayedColumns });

    // Ensure date cells are typed & formatted for Excel/Sheets
    for (let r = 0; r < data.length; r++) {
      for (let c = 0; c < this.displayedColumns.length; c++) {
        if (!this.isDateColumn(c)) continue;
        const cellAddr = XLSX.utils.encode_cell({ r: r + 1, c }); // +1 header offset
        const cell = ws[cellAddr];
        if (!cell) continue;
        const val = data[r][this.displayedColumns[c]];
        if (val instanceof Date) {
          cell.v = this.toExcelSerial(val);
          cell.t = 'n';
          cell.z = 'yyyy-mm-dd';
        } else if (typeof val === 'string' && val) {
          const d = this.parseDateValue(val);
          if (d) {
            cell.v = this.toExcelSerial(d);
            cell.t = 'n';
            cell.z = 'yyyy-mm-dd';
          }
        }
      }
    }

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, fileName, { cellDates: true });
  }

  // Detect date columns (backend display types may be DATE / DATETIME)
  private isDateColumn(index: number): boolean {
    const t = (this.columnTypes[index] || '').toString().toUpperCase();
    return t === 'DATE' || t === 'DATETIME';
  }

  // Parse supported date formats: array [Y,M,D], "Y,M,D", "Y-M-D"
  private parseDateValue(value: any): Date | null {
    if (!value && value !== 0) return null;
    if (value instanceof Date) return value;

    if (Array.isArray(value) && value.length >= 3) {
      const [
        y,
        m,
        d
      ] = value;
      if (this.validYMD(y, m, d)) return new Date(y, m - 1, d);
      return null;
    }

    if (typeof value === 'string') {
      const s = value.trim();
      let m = s.match(/^(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})$/);
      if (m) {
        const y = +m[1],
          mo = +m[2],
          da = +m[3];
        if (this.validYMD(y, mo, da)) return new Date(y, mo - 1, da);
        return null;
      }
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        const y = +m[1],
          mo = +m[2],
          da = +m[3];
        if (this.validYMD(y, mo, da)) return new Date(y, mo - 1, da);
        return null;
      }
    }
    return null;
  }

  private validYMD(y: number, m: number, d: number): boolean {
    return !!y && !!m && !!d && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  // Excel serial number (days since 1899-12-30)
  private toExcelSerial(date: Date): number {
    const epoch = Date.UTC(1899, 11, 30);
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - epoch) / 86400000;
  }

  /**
   * Generates the CSV file dynamically for run report data.
   */
  downloadCSV(fileName: string, delimiter: string) {
    const headers = this.displayedColumns;
    let csv = this.csvData.map((object: any) => object.row.join(delimiter));
    csv.unshift(`data:text/csv;charset=utf-8,${headers.join(delimiter)}`);
    csv = csv.join('\r\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Returns number formatted as per user's decimal choice.
   * @param {number} value Value to be formatted as per decimal choice.
   */
  toDecimal(value: number) {
    const decimalChoice = this.dataObject.decimalChoice;
    return this.decimalPipe.transform(value, `1.${decimalChoice}-${decimalChoice}`);
  }

  /**
   * Checks the weather Mat-Table column has decimal display type.
   * @param {number} index Index of column.
   */
  isDecimal(index: number) {
    return this.columnTypes[index] === 'DECIMAL';
  }
}
