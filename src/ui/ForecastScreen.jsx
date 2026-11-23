import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Upload } from 'lucide-react-native';
import { money } from '../domain/model.js';
import { FORECAST_DAYS, forecastItems, forecastWeekday, parseForecastCsv } from '../domain/forecast.js';
import workbookForecast from '../domain/workbook-forecast.json';
import * as files from '../services/files';
import { Button, Choices, Dialog, Empty, Field, T, Toggle } from './components';
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
  const [demandOnly, setDemandOnly] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const { width } = useWindowDimensions();
  const snapshot = state.forecast ?? workbookForecast;
  const hybrid = snapshot.rows[0]?.knnUnits !== undefined;
  const items = forecastItems(snapshot.rows, { category: category === allCategories ? null : category, day, search, demandOnly });
  const totals = items.reduce((sum, item) => ({ units: sum.units + item.units, revenue: sum.revenue + item.revenue }), { units: 0, revenue: 0 });

  async function importForecast() {
    setImporting(true);
    try {
      const text = await run(files.importForecast);
      if (text === null) return;
      const rows = await run(() => parseForecastCsv(text));
      if (rows && await mutate(current => ({ ...current, forecast: { rows, importedAt: new Date().toISOString() } }))) {
        notify(rows[0].knnUnits === undefined ? 'KNIME forecast imported.' : 'Hybrid forecast imported.');
      }
    } finally {
      setImporting(false);
    }
  }

  async function useWorkbookForecast() {
    if (await mutate(current => {
      delete current.forecast;
      return current;
    })) notify('Workbook hybrid forecast restored.');
  }

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, { maxWidth: 1152, width: '100%', alignSelf: 'center' }, width < 600 && { padding: 16 }]}>
    <View style={[s.wrap, { alignItems: 'center', justifyContent: 'space-between' }]}>
      <View style={{ gap: 4, flexGrow: 1 }}>
        <T accessibilityRole="header" style={s.title}>Sales forecast</T>
        <T style={s.muted}>{hybrid ? 'Hybrid forecast · KNIME Random Forest + KNN regression' : 'KNIME Random Forest · 7-day sales lag'}</T>
        <T style={[s.small, s.muted]}>{state.forecast
          ? `CSV imported ${new Date(snapshot.importedAt).toLocaleDateString('en-PH')}`
          : 'DataSet.xlsx · 60 days of sales history'}</T>
      </View>
      <View style={s.wrap}>
        {snapshot.metrics && <Button onPress={() => setShowScores(true)}>Model validation</Button>}
        {state.forecast && <Button disabled={importing} onPress={useWorkbookForecast}>Use workbook forecast</Button>}
        <Button icon={Upload} disabled={importing} onPress={importForecast}>{importing ? 'Importing…' : 'Import forecast CSV'}</Button>
      </View>
    </View>
    <View style={[s.panel, { gap: 14 }]}>
      <T accessibilityRole="header" style={s.h2}>Workbook days 61–67</T>
      <Choices label="Forecast period" options={days} value={day} onChange={setDay} />
      <CategoryChoices value={category} onChange={setCategory} allLabel={allCategories} />
    </View>
    <View style={s.wrap}>
      <ForecastTotal label="Projected servings" value={units(totals.units)} />
      <ForecastTotal label="Projected gross sales" value={money(totals.revenue)} />
      <ForecastTotal label="Dishes in demand" value={units(items.filter(item => item.inDemand).length)} />
    </View>
    <View style={[s.panel, { gap: 8 }]}>
      <T accessibilityRole="header" style={s.h2}>Product demand</T>
      <T style={s.muted}>In-demand dishes rank in the top quarter of their category by projected servings for the selected period. Sales estimates use workbook prices.</T>
      <Toggle label="Show only in-demand dishes" value={demandOnly} onChange={setDemandOnly} />
      <Field label="Find a dish" value={search} onChangeText={setSearch} placeholder="Dish name or item ID" style={{ marginBottom: 0 }} />
      {items.length ? items.map(item => <View key={item.id} style={s.listRow}>
        <View style={[s.row, { alignItems: 'flex-start', justifyContent: 'space-between' }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <T style={s.bold}>{item.name}</T>
            <T style={[s.small, { color: categoryColors[item.category].solid }]}>{item.category} · {item.id}</T>
            {item.inDemand && <T style={[s.small, s.bold, { color: color.green }]}>In demand</T>}
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 1, maxWidth: '48%' }}>
            <T style={[s.bold, { textAlign: 'right' }]}>{units(item.units)} servings</T>
            <T style={[s.small, s.muted, { textAlign: 'right' }]}>{money(item.revenue)}</T>
          </View>
        </View>
        <View accessible={false} style={{ height: 4, backgroundColor: color.bg }}>
          <View style={{ height: '100%', width: `${items[0].units ? item.units / items[0].units * 100 : 0}%`, backgroundColor: categoryColors[item.category].solid }} />
        </View>
      </View>) : <Empty title="No dishes match these filters" />}
    </View>
    {snapshot.metrics && showScores && <Dialog title="Model validation" onClose={() => setShowScores(false)} cancelLabel="Close">
      <T style={s.muted}>Workbook days 54–60 · {snapshot.metrics.observations} dish-day observations</T>
      <T>Mean absolute error in servings · Hybrid {snapshot.metrics.hybrid.mae.toFixed(2)} · Random Forest {snapshot.metrics.randomForest.mae.toFixed(2)} · KNN {snapshot.metrics.knn.mae.toFixed(2)} · Previous week {snapshot.metrics.baseline.mae.toFixed(2)}</T>
      <T>{snapshot.metrics.highDemand.hits} of {snapshot.metrics.highDemand.selected} high-demand flags matched actual sales rankings on their forecast day.</T>
    </Dialog>}
  </ScrollView>;
}

function ForecastTotal({ label, value }) {
  return <View style={[s.panel, { flexGrow: 1, flexBasis: 155, minWidth: 0, gap: 6 }]}>
    <T style={s.muted}>{label}</T>
    <T style={s.title}>{value}</T>
  </View>;
}
