// src/lib/csv.ts — CSV cells for the ledger exports.
//
// Guest names and payment references come from public forms. A cell that begins
// with = + - @ (or a tab / carriage return) is run as a FORMULA by Excel, Numbers
// and Google Sheets — so a guest named  =HYPERLINK("http://evil","Click")  could
// make the owner's spreadsheet call out or phone home when they open the export.
// Text cells starting with those characters are therefore prefixed with an
// apostrophe, which spreadsheets read as "this is plain text".
//
// Real numbers (amounts, including negative ones such as -250.00) must stay numbers,
// so they are passed as `number` — never prefixed. Pre-formatted amount strings
// such as "-250.00" are recognised too.

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
