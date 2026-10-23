import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const paths = process.argv.slice(2);
if (paths.length < 1 || paths.length > 2) { console.error('用法：npm run backup:check -- 旧站.json [新站.json]'); process.exit(1); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function inspect(path) {
  const data = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  if (data.schemaVersion !== 2 || !Array.isArray(data.records) || !Array.isArray(data.practiceRecords)) throw new Error('需要含两类记录的完整 JSON 备份（schemaVersion 2）。');
  const payload = {};
  for (const kind of ['records', 'practiceRecords']) {
    const ids = new Set();
    for (const row of data[kind]) {
      if (!row?.id || ids.has(row.id)) throw new Error(`${kind} 中存在缺失或重复 ID。`);
      ids.add(row.id);
    }
    payload[kind] = [...data[kind]].sort((a, b) => a.id.localeCompare(b.id));
  }
  return { simulation: data.records.length, practice: data.practiceRecords.length, contentSha256: createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex') };
}
try {
  const results = paths.map(inspect);
  results.forEach((result, i) => console.log(JSON.stringify({ file: paths[i], ...result })));
  if (results.length === 2) {
    const equal = results[0].contentSha256 === results[1].contentSha256;
    console.log(equal ? '两份备份内容一致（忽略导出时间和记录排列顺序）。' : '备份内容不同，请先核对后再切换。');
    if (!equal) process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
