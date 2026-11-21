import { readFile, writeFile } from 'node:fs/promises';
import { parseForecastCsv, readCsv } from '../src/domain/forecast.js';

const data = new URL('./Restaurant Forecast/data/', import.meta.url);
const report = name => readFile(new URL(name, data), 'utf8');
const [forecastCsv, forestCsv, baselineCsv] = await Promise.all([
  report('forecast.csv'), report('numeric-scorer.csv'), report('baseline-scorer.csv'),
]);
const rows = parseForecastCsv(forecastCsv).sort((a, b) => a.itemId.localeCompare(b.itemId) || a.day - b.day);

function scores(csv) {
  const entries = new Map(readCsv(csv).slice(1));
  const metrics = {
    mae: Number(entries.get('mean absolute error')),
    rmse: Number(entries.get('root mean squared error')),
    r2: Number(entries.get('R^2')),
  };
  if (!Object.values(metrics).every(Number.isFinite)) throw new Error('The KNIME Numeric Scorer output is incomplete.');
  return metrics;
}

const metrics = { ...scores(forestCsv), baseline: scores(baselineCsv) };
await writeFile(new URL('../src/domain/workbook-forecast.json', import.meta.url),
  JSON.stringify({ rows, metrics }) + '\n', 'utf8');
console.log(`Bundled ${rows.length} forecasts and both KNIME Numeric Scorer results.`);
