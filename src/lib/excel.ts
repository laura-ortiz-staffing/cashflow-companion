import type { Cell, Row, Workbook, Worksheet } from "exceljs";

export async function downloadWorkbook(wb: Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function sheetToObjects(ws: Worksheet | undefined): Array<Record<string, unknown>> {
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell: Cell, colNumber: number) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const out: Array<Record<string, unknown>> = [];
  ws.eachRow({ includeEmpty: false }, (row: Row, rowNumber: number) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    for (let c = 1; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const cell = row.getCell(c);
      let value: unknown = cell.value;
      if (value && typeof value === "object" && "result" in (value as object)) {
        value = (value as { result: unknown }).result;
      }
      if (value && typeof value === "object" && "text" in (value as object)) {
        value = (value as { text: unknown }).text;
      }
      obj[key] = value ?? "";
    }
    out.push(obj);
  });
  return out;
}
