import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Upload } from 'lucide-react-native';
import { money } from '../domain/model.js';
import { FORECAST_DAYS, forecastItems, forecastWeekday, parseForecastCsv } from '../domain/forecast.js';
import workbookForecast from '../domain/workbook-forecast.json';
import * as files from '../services/files';
import { Button, Choices, Empty, Field, T } from './components';
import { CategoryChoices } from './categories';
import { color, categoryColors, s } from './theme';

const units = value => value.toLocaleString('en-PH', { maximumFractionDigits: 1 });
const allCategories = 'All categories';
const days = [
  { label: 'Full week', value: 0 },
  ...FORECAST_DAYS.map(day => ({ label: `${forecastWeekday(day)} ${day}`, value: day })),
];

export default function ForecastScreen({ state, mutate, run, notify }) {
  const [category, setCategory] = useState(allCategories);
  const [day, setDay] = useState(0);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const { width } = useWindowDimensions();
  const snapshot = state.forecast ?? workbookForecast;
  const items = forecastItems(snapshot.rows, { category: category === allCategories ? null : category, day, search });
  const totals = items.reduce((sum, item) => ({ units: sum.units + item.units, revenue: sum.revenue + item.revenue }), { units: 0, revenue: 0 });

  async function importForecast() {
    setImporting(true);
    try {
      const text = await run(files.importForecast);
      if (text === null) return;
      const rows = await run(() => parseForecastCsv(text));
      if (rows && await mutate(current => ({ ...current, forecast: { rows, importedAt: new Date().toISOString() } }))) {
        notify('KNIME forecast imported.');
      }
    } finally {
      setImporting(false);
    }
  }

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, { maxWidth: 1152, width: '100%', alignSelf: 'center' }, width < 600 && { padding: 16 }]}>
    <View style={[s.wrap, { alignItems: 'center', justifyContent: 'space-between' }]}>
      <View style={{ gap: 4, flexGrow: 1 }}>
        <T accessibilityRole="header" style={s.title}>Sales forecast</T>
        <T style={s.muted}>{state.forecast
          ? `KNIME CSV imported ${new Date(snapshot.importedAt).toLocaleDateString('en-PH')}`
          : 'DataSet.xlsx · KNIME Random Forest · 7-day sales lag'}</T>
      </View>
      <Button icon={Upload} disabled={importing} onPress={importForecast}>{importing ? 'Importing…' : 'Import KNIME CSV'}</Button>
    </View>
    <View style={[s.panel, { gap: 14 }]}>
      <T accessibilityRole="header" style={s.h2}>Workbook days 61–67</T>
      <Choices label="Forecast period" options={days} value={day} onChange={setDay} />
      <CategoryChoices value={category} onChange={setCategory} allLabel={allCategories} />
    </View>
    <View style={s.wrap}>
      <ForecastTotal label="Projected servings" value={units(totals.units)} />
      <ForecastTotal label="Projected gross sales" value={money(totals.revenue)} />
    </View>
    {snapshot.metrics && <View style={[s.panel, { gap: 4 }]}>
      <T accessibilityRole="header" style={s.h2}>Model validation</T>
      <T style={s.muted}>Workbook days 54–60 · {snapshot.rows.length} dish-day observations</T>
      <T>Mean absolute error per dish per day · {snapshot.metrics.mae.toFixed(2)} servings for Random Forest and {snapshot.metrics.baseline.mae.toFixed(2)} for last week’s sales</T>
    </View>}
    <View style={[s.panel, { gap: 8 }]}>
      <T accessibilityRole="header" style={s.h2}>Dish projections</T>
      <T style={s.muted}>Sales estimates use workbook menu prices.</T>
      <Field label="Find a dish" value={search} onChangeText={setSearch} placeholder="Dish name or item ID" style={{ marginBottom: 0 }} />
      {items.length ? items.map(item => <View key={item.id} style={s.listRow}>
        <View style={[s.row, { alignItems: 'flex-start', justifyContent: 'space-between' }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <T style={s.bold}>{item.name}</T>
            <T style={[s.small, { color: categoryColors[item.category].solid }]}>{item.category} · {item.id}</T>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 1, maxWidth: '48%' }}>
            <T style={[s.bold, { textAlign: 'right' }]}>{units(item.units)} servings</T>
            <T style={[s.small, s.muted, { textAlign: 'right' }]}>{money(item.revenue)}</T>
          </View>
        </View>
        <View accessible={false} style={{ height: 4, backgroundColor: color.bg }}>
          <View style={{ height: '100%', width: `${items[0].units ? item.units / items[0].units * 100 : 0}%`, backgroundColor: categoryColors[item.category].solid }} />
        </View>
      </View>) : <Empty title={snapshot.rows.length ? 'No matching dishes' : 'Import forecast results from KNIME'} />}
    </View>
  </ScrollView>;
}

function ForecastTotal({ label, value }) {
  return <View style={[s.panel, { flexGrow: 1, flexBasis: 155, minWidth: 0, gap: 6 }]}>
    <T style={s.muted}>{label}</T>
    <T style={s.title}>{value}</T>
  </View>;
}
