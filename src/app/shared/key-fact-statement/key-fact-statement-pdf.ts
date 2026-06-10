import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface KeyFactStatementPdfOptions {
  dateOfIssue: string;
  fallbackLoan?: any;
  fileName?: string;
}

const DEFAULT_TEMPLATE: any = {
  title: 'Key Fact Statement',
  logoUrl: 'assets/images/crediblex-light-logo.png',
  headerRows: [
    [
      'Date of Issue: ${dateOfIssue}',
      'Issued by: ${issuedBy}'
    ],
    [
      'Issued to: ${borrowerName}',
      'Loan ID : ${externalId}'
    ]

  ],
  sections: []
};

const PDF_LAYOUT = {
  page: {
    leftMargin: 0.48,
    rightMargin: 0.48
  },
  title: {
    fontSize: 20,
    y: 0.78
  },
  headerY: {
    start: 1.02,
    gap: 0.18
  },
  footer: {
    yOffset: 0.43,
    fontSize: 7,
    maxWidth: 7.45
  }
};

export async function generateKeyFactStatementPdf(kfs: any, options: KeyFactStatementPdfOptions): Promise<void> {
  const loan = kfs?.loan ?? options.fallbackLoan ?? {};
  const template = parseTemplate(kfs?.template?.templateJson);
  const context = buildContext(kfs, options);
  const pdf = new jsPDF({ orientation: 'p', unit: 'in', format: 'letter' });

  await drawLogo(pdf, template.logoUrl);
  drawTitle(pdf, replacePlaceholders(template.title || DEFAULT_TEMPLATE.title, context));
  drawHeaderRows(pdf, template.headerRows || DEFAULT_TEMPLATE.headerRows, context);

  let startY = 1.45;
  (template.sections || []).forEach((section: any) => {
    startY = drawSection(pdf, section, context, kfs?.repaymentSchedule || [], startY);
  });

  drawFooter(pdf, kfs?.template?.regulatoryFooter);
  pdf.save(options.fileName || `key-fact-statement-${loan.accountNo ?? loan.id ?? 'loan'}.pdf`);
}

function parseTemplate(templateJson: string | null | undefined): any {
  if (!templateJson) {
    return DEFAULT_TEMPLATE;
  }

  try {
    return { ...DEFAULT_TEMPLATE, ...JSON.parse(templateJson) };
  } catch (error) {
    console.error('Failed to parse KFS template JSON:', error);
    return DEFAULT_TEMPLATE;
  }
}

function drawTitle(pdf: jsPDF, title: string): void {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(PDF_LAYOUT.title.fontSize);
  pdf.text(title, pdf.internal.pageSize.getWidth() / 2, PDF_LAYOUT.title.y, { align: 'center' });
}

function drawHeaderRows(pdf: jsPDF, rows: string[][], context: Record<string, string>): void {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  rows.forEach((row, index) => {
    const y = PDF_LAYOUT.headerY.start + index * PDF_LAYOUT.headerY.gap;
    pdf.text(replacePlaceholders(row[0] || '', context), 0.5, y);
    pdf.text(replacePlaceholders(row[1] || '', context), 3.85, y);
  });
}

function drawSection(
  pdf: jsPDF,
  section: any,
  context: Record<string, string>,
  schedule: any[],
  startY: number
): number {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(replacePlaceholders(section.title || '', context), 0.5, startY);

  if (section.source === 'repaymentSchedule') {
    return drawScheduleTable(pdf, section, context, schedule, startY + 0.18);
  }

  const body = (section.rows || []).map((row: string[]) => row.map((cell) => replacePlaceholders(cell || '', context)));
  autoTable(pdf, {
    startY: startY + 0.18,
    head: [
      (section.columns || []).map((column: string) => replacePlaceholders(column, context))
    ],
    body,
    theme: 'grid',
    margin: { left: PDF_LAYOUT.page.leftMargin, right: PDF_LAYOUT.page.rightMargin, bottom: 0.8 },
    styles: {
      fontSize: 9,
      cellPadding: { top: 0.07, right: 0.09, bottom: 0.07, left: 0.09 },
      lineColor: 40,
      lineWidth: 0.005,
      textColor: 25,
      valign: 'middle',
      minCellHeight: 0.3
    },
    headStyles: { fillColor: [
        240,
        240,
        240
      ], textColor: 25, fontStyle: 'bold', minCellHeight: 0.34 },
    columnStyles:
      section.key === 'facility'
        ? { 0: { cellWidth: 0.65, halign: 'center' }, 1: { cellWidth: 2.65 }, 2: { cellWidth: 4.2 } }
        : {}
  });

  return (pdf as any).lastAutoTable.finalY + 0.4;
}

function drawScheduleTable(
  pdf: jsPDF,
  section: any,
  context: Record<string, string>,
  schedule: any[],
  startY: number
): number {
  const body = schedule.map((row) => [
    row.period,
    formatAmount(row.outstandingPrincipal),
    formatDate(row.dueDate),
    formatAmount(row.totalDue),
    formatAmount(row.principalDue),
    formatAmount(row.interestDue),
    row.status || 'SCHEDULED'
  ]);

  const totalRow = (section.totalRow || []).map((cell: string) => replacePlaceholders(cell || '', context));
  if (totalRow.length) {
    body.push(totalRow);
  }

  autoTable(pdf, {
    startY,
    head: [
      (section.columns || []).map((column: string) => replacePlaceholders(column, context))
    ],
    body,
    theme: 'grid',
    margin: { left: 0.35, right: 0.35, bottom: 0.8 },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 },
      lineColor: 40,
      lineWidth: 0.005,
      textColor: 25,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 0.3
    },
    headStyles: { fillColor: [
        240,
        240,
        240
      ], textColor: 25, fontStyle: 'bold', minCellHeight: 0.36 },
    columnStyles: {
      0: { cellWidth: 0.4, halign: 'center' },
      1: { halign: 'right' },
      2: { cellWidth: 1.1 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'center', cellWidth: 0.95 }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1 && totalRow.length) {
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  return (pdf as any).lastAutoTable.finalY + 0.4;
}

function drawFooter(pdf: jsPDF, footer: string | null | undefined): void {
  if (!footer) {
    return;
  }

  const pageCount = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pdf.setPage(pageNumber);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(PDF_LAYOUT.footer.fontSize);
    pdf.text(
      pdf.splitTextToSize(footer, PDF_LAYOUT.footer.maxWidth),
      PDF_LAYOUT.page.leftMargin,
      pdf.internal.pageSize.getHeight() - PDF_LAYOUT.footer.yOffset
    );
  }
}

async function drawLogo(pdf: jsPDF, logoUrl: string | null | undefined): Promise<void> {
  if (!logoUrl) {
    return;
  }

  try {
    const imageData = await loadImageDataUrl(logoUrl);
    pdf.addImage(imageData, 'PNG', pdf.internal.pageSize.getWidth() - 2.2, 0.28, 1.65, 0.3);
  } catch (error) {
    console.error('Failed to load KFS logo:', error);
  }
}

async function loadImageDataUrl(logoUrl: string): Promise<string> {
  const response = await fetch(logoUrl);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildContext(kfs: any, options: KeyFactStatementPdfOptions): Record<string, string> {
  const loan = kfs?.loan ?? options.fallbackLoan ?? {};
  const fallbackLoan = options.fallbackLoan ?? {};
  const charges = kfs?.charges ?? {};
  const schedule = kfs?.repaymentSchedule ?? [];
  const currencyCode = loan.currencyCode ?? loan.currency?.code ?? fallbackLoan.currency?.code ?? '';
  const totalInterest = sum(schedule, 'interestDue');
  const totalPrincipal = sum(schedule, 'principalDue') || toNumber(loan.approvedPrincipal ?? fallbackLoan.loanAmount);
  const totalRepayable = sum(schedule, 'totalDue') || totalPrincipal + totalInterest;
  const repaymentFrequency = frequencyLabel(loan);

  return {
    dateOfIssue: options.dateOfIssue,
    issuedBy: kfs?.template?.issuedBy || 'CredibleX Limited',
    borrowerName: loan.borrowerName || fallbackLoan.clientName || '',
    externalId: loan.externalId || loan.accountNo || fallbackLoan.accountNo || loan.id || '',
    currencyCode,
    approvedAmount: formatAmount(loan.approvedPrincipal ?? fallbackLoan.loanAmount),
    tenure: loan.numberOfRepayments ? `${loan.numberOfRepayments} ${repaymentFrequency}` : '',
    repaymentFrequency,
    totalInterest: formatAmount(totalInterest),
    interestRate: formatRate(loan.annualInterestRate),
    interestRateBasisLabel:
      loan.interestRateBasisLabel || (loan.productType === 'RBF' ? 'Reducing Interest Rate' : 'Interest Rate'),
    interestRateBasisValue:
      loan.interestRateBasisValue ||
      (loan.annualInterestRate != null ? `${formatRate(loan.annualInterestRate)}% per annum` : 'N/A'),
    totalRepayable: formatAmount(totalRepayable),
    processingFee: formatAmount(charges.feeAmount),
    vatOnProcessingFee: formatAmount(charges.taxAmount),
    otherFees: formatAmount(toNumber(charges.penaltyAmount)),
    factorRate: formatRate(loan.factorRate),
    disbursementDate: formatDate(loan.disbursementDate),
    disbursedAmount: formatAmount(loan.netDisbursalAmount ?? loan.approvedPrincipal ?? fallbackLoan.loanAmount)
  };
}

function replacePlaceholders(value: string, context: Record<string, string>): string {
  return value.replace(/\$\{([^}]+)}/g, (_match, key) => context[key] ?? '');
}

function frequencyLabel(loan: any): string {
  const frequency = loan.repaymentFrequency || '';
  if (!frequency) {
    return '';
  }
  return String(frequency).replace(/s$/, '') + (Number(loan.numberOfRepayments) === 1 ? '' : 's');
}

function sum(rows: any[], field: string): number {
  return rows.reduce((total, row) => total + toNumber(row?.[field]), 0);
}

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: any): string {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatRate(value: any): string {
  return toNumber(value)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function formatDate(value: any): string {
  if (!value) {
    return '';
  }

  const date = Array.isArray(value) ? new Date(value[0], value[1] - 1, value[2]) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit'
    })
    .replace(/ /g, '-');
}
