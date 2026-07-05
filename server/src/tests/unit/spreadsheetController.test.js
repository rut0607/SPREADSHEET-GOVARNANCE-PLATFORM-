process.env.TZ = 'UTC';

jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const {
  detectDataType,
  excelSerialToDate,
  convertCellValue
} = require('../../controllers/spreadsheetController');

describe('detectDataType', () => {
  it('returns "text" for an empty array', () => {
    expect(detectDataType([])).toBe('text');
  });

  it('detects a number column', () => {
    expect(detectDataType(['100', '200', '150'])).toBe('number');
  });

  it('detects a currency column', () => {
    expect(detectDataType(['$100', '$200', '$50'])).toBe('currency');
  });

  it('detects a date column', () => {
    expect(detectDataType(['01/15/2023', '02/20/2023', '03/10/2023'])).toBe('date');
  });

  it('falls back to "text" for non-numeric, non-date strings', () => {
    expect(detectDataType(['abc', 'def', 'ghi'])).toBe('text');
  });

  it('falls back to "text" when no single type crosses the 60% threshold', () => {
    expect(detectDataType(['abc', '123', 'def'])).toBe('text');
  });
});

describe('excelSerialToDate', () => {
  it('converts a valid Excel serial number to a DD/MM/YYYY string', () => {
    expect(excelSerialToDate(44927)).toBe('01/01/2023');
  });

  it('returns null for a non-number input', () => {
    expect(excelSerialToDate('not a number')).toBeNull();
  });

  it('returns null for a serial below the accepted range', () => {
    expect(excelSerialToDate(30000)).toBeNull();
  });

  it('returns null for a serial above the accepted range', () => {
    expect(excelSerialToDate(70000)).toBeNull();
  });
});

describe('convertCellValue', () => {
  it('converts null/undefined/empty string to an empty string', () => {
    expect(convertCellValue(null)).toBe('');
    expect(convertCellValue(undefined)).toBe('');
    expect(convertCellValue('')).toBe('');
  });

  it('strips formula cells (values starting with "=") to an empty string', () => {
    expect(convertCellValue('=SUM(A1:A2)')).toBe('');
  });

  it('formats a Date instance as DD/MM/YYYY', () => {
    expect(convertCellValue(new Date(Date.UTC(2023, 0, 15)))).toBe('15/01/2023');
  });

  it('formats an Excel serial date number as DD/MM/YYYY', () => {
    expect(convertCellValue(44927)).toBe('01/01/2023');
  });

  it('formats a plain integer as its string form', () => {
    expect(convertCellValue(100)).toBe('100');
  });

  it('formats a decimal number rounded to 4 places', () => {
    expect(convertCellValue(1234.5)).toBe('1234.5');
  });

  it('trims plain string values', () => {
    expect(convertCellValue('  hello  ')).toBe('hello');
  });
});
