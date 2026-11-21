import catalog from './restaurant-catalog.json' with { type: 'json' };

export const FORECAST_DAYS = [61, 62, 63, 64, 65, 66, 67];
const dishes = new Map(catalog.map(dish => [dish.id, dish]));
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const forecastWeekday = day => weekdays[(day - 1) % weekdays.length];

export function validateForecastRows(rows) {
  if (!Array.isArray(rows) || rows.length !== dishes.size * FORECAST_DAYS.length) {
    throw new Error('The forecast must contain one prediction per workbook dish for days 61–67.');
  }
  const seen = new Set();
  for (const row of rows) {
    if (!row || !dishes.has(row.itemId) || !FORECAST_DAYS.includes(row.day) || typeof row.units !== 'number' ||
      !Number.isFinite(row.units) || row.units < 0 || row.units > Number.MAX_SAFE_INTEGER / rows.length) {
      throw new Error('The forecast has an unknown dish, an invalid day, or invalid predicted units.');
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
  if ([itemColumn, dayColumn, unitsColumn].includes(-1) || new Set(header).size !== header.length) {
    throw new Error('Choose the KNIME forecast CSV with Item_ID, Day and Predicted_Units columns.');
  }
  return validateForecastRows(rows.map(row => {
    if (row.length !== header.length || !row[dayColumn].trim() || !row[unitsColumn].trim()) {
      throw new Error('Each forecast row needs an item, day and predicted units.');
    }
    return { itemId: row[itemColumn], day: Number(row[dayColumn]), units: Number(row[unitsColumn]) };
  }));
}

export function forecastItems(rows, { category, day, search }) {
  const items = new Map();
  const query = search.trim().toLowerCase();
  for (const { itemId, day: forecastDay, units } of rows) {
    const dish = dishes.get(itemId);
    if ((category && dish.category !== category) || (day && forecastDay !== day) ||
      !`${dish.id} ${dish.name}`.toLowerCase().includes(query)) continue;
    const current = items.get(itemId) || { ...dish, units: 0, revenue: 0 };
    current.units += units;
    current.revenue += units * dish.price;
    items.set(itemId, current);
  }
  return [...items.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
}
