import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankState, validateState } from '../src/domain/model.js';
import { forecastItems, parseForecastCsv, validateForecastRows } from '../src/domain/forecast.js';
import forecast from '../src/domain/workbook-forecast.json' with { type: 'json' };

const csv = rows => '\uFEFF"Dish_Name","Day","Predicted_Units","Item_ID"\r\n' + rows.map(row =>
  `"Dish with a comma, and ""quotes""",${row.day},${row.units},"${row.itemId}"`
).join('\r\n');

test('KNIME dish-day predictions import and aggregate using workbook IDs and prices', () => {
  const rows = parseForecastCsv(csv(forecast.rows));
  assert.deepEqual(rows, forecast.rows);
  assert.doesNotThrow(() => validateState({ ...blankState(), forecast: { rows, importedAt: '2026-11-21T00:00:00Z' } }));
  const [dish] = forecastItems(rows, { category: 'Appetizer', day: 61, search: 'APP-001' });
  assert.equal(dish.name, 'Crispy Calamari');
  assert.equal(dish.units, rows.find(row => row.itemId === 'APP-001' && row.day === 61).units);
  assert.equal(dish.revenue, dish.units * 240);
  assert.deepEqual(forecastItems(rows, { category: 'Dessert', day: 61, search: 'APP-001' }), []);
});

test('forecast import rejects missing, duplicate and invalid dish-day predictions', () => {
  const [first, second, ...rest] = forecast.rows;
  assert.throws(() => parseForecastCsv(csv([first, ...rest])), /one prediction per workbook dish/);
  assert.throws(() => parseForecastCsv(csv([first, first, ...rest])), /Duplicate forecast/);
  assert.throws(() => parseForecastCsv(csv([{ ...first, units: '' }, second, ...rest])), /predicted units/);
  assert.throws(() => validateForecastRows([{ ...first, itemId: 'UNKNOWN' }, second, ...rest]), /unknown dish/);
  assert.throws(() => validateForecastRows([{ ...first, day: 60 }, second, ...rest]), /invalid day/);
});
