export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) rows.push(row); row = [];
    } else field += char;
  }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('CSV 至少需要表头和一行数据');
  const headers = rows[0].map((value) => value.replace(/^\uFEFF/, ''));
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
}

export async function parseExcelWorkbook(arrayBuffer, ExcelJSRef = globalThis.ExcelJS) {
  if (!ExcelJSRef?.Workbook) throw new Error('Excel解析组件未加载，请刷新页面后重试');
  const workbook = new ExcelJSRef.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  for (const worksheet of workbook.worksheets) {
    const matrix = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];
      for (let index = 1; index <= row.cellCount; index += 1) values.push(row.getCell(index).text.trim());
      if (values.some(Boolean)) matrix.push(values);
    });
    if (matrix.length < 2) continue;
    const headers = matrix[0].map((value) => value.replace(/^\uFEFF/, '').trim());
    const rows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
    if (rows.length) return rows;
  }
  throw new Error('Excel文件没有可读取的表头和数据行');
}

export async function parseReportFiles(filesInput, label, allowMultiple = false, ExcelJSRef = globalThis.ExcelJS) {
  const files = [...filesInput];
  if (!files.length) return null;
  if (!allowMultiple && files.length > 1) throw new Error(`${label}一次只能选择一个文件`);
  const combinedRows = [];
  for (const file of files) {
    if (file.size > 5_000_000) throw new Error(`${label}文件 ${file.name} 不能超过 5MB`);
    const lowerName = file.name.toLowerCase();
    let rows;
    if (lowerName.endsWith('.xlsx')) {
      rows = await parseExcelWorkbook(await file.arrayBuffer(), ExcelJSRef);
    } else {
      const text = await file.text();
      if (lowerName.endsWith('.json')) {
        const data = JSON.parse(text); rows = Array.isArray(data) ? data : (data.keywords || data.searchTerms || data.queries || data.rows);
      } else rows = parseCsv(text);
    }
    if (!Array.isArray(rows)) throw new Error(`${label}文件 ${file.name} 格式无效`);
    combinedRows.push(...rows);
  }
  const signature = files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).sort().join('|');
  return { rows: combinedRows, signature, fileCount: files.length };
}
