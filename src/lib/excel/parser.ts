import * as XLSX from 'xlsx';
import type { RawIncidentRow } from '@/types/incident';

export interface ParseResult {
  success: boolean;
  data: RawIncidentRow[];
  columns: string[];
  sheetName: string;
  totalRows: number;
  errors: string[];
}

function incidentHeader(row: string[]) {
  const text = row.join(' ').toLowerCase();
  return (text.includes('request') || text.includes('id')) &&
    (text.includes('technician') || text.includes('category') || text.includes('priority'));
}

export async function parseFile(file: File, isHeader = incidentHeader): Promise<ParseResult> {
  const errors: string[] = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellDates: true,
      dateNF: 'yyyy-mm-dd hh:mm:ss',
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return {
        success: false,
        data: [],
        columns: [],
        sheetName: '',
        totalRows: 0,
        errors: ['No sheets found in the workbook.'],
      };
    }

    const sheet = workbook.Sheets[sheetName];

    const bounds = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
    const sample = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
      range: { s: bounds.s, e: { ...bounds.e, r: Math.min(bounds.e.r, bounds.s.r + 19) } },
    });
    const headerRowIndex = bounds.s.r + Math.max(0, sample.findIndex(row => isHeader(row.map(String))));

    const jsonData = XLSX.utils.sheet_to_json<RawIncidentRow>(sheet, {
      defval: '',
      raw: false,
      range: headerRowIndex,
    });

    if (jsonData.length === 0) {
      return {
        success: false,
        data: [],
        columns: [],
        sheetName,
        totalRows: 0,
        errors: ['No data rows found in the sheet.'],
      };
    }

    const columns = Object.keys(jsonData[0]);

    return {
      success: true,
      data: jsonData,
      columns,
      sheetName,
      totalRows: jsonData.length,
      errors: [],
    };
  } catch (error) {
    errors.push(`Failed to parse file: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      data: [],
      columns: [],
      sheetName: '',
      totalRows: 0,
      errors,
    };
  }
}

export function parseText(text: string): ParseResult {
  try {
    const workbook = XLSX.read(text, {
      type: 'string',
      cellDates: true,
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return {
        success: false,
        data: [],
        columns: [],
        sheetName: '',
        totalRows: 0,
        errors: ['No data found in pasted text.'],
      };
    }

    const sheet = workbook.Sheets[sheetName];

    const rawArray = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    let headerRowIndex = 0;

    for (let i = 0; i < Math.min(rawArray.length, 20); i++) {
      const row = rawArray[i];
      if (Array.isArray(row)) {
        const rowStr = row.join(' ').toLowerCase();
        if ((rowStr.includes('request') || rowStr.includes('id')) &&
          (rowStr.includes('technician') || rowStr.includes('category') || rowStr.includes('priority'))) {
          headerRowIndex = i;
          break;
        }
      }
    }

    const jsonData = XLSX.utils.sheet_to_json<RawIncidentRow>(sheet, {
      defval: '',
      raw: false,
      range: headerRowIndex,
    });

    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

    return {
      success: true,
      data: jsonData,
      columns,
      sheetName,
      totalRows: jsonData.length,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      columns: [],
      sheetName: '',
      totalRows: 0,
      errors: [`Failed to parse text: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
