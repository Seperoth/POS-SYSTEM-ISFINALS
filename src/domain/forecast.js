import catalog from './restaurant-catalog.json' with { type: 'json' };

export const FORECAST_DAYS = [61, 62, 63, 64, 65, 66, 67];
const dishes = new Map(catalog.map(dish => [dish.id, dish]));
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const forecastWeekday = day => weekdays[(day - 1) % weekdays.length];
export const blendDemand = (randomForestUnits, knnUnits) => (randomForestUnits + knnUnits) / 2;

export function validateForecastRows(rows) {
  if (!Array.isArray(rows) || rows.length !== dishes.size * FORECAST_DAYS.length) {
    throw new Error('The forecast must contain one prediction per workbook dish for days 61–67.');
  }
  const seen = new Set();
  const hybrid = rows.some(row => row?.randomForestUnits !== undefined || row?.knnUnits !== undefined);
  const validUnits = units => Number.isFinite(units) && units >= 0 && units <= Number.MAX_SAFE_INTEGER / rows.length;
  for (const row of rows) {
    if (!row || !dishes.has(row.itemId) || !FORECAST_DAYS.includes(row.day) || !validUnits(row.units)) {
      throw new Error('The forecast has an unknown dish, an invalid day, or invalid predicted units.');
    }
    if (hybrid && (!validUnits(row.randomForestUnits) || !validUnits(row.knnUnits) ||
      Math.abs(row.units - blendDemand(row.randomForestUnits, row.knnUnits)) > 1e-8)) {
      throw new Error('Each hybrid prediction must equal the mean of its Random Forest and KNN predictions.');
    }
    const key = `${row.itemId}:${row.day}`;
    if (seen.has(key)) throw new Error(`Duplicate forecast for ${row.itemId} on day ${row.day}.`);
    seen.add(key);
  }
  return rows;
}

export function readCsv(text) {
  // A quoted field may contain commas, line breaks and doubled quotes.
  const input = text.replace(/^\uFEFF/, '');
  const fields = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\r|\n|$)/y;
  const rows = [];
  let position = 0;
  let row = [];
  while (position < input.length) {
    fields.lastIndex = position;
    const match = fields.exec(input);
    if (!match || fields.lastIndex === position) throw new Error('The forecast CSV contains an invalid field.');
    const [, quoted, plain, delimiter] = match;
    row.push(quoted === undefined ? plain : quoted.replaceAll('""', '"'));
    position = fields.lastIndex;
    if (delimiter !== ',') {
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push([...row, '']);
  return rows;
}

export function parseForecastCsv(text) {
  const [header = [], ...rows] = readCsv(text);
  const itemColumn = header.indexOf('Item_ID');
  const dayColumn = header.indexOf('Day');
  const unitsColumn = header.indexOf('Predicted_Units');
  const forestColumn = header.indexOf('Random_Forest_Units');
  const knnColumn = header.indexOf('KNN_Units');
  if ([itemColumn, dayColumn, unitsColumn].includes(-1) || new Set(header).size !== header.length) {
    throw new Error('Choose a forecast CSV with Item_ID, Day and Predicted_Units columns.');
  }
  const hybrid = forestColumn !== -1 || knnColumn !== -1;
  if (hybrid && [forestColumn, knnColumn].includes(-1)) {
    throw new Error('A hybrid forecast CSV needs both Random_Forest_Units and KNN_Units columns.');
  }
  return validateForecastRows(rows.map(row => {
    if (row.length !== header.length || !row[dayColumn].trim() || !row[unitsColumn].trim()) {
      throw new Error('Each forecast row needs an item, day and predicted units.');
    }
    const prediction = { itemId: row[itemColumn], day: Number(row[dayColumn]), units: Number(row[unitsColumn]) };
    if (hybrid) {
      prediction.randomForestUnits = row[forestColumn].trim() ? Number(row[forestColumn]) : NaN;
      prediction.knnUnits = row[knnColumn].trim() ? Number(row[knnColumn]) : NaN;
    }
    return prediction;
  }));
}

export function demandCutoffs(items) {
  const byCategory = new Map();
  for (const { category, units } of items) {
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(units);
  }
  return new Map([...byCategory].map(([category, values]) => {
    const rank = Math.ceil(values.length / 4) - 1;
    return [category, values.sort((a, b) => b - a)[rank]];
  }));
}

export function forecastItems(rows, { category, day, search, demandOnly = false }) {
  const items = new Map();
  const query = search.trim().toLowerCase();
  for (const { itemId, day: forecastDay, units } of rows) {
    const dish = dishes.get(itemId);
    if ((category && dish.category !== category) || (day && forecastDay !== day)) continue;
    const current = items.get(itemId) || { ...dish, units: 0, revenue: 0 };
    current.units += units;
    current.revenue += units * dish.price;
    items.set(itemId, current);
  }
  const ranked = [...items.values()];
  const cutoffs = demandCutoffs(ranked);
  for (const item of ranked) item.inDemand = item.units > 0 && item.units >= cutoffs.get(item.category);
  return ranked.filter(item => (!demandOnly || item.inDemand) && `${item.id} ${item.name}`.toLowerCase().includes(query))
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
}
