import { readFile } from 'node:fs/promises';
import { readExcel } from '../server/excel.mjs';
import { summarize } from '../shared/domain.mjs';
for (const file of ['Avisos IW28.xlsx', 'OMs IW38.xlsx']) {
  const data = await readExcel(await readFile(file), file);
  const dates = data.records.map(r => r.createdAt).filter(Boolean).sort();
  console.log(JSON.stringify({ file, rows: data.rowCount, warnings: data.warnings, summary: summarize(data.records), createdRange: [dates[0], dates.at(-1)], sample: data.records[0] }, null, 2));
}
