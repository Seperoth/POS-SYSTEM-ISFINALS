import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import catalog from '../src/domain/restaurant-catalog.json' with { type: 'json' };
import { blendDemand, FORECAST_DAYS, forecastItems, readCsv, validateForecastRows } from '../src/domain/forecast.js';
import { trainSeasonalKnn } from './seasonal_knn.mjs';

const { values } = parseArgs({ options: { data: { type: 'string' }, bundle: { type: 'boolean' } } });
const directory = values.data ?? fileURLToPath(new URL('./Restaurant Forecast/data/', import.meta.url));
const validationDays = [54, 55, 56, 57, 58, 59, 60];
const itemDay = ({ itemId, day }) => `${itemId}:${day}`;
const read = name => readFile(join(directory, name), 'utf8');
const [historyText, validationText, forestText] = await Promise.all([
  read('sales-history.csv'), read('validation-predictions.csv'), read('forecast.csv'),
]);

function readItemDays(text, days, columns, source) {
  const [header = [], ...rows] = readCsv(text);
  const itemIndex = header.indexOf('Item_ID');
  const dayIndex = header.indexOf('Day');
  const fields = columns.map(name => header.indexOf(name));
  if ([itemIndex, dayIndex, ...fields].includes(-1) || new Set(header).size !== header.length) {
    throw new Error(`Missing or duplicate columns in ${source}.`);
  }
  const allowed = new Set(catalog.flatMap(({ id }) => days.map(day => itemDay({ itemId: id, day }))));
  const records = rows.map(row => {
    const entry = { itemId: row[itemIndex], day: Number(row[dayIndex]) };
    const numbers = fields.map(index => row[index]?.trim() ? Number(row[index]) : NaN);
    if (row.length !== header.length || !allowed.delete(itemDay(entry)) ||
      numbers.some(number => !Number.isFinite(number) || number < 0)) {
      throw new Error(`Invalid or repeated entry in ${source} for ${entry.itemId}, day ${entry.day}.`);
    }
    return { ...entry, values: numbers };
  });
  if (allowed.size) throw new Error(`Missing ${allowed.size} dish-days in ${source}.`);
  return records.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.day - b.day);
}

const history = readItemDays(historyText, Array.from({ length: 60 }, (_, i) => i + 1), ['Units_Sold'], 'sales-history.csv')
  .map(({ itemId, day, values: [units] }) => ({ itemId, day, units }));
const actuals = new Map(history.map(row => [itemDay(row), row.units]));
const rfColumns = ['Predicted_Units', 'Units_Sold(-7)'];
const validationInput = readItemDays(validationText, validationDays, [...rfColumns, 'Units_Sold'], 'validation-predictions.csv');
const forecastInput = readItemDays(forestText, FORECAST_DAYS, rfColumns, 'forecast.csv');

function combine(records, cutoff) {
  const predictKnn = trainSeasonalKnn(history, cutoff);
  return records.map(({ itemId, day, values: [randomForestUnits, lag, actual] }) => {
    if (lag !== actuals.get(itemDay({ itemId, day: day - 7 })) ||
      (actual !== undefined && actual !== actuals.get(itemDay({ itemId, day })))) {
      throw new Error(`The KNIME results do not match sales-history.csv for ${itemId}, day ${day}. Rerun KNIME using the matching workbook export.`);
    }
    const knnUnits = predictKnn({ itemId, day });
    return { itemId, day, units: blendDemand(randomForestUnits, knnUnits), randomForestUnits, knnUnits, actual, lag };
  });
}

const rows = validateForecastRows(combine(forecastInput, 60).map(({ actual, lag, ...row }) => row));
const holdout = combine(validationInput, 53);

function score(predict) {
  let absoluteError = 0;
  let squaredError = 0;
  for (const row of holdout) {
    const error = predict(row) - row.actual;
    absoluteError += Math.abs(error);
    squaredError += error ** 2;
  }
  return { mae: absoluteError / holdout.length, rmse: Math.sqrt(squaredError / holdout.length) };
}

const observedHoldout = holdout.map(row => ({ ...row, units: row.actual }));
let selected = 0;
let hits = 0;
for (const day of validationDays) {
  const options = { day, search: '', demandOnly: true };
  const actualDemand = new Set(forecastItems(observedHoldout, options).map(item => item.id));
  const predictedDemand = forecastItems(holdout, options);
  selected += predictedDemand.length;
  hits += predictedDemand.filter(item => actualDemand.has(item.id)).length;
}
const metrics = {
  observations: holdout.length,
  hybrid: score(row => row.units),
  randomForest: score(row => row.randomForestUnits),
  knn: score(row => row.knnUnits),
  baseline: score(row => row.lag),
  highDemand: { hits, selected },
};
const csvRows = rows.map(({ itemId, day, units, randomForestUnits, knnUnits }) =>
  [`"${itemId.replaceAll('"', '""')}"`, day, units, randomForestUnits, knnUnits].join(','));
await writeFile(join(directory, 'hybrid-forecast.csv'),
  ['Item_ID,Day,Predicted_Units,Random_Forest_Units,KNN_Units', ...csvRows, ''].join('\n'), 'utf8');
if (values.bundle) {
  await writeFile(new URL('../src/domain/workbook-forecast.json', import.meta.url), JSON.stringify({ rows, metrics }) + '\n', 'utf8');
}
console.log(`Wrote hybrid-forecast.csv with ${rows.length} dish-day predictions.`);
console.table({
  'Hybrid (50/50)': metrics.hybrid,
  'KNIME Random Forest': metrics.randomForest,
  'Seasonal KNN': metrics.knn,
  'Previous week': metrics.baseline,
});
console.log(`High-demand precision: ${hits}/${selected} on holdout days 54–60.`);
