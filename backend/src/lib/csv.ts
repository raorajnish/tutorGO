/** Same escaping rule as expenses.ts's local `csvEscape` — pulled out here so
 * §8f's roster export doesn't duplicate it a second time. */
export function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
}
