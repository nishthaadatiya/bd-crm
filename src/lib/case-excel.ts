import type { ExportCase } from './case-export-data';
import { getCaseStatusLabel } from './case-status';

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) Object.assign(result, flatten(item as Record<string, unknown>, name));
    else result[name] = item == null ? null : typeof item === 'object' ? JSON.stringify(item) : item as string | number | boolean;
  }
  return result;
}

export async function buildCasesWorkbook(cases: ExportCase[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'CRM'; workbook.created = new Date();
  const sheet = workbook.addWorksheet('All Cases');
  const rows: Record<string, string | number | boolean | null>[] = cases.map((c) => ({ ...flatten(c), status_label: getCaseStatusLabel(c.status) }));
  const preferred = ['case_number','customer.full_name','status_label','assigned_profile.full_name','current_stage.name','stage_due_date','work_flag','flag_reason','flag_owner.full_name','follow_up_date','priority','building.name','loan_amount','bank_name'];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const columns = [...preferred.filter((key) => keys.includes(key)), ...keys.filter((key) => !preferred.includes(key))];
  if (!columns.length) columns.push('case_number');
  sheet.columns = columns.map((key) => ({ key, width: /description|notes|reason|address/.test(key) ? 45 : /name|email|id$/.test(key) ? 28 : 22 }));
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1,1).value = 'ALL CASES • COMPLETE EXPORT';
  sheet.getCell(1,1).font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(1,1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14243B' } };
  sheet.getRow(1).height = 36;
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell(2,1).value = `${cases.length} cases • Exported ${new Date().toISOString()} • All cases accessible to your account; page filters are ignored. Dates are preserved as stored.`;
  sheet.getRow(2).height = 26;
  const labels = columns.map((key) => key.replaceAll('.', ' / ').replaceAll('_',' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  sheet.addTable({ name: 'CasesExport', ref: 'A4', headerRow: true, style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: labels.map((name) => ({ name, filterButton: true })),
    rows: rows.map((row) => columns.map((key) => {
      const value = row[key] ?? null;
      if (/^(loan_amount|property_value|interest_rate|loan_tenure_months)$/.test(key) && value !== null && value !== '') {
        const number = Number(value); if (Number.isFinite(number)) return number;
      }
      // Strings remain literal cells, including values starting with '='; never formulas.
      return value;
    })),
  });
  sheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];
  sheet.getRow(4).height = 32;
  sheet.getRow(4).alignment = { wrapText: true, vertical: 'middle' };
  columns.forEach((key, index) => {
    if (/^(loan_amount|property_value)$/.test(key)) sheet.getColumn(index+1).numFmt = '#,##0.00';
    if (key === 'interest_rate') sheet.getColumn(index+1).numFmt = '0.00"%"';
  });
  sheet.eachRow((row, number) => { if (number > 4) row.alignment = { vertical: 'top', wrapText: true }; });
  return workbook;
}
