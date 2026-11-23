import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankState, validateState } from '../src/domain/model.js';
import { blendDemand, demandCutoffs, forecastItems, parseForecastCsv, validateForecastRows } from '../src/domain/forecast.js';
import { trainSeasonalKnn } from '../forecasting/seasonal_knn.mjs';
import forecast from '../src/domain/workbook-forecast.json' with { type: 'json' };

const csv = rows => '\uFEFF"Dish_Name","Day","Predicted_Units","Item_ID"\r\n' + rows.map(row =>
  `"Dish with a comma, and ""quotes""",${row.day},${row.units},"${row.itemId}"`
).join('\r\n');
const hybridCsv = rows => 'Item_ID,Day,Predicted_Units,Random_Forest_Units,KNN_Units\n' + rows.map(row =>
  [row.itemId, row.day, row.units, row.randomForestUnits, row.knnUnits].join(',')
).join('\n');

test('KNIME dish-day predictions import and aggregate using workbook IDs and prices', () => {
  const forestRows = forecast.rows.map(({ itemId, day, randomForestUnits }) => ({ itemId, day, units: randomForestUnits }));
  const rows = parseForecastCsv(csv(forestRows));
  assert.deepEqual(rows, forestRows);
  assert.doesNotThrow(() => validateState({ ...blankState(), forecast: { rows, importedAt: '2026-11-21T00:00:00Z' } }));
  const [dish] = forecastItems(rows, { category: 'Appetizer', day: 61, search: 'APP-001' });
  assert.equal(dish.name, 'Crispy Calamari');
  assert.equal(dish.units, rows.find(row => row.itemId === 'APP-001' && row.day === 61).units);
  assert.equal(dish.revenue, dish.units * 240);
  assert.deepEqual(forecastItems(rows, { category: 'Dessert', day: 61, search: 'APP-001' }), []);
});

test('hybrid CSV preserves both model outputs and rejects a mismatched blend', () => {
  const rows = parseForecastCsv(hybridCsv(forecast.rows));
  assert.deepEqual(rows, forecast.rows);
  assert.equal(rows[0].units, blendDemand(rows[0].randomForestUnits, rows[0].knnUnits));
  assert.doesNotThrow(() => validateState({ ...blankState(), forecast: { rows, importedAt: '2026-11-21T00:00:00Z' } }));
  const [first, ...rest] = rows;
  assert.throws(() => parseForecastCsv(hybridCsv([{ ...first, units: first.units + 1 }, ...rest])), /must equal the mean/);
  assert.throws(() => parseForecastCsv(hybridCsv([{ ...first, knnUnits: null }, ...rest])), /must equal the mean/);
});

test('seasonal KNN uses the closest historical lags for the same dish and weekday', () => {
  const history = [[5, 100], [12, 40], [19, 10], [26, 11], [33, 9], [40, 15], [47, 10], [53, 555], [54, 999]]
    .map(([day, units]) => ({ itemId: 'APP-001', day, units }));
  history.push({ itemId: 'APP-002', day: 47, units: 700 });
  const predict = trainSeasonalKnn(history, 53);
  assert.equal(predict({ itemId: 'APP-001', day: 54 }), 11.5);
  assert.throws(() => predict({ itemId: 'APP-001', day: 61 }), /No observed seven-day lag/);
});

test('demand cutoffs respect category boundaries and stay stable when searching', () => {
  const cutoffs = demandCutoffs([100, 80, 80, 70, 50].map(units => ({ category: 'Drinks', units }))
    .concat({ category: 'Sides', units: 20 }));
  assert.equal(cutoffs.get('Drinks'), 80);
  assert.equal(cutoffs.get('Sides'), 20);
  const options = { category: 'Appetizer', day: 61, search: '' };
  const items = forecastItems(forecast.rows, options);
  const flagged = forecastItems(forecast.rows, { ...options, demandOnly: true });
  assert.deepEqual(flagged, items.filter(item => item.inDemand));
  assert.equal(flagged.length, Math.ceil(items.length / 4));
  const lowest = items.at(-1);
  assert.equal(forecastItems(forecast.rows, { ...options, search: lowest.id })[0].inDemand, false);
  assert.deepEqual(forecastItems(forecast.rows, { ...options, search: lowest.id, demandOnly: true }), []);
});

test('forecast import rejects missing, duplicate and invalid dish-day predictions', () => {
  const [first, second, ...rest] = forecast.rows;
  assert.throws(() => parseForecastCsv(csv([first, ...rest])), /one prediction per workbook dish/);
  assert.throws(() => parseForecastCsv(csv([first, first, ...rest])), /Duplicate forecast/);
  assert.throws(() => parseForecastCsv(csv([{ ...first, units: '' }, second, ...rest])), /predicted units/);
  assert.throws(() => validateForecastRows([{ ...first, itemId: 'UNKNOWN' }, second, ...rest]), /unknown dish/);
  assert.throws(() => validateForecastRows([{ ...first, day: 60 }, second, ...rest]), /invalid day/);
});
