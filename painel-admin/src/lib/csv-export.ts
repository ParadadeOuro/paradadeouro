// CSV export helper. Uses ; as delimiter (Excel BR friendly) and BOM for UTF-8.
function csvCell(v: any): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") {
    try { s = JSON.stringify(v); } catch { s = String(v); }
  } else {
    s = String(v);
  }
  s = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${s}"`;
}

export function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const sep = ";";
  const lines = [headers.map(csvCell).join(sep)];
  for (const r of rows) lines.push(r.map(csvCell).join(sep));
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  a.download = `${filename}-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
