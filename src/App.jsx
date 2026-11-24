import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, AppState, Platform, useWindowDimensions, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Crypto from 'expo-crypto';
import { SvgXml } from 'react-native-svg';
import { Plus, Search, Pencil, X, ChartNoAxesCombined, TrendingUp, Settings, CircleHelp, Printer, Download, ShoppingBag } from 'lucide-react-native';
import { openStore } from './data/store';
import { createController } from './data/controller.js';
import { addMenuItem, missingChoices, totals, money } from './domain/model.js';
import { menuCategory, withRestaurantCatalog } from './domain/menu.js';
import { cancelHeldOrder, resumeHeldOrder } from './domain/held-orders.js';
import { createBackup, readBackup, salesCsv } from './domain/backup.js';
import { salesForPeriod, salesSummary } from './domain/sales-report.js';
import release from '../release.json';
import { printWorker } from './services/print-worker.js';
import * as device from './services/device';
import * as files from './services/files';
import { checkForUpdate, applyUpdate } from './services/updates';
import { T, Button, Field, PersistentField, Choices, Toggle, Dialog, Empty, Loading, Divider } from './ui/components';
import { ProductEditor } from './ui/editors';
import { navIcons } from './ui/nav-icons';
import { s, color, categoryColors } from './ui/theme';
import { CategoryChoices } from './ui/categories';
import OrderPanel from './ui/OrderPanel';
import ForecastScreen from './ui/ForecastScreen';

const hash = text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
const dateLabel = value => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const filename = suffix => `restaurant-pos-${new Date().toISOString().slice(0, 10)}.${suffix}`;
const nav = [
  ['Point of sale', 'POS'],
  ['Orders', 'Orders'],
  ['Sales & reports', 'Reports', ChartNoAxesCombined],
  ['Forecast', 'Forecast', TrendingUp],
  ['Settings', 'Settings', Settings],
  ['Help', 'Help', CircleHelp],
];
let controllerPromise;
function boot() { return controllerPromise ||= openStore().then(createController).catch(e => { controllerPromise = null; throw e; }); }
export default function App() {
  const [fonts, fontError] = useFonts({ Roboto: require('@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf'), RobotoMedium: require('@expo-google-fonts/roboto/500Medium/Roboto_500Medium.ttf'), RobotoBold: require('@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf') });
  const [controller, setController] = useState(null), [error, setError] = useState('');
  useEffect(() => { boot().then(setController).catch(e => setError(e.message)); }, []);
  return <SafeAreaProvider><StatusBar style="dark" />{error || fontError ? <SafeAreaView style={[s.app, s.page]}><T style={s.error}>{error || fontError.message}</T><Button onPress={() => { setError(''); boot().then(setController).catch(e => setError(e.message)); }}>Try again</Button></SafeAreaView>
    : !fonts || !controller ? <Loading /> : <Workspace controller={controller} />}</SafeAreaProvider>;
}
function Workspace({ controller }) {
  const [state, setState] = useState(controller.get()), [tab, setTab] = useState(0), [modal, setModal] = useState(null), [selectedLineId, setSelectedLineId] = useState(null), [orderOpen, setOrderOpen] = useState(false), [message, setMessage] = useState(''), [updating, setUpdating] = useState(false), [update, setUpdate] = useState({ status: '', message: '' });
  const { width, height } = useWindowDimensions(), wide = width >= 900 && (Platform.OS !== 'web' || height >= 540), orderWidth = width >= 1300 ? 440 : 400, insets = useSafeAreaInsets();
  const toastTimer = useRef(), mounted = useRef(true), checkingUpdate = useRef(false), drain = useRef(printWorker(controller, device.printReceipt)).current;
  const notify = text => { setMessage(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setMessage(''), 6500); };
  const run = async action => { try { return await action(); } catch (e) { notify(e.message); return null; } };
  const mutate = fn => run(() => controller.mutate(fn));
  const close = () => setModal(null);
  async function checkUpdates(silent = false) {
    if (checkingUpdate.current) return;
    checkingUpdate.current = true;
    setUpdating(true);
    try { const result = await checkForUpdate(); if (mounted.current) { setUpdate(result); if (!silent || result.status === 'ready') notify(result.message); } }
    catch (e) { if (!silent) notify(`Update check failed: ${e.message}`); }
    finally { checkingUpdate.current = false; if (mounted.current) setUpdating(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = controller.subscribe(next => { setState(next); drain().catch(e => notify(`Printing paused: ${e.message}`)); });
    drain().catch(e => notify(e.message)); checkUpdates(true);
    const listener = AppState.addEventListener('change', value => { if (value === 'active') { drain().catch(e => notify(e.message)); checkUpdates(true); } });
    return () => { mounted.current = false; unsubscribe(); listener.remove(); clearTimeout(toastTimer.current); };
  }, []);
  useEffect(() => {
    const event = BackHandler.addEventListener('hardwareBackPress', () => { if (orderOpen) { setOrderOpen(false); return true; } if (tab) { setTab(0); return true; } return false; });
    return () => event.remove();
  }, [orderOpen, tab]);
  const props = { state, controller, mutate, run, notify, modal: setModal, close };
  const cartCount = state.draft.items.reduce((n, i) => n + i.quantity, 0);
  const openReceipt = sale => setModal({ type: 'receipt', saleId: sale.id });
  const order = <OrderPanel {...props} selectedLineId={selectedLineId} onSelectLine={setSelectedLineId} mobile={!wide} onClose={() => setOrderOpen(false)} onPay={() => setModal({ type: 'payment' })} />;
  async function addProduct(productId) {
    let lineId;
    const saved = await mutate(current => { const result = addMenuItem(current, productId); lineId = result.lineId; return result.state; });
    if (!saved) return;
    setSelectedLineId(lineId);
    const item = saved.draft.items.find(item => item.id === lineId), product = saved.products.find(product => product.id === productId);
    if (!wide && missingChoices(product, item.optionIds).length) setOrderOpen(true);
  }
  async function backup(share = false, recovery = false) {
    await run(async () => {
      const data = recovery ? await controller.recovery() : controller.get();
      if (!data) throw new Error('No pre-restore copy is available.');
      const text = await createBackup(data, hash);
      const ok = await (share ? files.shareFile : files.exportFile)(filename(recovery ? 'recovery.json' : 'backup.json'), text);
      if (ok) notify('Backup exported. Keep a copy outside this device.');
    });
  }
  async function importBackup() {
    await run(async () => { const text = await files.importBackup(); if (!text) return; const backup = await readBackup(text, hash); setModal({ type: 'restore', backup }); });
  }
  return <SafeAreaView edges={['top', 'left', 'right']} style={s.app}>
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flex: 1 }} accessibilityElementsHidden={!wide && orderOpen && tab === 0} importantForAccessibility={!wide && orderOpen && tab === 0 ? 'no-hide-descendants' : 'auto'}>
        <View style={s.header}>
          <T style={[s.bold, { textAlign: 'center' }]}>Restaurant POS</T>
        </View>
        <View style={{ flex: 1 }}>
          {tab === 0 && <MenuScreen {...props} onAdd={addProduct} />}
          {tab === 1 && <OrdersScreen {...props} openReceipt={openReceipt} />}
          {tab === 2 && <ReportsScreen {...props} openReceipt={openReceipt} />}
          {tab === 3 && <ForecastScreen {...props} />}
          {tab === 4 && <SettingsScreen {...props} backup={backup} importBackup={importBackup} checkUpdates={checkUpdates} update={update} updating={updating} onRestart={() => setModal({ type: 'restart' })} />}
          {tab === 5 && <HelpScreen />}
        </View>
        {!wide && tab === 0 && <Button primary icon={ShoppingBag} style={{ margin: 12 }} onPress={() => setOrderOpen(true)}>View order · {cartCount} {cartCount === 1 ? 'item' : 'items'} · {money(totals(state.draft).total / 100)}</Button>}
        </View>
        <View style={[s.nav, { paddingBottom: 12 + insets.bottom }]}>{nav.map(([label, title, Icon], index) => {
          const selected = tab === index, tint = selected ? '#fff' : '#646669';
          return <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => { setTab(index); setOrderOpen(false); }}
            style={({ pressed }) => [s.navButton, { maxWidth: `${100 / nav.length}%` }, selected && { backgroundColor: color.active }, pressed && { opacity: 0.6 }]}>
            {index < 2 ? <SvgXml xml={navIcons[index].replace(/ data-name="[^"]*"/g, '')} width={23} height={23} fill={tint} /> : <Icon size={24} color={tint} strokeWidth={1.7} />}
            <T style={{ color: tint, fontSize: 11, lineHeight: 15 }}>{title}</T>
          </Pressable>;
        })}</View>
      </View>
      {wide && tab === 0 && <View style={{ width: orderWidth, backgroundColor: '#fff', borderLeftWidth: 1, borderColor: color.line }}>{order}</View>}
    </View>
    {!wide && orderOpen && tab === 0 && <View style={{ position: 'absolute', top: insets.top, left: insets.left, right: insets.right, bottom: 80 + insets.bottom, backgroundColor: '#fff' }}>{order}</View>}
    {message ? <Pressable onPress={() => setMessage('')} style={[s.toast, { bottom: (!wide && tab === 0 && !orderOpen ? 150 : 84) + insets.bottom, ...(wide && tab === 0 ? { right: (orderWidth) + 16 } : {}) }]}><T accessibilityRole="alert" style={s.white}>{message}</T></Pressable> : null}
    {modal?.type === 'product' && <ProductEditor {...props} product={modal.product} />}
    {modal?.type === 'load-catalog' && <Dialog title="Load restaurant catalog" onClose={close} saveLabel="Add dishes" onSave={async () => {
      await controller.mutate(withRestaurantCatalog); close(); notify('Restaurant catalog loaded.');
    }}><T>Add the workbook dishes that have not already been added to this device.</T></Dialog>}
    {modal?.type === 'payment' && <Payment {...props} onDone={sale => { setOrderOpen(false); openReceipt(sale); drain().catch(e => notify(e.message)); }} />}
    {modal?.type === 'receipt' && <Receipt {...props} sale={state.sales.find(s => s.id === modal.saleId)} />}
    {modal?.type === 'sales-summary' && <SalesSummary {...props} report={modal.report} />}
    {modal?.type === 'held' && <HeldOrders {...props} />}
    {modal?.type === 'restore' && <Dialog title="Restore backup" onClose={close} saveLabel="Replace local records" onSave={async () => { await controller.restore(modal.backup.payload); close(); notify('Backup restored. A copy of the previous records is available in Settings.'); }}>
      <T>Backup from {dateLabel(modal.backup.createdAt)}</T><T>{modal.backup.payload.products.filter(product => !product.deletedAt).length} menu items · {modal.backup.payload.sales.length} sales</T>
      <T>This replaces the current menu, sales, orders, and settings. A recovery copy of the current records will be saved first.</T><T>Check the printer selection after restoring. Pending print jobs will require review.</T>
    </Dialog>}
    {modal?.type === 'restart' && <Dialog title="Apply app update" onClose={close} saveLabel="Restart app" onSave={async () => {
      if (state.draft.items.length || state.printJobs.some(j => ['printing', 'queued'].includes(j.status))) throw new Error('Finish or hold the current order and complete pending printing first.');
      await applyUpdate(); close();
    }}><T>The app will restart to apply the downloaded update. Your menu and saved sales stay on this device.</T></Dialog>}
  </SafeAreaView>;
}
function MenuScreen({ state, modal, onAdd }) {
  const [search, setSearch] = useState(''), [category, setCategory] = useState('All menu'), [manage, setManage] = useState(false), [menuWidth, setMenuWidth] = useState(0);
  const { width } = useWindowDimensions(), contentWidth = Math.max(0, (menuWidth || width) - (width < 600 ? 32 : 48));
  const columns = Math.min(3, Math.max(1, Math.floor((contentWidth + 16) / 246))), cardWidth = (contentWidth - (columns - 1) * 16) / columns;
  const catalog = state.products.filter(product => !product.deletedAt);
  useEffect(() => { if (!catalog.length) { setCategory('All menu'); setManage(false); } }, [catalog.length]);
  const products = catalog.filter(p => (manage || p.active !== false) && (category === 'All menu' || menuCategory(p.category) === category) && `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()));
  return <ScrollView keyboardShouldPersistTaps="handled" onLayout={event => setMenuWidth(event.nativeEvent.layout.width)} contentContainerStyle={[s.page, width < 600 && { padding: 16 }]}>
    <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><T style={s.title}>Menu</T><View style={s.row}>{catalog.length > 0 && <Button onPress={() => setManage(!manage)}>{manage ? 'Done' : 'Manage menu'}</Button>}<Button icon={Plus} onPress={() => modal({ type: 'product' })}>Add item</Button></View></View>
    {catalog.length > 0 && <><View style={[s.field, s.row]}><Search size={20} color={color.muted} /><TextInput accessibilityLabel="Search menu" placeholder="Search menu" placeholderTextColor={color.muted} value={search} onChangeText={setSearch} style={[s.text, { flex: 1, minHeight: 24, outlineWidth: 0 }]} /></View>
      <CategoryChoices value={category} onChange={setCategory} allLabel="All menu" /></>}
    {(manage || !catalog.length) && <Button onPress={() => modal({ type: 'load-catalog' })}>Load workbook catalog</Button>}
    {!products.length ? <Empty title={catalog.length ? 'No matching items' : 'Your menu is empty'} action={catalog.length ? undefined : 'Add menu item'} onPress={() => modal({ type: 'product' })} />
      : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{products.map(p => {
        const category = menuCategory(p.category), tone = categoryColors[category], ink = tone ? '#fff' : color.ink;
        return <Pressable key={p.id} testID={`menu-card-${p.id}`} accessibilityRole="button" accessibilityLabel={`${manage ? 'Edit menu item' : 'Order'} ${p.name}`} disabled={!manage && p.active === false}
          onPress={() => manage ? modal({ type: 'product', product: p }) : onAdd(p.id)}
          style={({ pressed }) => [s.card, { width: cardWidth, opacity: pressed ? 0.8 : 1, ...(tone ? { backgroundColor: tone.solid, borderColor: tone.solid } : {}) }]}>
        <View style={{ gap: 8, flex: 1 }}>
          <T style={[s.bold, { fontSize: 26, lineHeight: 34, color: ink }]}>{p.name}</T>{p.description ? <T style={{ fontSize: 15, lineHeight: 22, color: tone ? '#fff' : color.muted }}>{p.description}</T> : null}
          <T style={[s.small, { color: ink }]}>{category || 'Choose category'}</T>
          {p.active === false && <T style={[s.small, { color: ink }]}>Unavailable</T>}
        </View>
        <View style={[s.row, { justifyContent: 'space-between', paddingTop: 10 }]}><T style={[s.bold, { fontSize: 21, color: ink }]}>{p.variants.length > 1 ? 'From ' : ''}{money(Math.min(...p.variants.map(v => v.price)))}</T>
          {manage && <Pencil size={22} color={ink} />}
        </View>
      </Pressable>; })}</View>}
  </ScrollView>;
}
function Payment({ state, controller, close, onDone }) {
  const [method, setMethod] = useState('Cash'), [received, setReceived] = useState(''), [reference, setReference] = useState('');
  const amount = totals(state.draft);
  return <Dialog title="Payment" onClose={close} saveLabel={`Complete sale · ${money(amount.total / 100)}`} onSave={async () => {
    const sale = await controller.checkout({ method, received, reference }); onDone(sale);
  }}>
    <T style={s.title}>{money(amount.total / 100)}</T><T>{state.draft.customer || 'Walk-in customer'}</T>
    <Choices label="Payment method" value={method} onChange={setMethod} options={['Cash', 'GCash', 'Maya'].map(value => ({ value, label: value }))} />
    {method === 'Cash' ? <><Field label="Cash received (₱)" numeric value={received} onChangeText={setReceived} autoFocus /><Button onPress={() => setReceived((amount.total / 100).toFixed(2))}>Exact amount</Button>
      <T>Change: {money(Math.max(0, Number(received || 0) - amount.total / 100))}</T></>
      : <><T style={s.muted}>Confirm the payment in GCash or Maya before completing this sale.</T><Field label="Payment reference (optional)" value={reference} onChangeText={setReference} /></>}
    <T style={s.small}>{state.settings.printerAddress && state.settings.autoPrint ? `Receipt will print on ${state.settings.printerName || 'the selected printer'}.` : 'Receipt will be saved locally. Select a printer in Settings for automatic printing.'}</T>
  </Dialog>;
}
function Receipt({ sale, state, controller, run, notify, close }) {
  if (!sale) return null;
  const jobs = state.printJobs.filter(j => j.saleId === sale.id), latest = jobs[jobs.length - 1];
  return <Dialog title={`Receipt #${sale.id}`} onClose={close} footer={<Button primary onPress={close}>Done</Button>}>
    <T style={[s.small, s.muted]}>{dateLabel(sale.at)}</T>
    <View style={[s.panel, { backgroundColor: '#fafafa' }]}><T selectable style={{ lineHeight: 26 }}>{sale.receipt}</T></View>
    {sale.method === 'Cash' && <T>Cash: {money(sale.receivedCents / 100)} · Change: {money(sale.changeCents / 100)}</T>}
    {latest && <T style={latest.status === 'needs_review' ? { color: color.red } : s.muted}>Printer: {latest.status === 'printed' ? 'Sent to printer' : latest.status.replace('_', ' ')}{latest.error ? ` · ${latest.error}` : ''}</T>}
    <Button icon={Printer} disabled={jobs.some(j => ['queued', 'printing'].includes(j.status))} onPress={() => run(async () => { await controller.reprint(sale.id); notify('Receipt queued for printing.'); })}>{latest ? 'Print another copy' : 'Print receipt'}</Button>
    <Button icon={Download} onPress={() => run(() => files.exportFile(`receipt-${sale.id}.txt`, sale.receipt, 'text/plain'))}>Save receipt to files</Button>
  </Dialog>;
}
function HeldOrders({ state, controller, close, run }) {
  return <Dialog key="held-list" title="Held orders" onClose={close} cancelLabel="Close">
    {!state.held.length && <Empty title="No held orders" />}
    {state.held.map(h => <View key={h.id} testID={`held-order-${h.id}`} style={s.listRow}><T style={s.bold}>{h.draft.customer || 'Walk-in customer'}</T><T>{dateLabel(h.at)} · {money(totals(h.draft).total / 100)}</T><T style={s.muted}>{h.draft.items.map(i => `${i.quantity} × ${i.name}`).join(', ')}</T>
      <View style={s.wrap}><Button style={{ flexGrow: 1 }} onPress={() => run(async () => { await controller.mutate(state => resumeHeldOrder(state, h.id)); close(); })}>Resume order</Button>
        <Button danger label={`Cancel held order ${h.draft.customer || 'Walk-in customer'}`} style={{ flexGrow: 1, borderColor: color.red }} onPress={() => run(() => controller.mutate(state => cancelHeldOrder(state, h.id)))}>Cancel order</Button></View>
    </View>)}
  </Dialog>;
}
function OrdersScreen({ state, mutate, openReceipt }) {
  const [status, setStatus] = useState('Active');
  const statuses = ['Queued', 'Preparing', 'Ready', 'Completed'];
  const sales = [...state.sales].reverse().filter(s => status === 'All orders' || s.status !== 'Completed');
  return <ScrollView contentContainerStyle={s.page}><T style={s.title}>Orders</T><Choices value={status} onChange={setStatus} options={['Active', 'All orders'].map(value => ({ value, label: value }))} />
    {!sales.length && <Empty title="No orders" />}
    {sales.map(sale => <View key={sale.id} style={[s.panel, { gap: 12 }]}>
      <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><T style={s.h2}>#{sale.id} · {sale.customer || 'Walk-in customer'}</T><T style={s.badge}>{sale.status}</T></View>
      <T style={s.muted}>{dateLabel(sale.at)} · {sale.service}</T>{sale.items.map(i => <View key={i.id}><T style={s.bold}>{i.quantity} × {i.name}</T><T>{i.details}{i.note ? ` · ${i.note}` : ''}</T></View>)}
      {sale.note ? <T>Order note: {sale.note}</T> : null}
      <View style={s.wrap}><Button onPress={() => openReceipt(sale)}>Receipt · {money(sale.totalCents / 100)}</Button>{sale.status !== 'Completed' && <Button primary onPress={() => mutate(s => { s.sales.find(i => i.id === sale.id).status = statuses[statuses.indexOf(sale.status) + 1]; return s; })}>{statuses[statuses.indexOf(sale.status) + 1]}</Button>}</View>
    </View>)}
  </ScrollView>;
}
function ReportsScreen({ state, run, openReceipt, modal }) {
  const [range, setRange] = useState('Today');
  const sales = salesForPeriod(state.sales, range);
  const revenue = sales.reduce((n, s) => n + s.totalCents, 0);
  const popular = new Map(); sales.forEach(s => s.items.forEach(i => { const current = popular.get(i.name) || { quantity: 0, revenue: 0 }; current.quantity += i.quantity; current.revenue += i.unitCents * i.quantity; popular.set(i.name, current); }));
  return <ScrollView contentContainerStyle={s.page}><View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><T style={s.title}>Sales & reports</T><Button icon={Download} onPress={() => run(() => files.exportFile(filename('sales.csv'), salesCsv({ sales }), 'text/csv'))}>Export sales CSV</Button></View>
    <Choices value={range} onChange={setRange} options={['Today', 'All time'].map(value => ({ value, label: value }))} />
    <View style={s.wrap}><View style={[s.panel, { flexGrow: 1, gap: 8 }]}><T style={s.muted}>Sales</T><T style={s.title}>{money(revenue / 100)}</T></View><View style={[s.panel, { flexGrow: 1, gap: 8 }]}><T style={s.muted}>Orders</T><T style={s.title}>{sales.length}</T></View></View>
    <Button icon={Printer} disabled={!sales.length} onPress={() => modal({ type: 'sales-summary', report: salesSummary(sales, { period: range }) })}>Print sales summary</Button>
    <View style={s.panel}>{['Cash', 'GCash', 'Maya', ...new Set(sales.map(s => s.method).filter(method => !['Cash', 'GCash', 'Maya'].includes(method)))].map(method => <View key={method} style={[s.row, { justifyContent: 'space-between', paddingVertical: 10 }]}><T>{method === 'Card' ? 'Card (previous sales)' : method}</T><T style={s.bold}>{money(sales.filter(s => s.method === method).reduce((n, s) => n + s.totalCents, 0) / 100)}</T></View>)}</View>
    {popular.size > 0 && <View style={s.panel}><T style={s.h2}>Items sold</T>{[...popular].sort((a, b) => b[1].quantity - a[1].quantity).map(([name, item]) => <View key={name} style={[s.row, { justifyContent: 'space-between', paddingTop: 12 }]}><T style={{ flex: 1 }}>{name}</T><T>{item.quantity}</T></View>)}</View>}
    <T style={s.h2}>Saved receipts</T>{!sales.length && <Empty title="No recorded sales" />}
    {[...sales].reverse().map(sale => <Pressable accessibilityRole="button" accessibilityLabel={`Receipt ${sale.id}`} key={sale.id} onPress={() => openReceipt(sale)} style={[s.panel, { gap: 8 }]}><View style={[s.row, { justifyContent: 'space-between' }]}><T style={s.bold}>#{sale.id} · {sale.customer || 'Walk-in customer'}</T><T style={s.bold}>{money(sale.totalCents / 100)}</T></View><T style={s.muted}>{dateLabel(sale.at)} · {sale.method}</T></Pressable>)}
  </ScrollView>;
}
function SalesSummary({ report, controller, run, notify, close }) {
  const [busy, setBusy] = useState(false);
  async function print() {
    if (busy) return;
    setBusy(true);
    try {
      const queued = await run(() => controller.printSalesReport(report));
      if (queued) { close(); notify('Sales summary queued for printing.'); }
    } finally { setBusy(false); }
  }
  return <Dialog title="Sales summary" onClose={close} busy={busy} footer={<>
    <Button disabled={busy} onPress={close}>Done</Button>
    <Button disabled={busy} icon={Download} onPress={() => run(() => files.exportFile(filename('sales-summary.txt'), report.receipt, 'text/plain'))}>Save to files</Button>
    <Button primary disabled={busy} icon={Printer} onPress={print}>{busy ? 'Queuing…' : 'Print summary'}</Button>
  </>}>
    <View style={[s.panel, { backgroundColor: '#fafafa' }]}><T selectable style={{ lineHeight: 26 }}>{report.receipt}</T></View>
  </Dialog>;
}
function SettingsScreen({ state, controller, mutate, run, notify, modal, backup, importBackup, checkUpdates, update, updating, onRestart }) {
  const [printers, setPrinters] = useState([]), [printerBusy, setPrinterBusy] = useState(false), [review, setReview] = useState(null);
  const settings = fields => mutate(s => { Object.assign(s.settings, fields); return s; });
  const pending = state.printJobs.filter(j => j.status !== 'printed');
  async function refreshPrinters() { setPrinterBusy(true); await run(async () => { const result = await device.pairedPrinters(); setPrinters(result); if (!result.length) notify('No paired devices found. Pair the printer in Android Bluetooth settings.'); }); setPrinterBusy(false); }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}><T style={s.title}>Settings</T>
    <View style={[s.panel, { gap: 12 }]}><T style={s.h2}>Staff</T><PersistentField label="Cashier" value={state.settings.cashier} onChangeText={cashier => settings({ cashier })} /></View>
    <View style={[s.panel, { gap: 12 }]}><T style={s.h2}>Receipt printer</T><T style={s.muted}>{state.settings.printerName || 'No printer selected'}</T>
      <T style={s.small}>Android Bluetooth Classic / SPP receipt printer with ESC/POS support.</T>
      <View style={s.wrap}><Button onPress={() => run(device.bluetoothSettings)}>Pair in Android settings</Button><Button disabled={printerBusy} onPress={refreshPrinters}>{printerBusy ? 'Loading…' : 'Load paired devices'}</Button></View>
      {printers.map(p => <Button key={p.address} primary={state.settings.printerAddress === p.address} onPress={() => settings({ printerAddress: p.address, printerName: p.name })}>{p.name} · {p.address}</Button>)}
      {state.settings.printerAddress ? <Button onPress={() => settings({ printerAddress: '', printerName: '' })}>Clear selected printer</Button> : null}
      <Choices label="Paper width" value={state.settings.paperWidth} onChange={paperWidth => settings({ paperWidth })} options={[{ value: 58, label: '58 mm' }, { value: 80, label: '80 mm' }]} />
      <Toggle label="Automatically print after a completed sale" value={state.settings.autoPrint} onChange={autoPrint => settings({ autoPrint })} />
      <Button icon={Printer} disabled={!state.settings.printerAddress || printerBusy} onPress={() => run(async () => { setPrinterBusy(true); try { await device.printReceipt(state.settings.printerAddress, 'Printer test\n\nUniversal POS\n₱123.45\n\nTotal: ₱123.45', state.settings.paperWidth); notify('Test sent. Check the printed paper.'); } finally { setPrinterBusy(false); } })}>Print test</Button>
      {pending.length > 0 && <><Divider /><T style={s.h2}>Print queue</T>{pending.map(j => <View key={j.id} style={s.listRow}><T style={s.bold}>{j.kind === 'sales-report' ? j.label : `Receipt #${j.saleId}`} · {j.status.replace('_', ' ')}</T>{j.error ? <T style={{ color: color.red }}>{j.error}</T> : null}{j.status === 'needs_review' && <Button onPress={() => setReview(j)}>Review / retry</Button>}</View>)}</>}
    </View>
    <View style={[s.panel, { gap: 14 }]}><T style={s.h2}>Data & backups</T><T style={s.muted}>{Platform.OS === 'web' ? 'Browser preview records stay in this browser. Android uses its own SQLite database.' : 'Your menu, sales, and receipt copies are stored on this device.'}</T>
      <Button icon={Download} onPress={() => backup()}>Save full backup to files</Button><Button onPress={() => backup(true)}>Share full backup</Button><Button onPress={importBackup}>Restore from backup</Button><Button onPress={() => backup(false, true)}>Export pre-restore recovery copy</Button>
      <T style={s.small}>Move a backup to another device, a drive, or your Wi-Fi storage. Uninstalling the app removes its local database.</T>
    </View>
    <View style={[s.panel, { gap: 14 }]}><T style={s.h2}>App updates</T><T>Version {release.version}</T>
      {update.message ? <T>{update.message}</T> : null}<Button disabled={updating} onPress={() => checkUpdates()}>{updating ? 'Checking…' : 'Check for updates'}</Button>{update.status === 'ready' && <Button primary onPress={onRestart}>Apply downloaded update</Button>}
      <Button onPress={() => run(device.installSettings)}>Allow APK updates in Android settings</Button>
      <Button onPress={() => run(async () => { if (!(await device.installPermission())) throw new Error('Allow APK updates in Android settings first.'); const uri = await files.pickApk(); if (uri) await device.installApk(uri); })}>Install newer APK from files</Button>
    </View>
    {review && <Dialog title={review.kind === 'sales-report' ? 'Review sales summary' : `Review receipt #${review.saleId}`} onClose={() => setReview(null)} saveLabel="Retry printing" onSave={async () => {
      if (!state.settings.printerAddress) throw new Error('Select a paired printer first.');
      await controller.mutate(s => { const job = s.printJobs.find(j => j.id === review.id); job.status = 'queued'; job.error = ''; job.address = s.settings.printerAddress; job.paperWidth = s.settings.paperWidth; return s; }); setReview(null);
    }}><T>Check the printer before retrying. If the receipt already printed, another attempt will create a duplicate paper copy.</T><Button onPress={() => run(async () => { await controller.mutate(s => { const job = s.printJobs.find(j => j.id === review.id); job.status = 'printed'; job.printedAt = new Date().toISOString(); job.error = 'Paper output confirmed by cashier.'; return s; }); setReview(null); })}>Already printed — mark complete</Button></Dialog>}
  </ScrollView>;
}
function HelpScreen() {
  return <ScrollView contentContainerStyle={s.page}><T style={s.title}>Help</T>
    <View style={[s.panel, { gap: 14 }]}><T style={s.h2}>Set up your POS</T><T>1. Add your menu items, sizes, prices, and optional extras.</T><T>2. Pair the receipt printer in Android settings, select it in Settings, and print a test.</T><T>3. Make a test sale and save a full backup outside this device.</T></View>
    <View style={[s.panel, { gap: 14 }]}><T style={s.h2}>Daily use</T><T>Add items, enter the customer name, and charge the order. GCash and Maya are recorded after you confirm payment in the payment app.</T><T>Orders appear on the preparation screen after payment. Open any saved receipt to print another copy.</T><T>In Sales & reports, print a sales summary to group purchases by customer. Export a full backup regularly and keep a copy outside the phone.</T></View>
    <View style={[s.panel, { gap: 14 }]}><T style={s.h2}>Offline & updates</T><T>The installed Android app runs offline. Wi-Fi is used when you check for published app updates or move backups to network storage.</T><T>Install updates over the existing app. Keep the same Android signing key and application ID so local records are retained. Back up before uninstalling or clearing app storage.</T></View>
  </ScrollView>;
}
