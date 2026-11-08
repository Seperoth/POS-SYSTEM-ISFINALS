import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Minus, X } from 'lucide-react-native';
import { blankState, clone, uid, totals, money, configureCartItem, toggleCartOption, missingChoices } from '../domain/model.js';
import { T, Button, PersistentField, Choices } from './components';
import { s, color } from './theme';

export default function OrderPanel({ state, mutate, modal, notify, onPay, mobile, onClose, selectedLineId, onSelectLine }) {
  const [panelHeight, setPanelHeight] = useState(0);
  const form = useRef(null), insets = useSafeAreaInsets();
  const { items } = state.draft, amount = totals(state.draft);
  const selected = items.find(item => item.id === selectedLineId) || items.at(-1);
  useEffect(() => { form.current?.scrollTo({ y: 0, animated: false }); }, [selected?.id]);
  const product = state.products.find(product => product.id === selected?.productId);
  const incomplete = items.some(item => missingChoices(state.products.find(product => product.id === item.productId), item.optionIds).length);
  const receiptWeight = panelHeight && panelHeight < 480 ? 0.35 : 0.5;
  const draft = fields => mutate(next => { Object.assign(next.draft, fields); return next; });
  async function hold() {
    const saved = await mutate(next => { next.held.push({ id: uid('hold'), at: new Date().toISOString(), draft: clone(next.draft) }); next.draft = blankState().draft; return next; });
    if (saved) notify('Order held.');
  }
  function quantity(delta) {
    return mutate(next => {
      const item = next.draft.items.find(item => item.id === selected.id);
      if (!item) return next;
      if (item.quantity + delta > 999) throw new Error('Quantity must be 1–999.');
      if (item.quantity + delta < 1) next.draft.items = next.draft.items.filter(line => line.id !== item.id);
      else item.quantity += delta;
      return next;
    });
  }
  return <View style={{ flex: 1, backgroundColor: '#fff', minHeight: 0 }} onLayout={event => setPanelHeight(event.nativeEvent.layout.height)}>
    <View style={s.orderHeader}><T style={s.h2}>Current order <T style={[s.small, s.muted]}>#{state.nextOrder}</T></T>
      {mobile && <Button icon={X} label="Close current order" onPress={onClose} style={{ paddingHorizontal: 14 }} />}
    </View>
    <View testID="receipt-preview" style={[s.receiptSection, { flex: receiptWeight }]}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={s.receiptBody}>
        <T style={[s.small, s.muted, { marginBottom: 8 }]}>Receipt preview</T>
        <T style={[s.bold, { fontSize: 22, lineHeight: 29, marginBottom: 12 }]}>{state.draft.customer.trim() || 'Walk-in customer'}</T>
        {!items.length ? <T style={[s.muted, { paddingVertical: 20 }]}>No items added</T> : items.map(item => {
          const missing = missingChoices(state.products.find(product => product.id === item.productId), item.optionIds);
          return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Edit order item ${item.name} ${item.details}`} accessibilityState={{ selected: selected?.id === item.id }}
            onPress={() => onSelectLine(item.id)} style={[s.receiptItem, selected?.id === item.id && s.selectedReceiptItem]}>
            <T style={[s.bold, { fontSize: 20, lineHeight: 27 }]}>{item.quantity} × {item.name}</T>
            <T style={{ fontSize: 16, lineHeight: 22 }}>{item.details}</T>
            {item.note ? <T style={s.small}>Note: {item.note}</T> : null}
            <T style={[s.bold, { fontSize: 18, lineHeight: 25 }]}>{money(item.unitCents * item.quantity / 100)}</T>
            {missing.length > 0 && <T style={{ color: color.red }}>Choose {missing.join(', ').toLowerCase()}</T>}
          </Pressable>;
        })}
      </ScrollView>
      <View style={s.receiptTotal}>
        {amount.discount > 0 && <T>Discount: {money(amount.discount / 100)}</T>}
        <View style={[s.row, { justifyContent: 'space-between' }]}><T style={s.h2}>Total</T><T style={[s.bold, { fontSize: 28, lineHeight: 34 }]}>{money(amount.total / 100)}</T></View>
      </View>
    </View>
    <View testID="order-controls" style={[s.orderControls, { flex: 1 - receiptWeight }]}>
      <ScrollView ref={form} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={s.orderForm}>
        {selected && <View key={selected.id} style={{ gap: 12, marginBottom: 16 }}>
          <T style={[s.bold, { fontSize: 21, lineHeight: 28 }]}>{selected.name}</T>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={s.row}><Button icon={Minus} label={`Decrease ${selected.name}`} onPress={() => quantity(-1)} style={{ minWidth: 56, paddingHorizontal: 14 }} />
              <T accessibilityLabel={`Quantity ${selected.quantity}`} style={[s.bold, { fontSize: 26, lineHeight: 32, minWidth: 36, textAlign: 'center' }]}>{selected.quantity}</T>
              <Button icon={Plus} label={`Increase ${selected.name}`} onPress={() => quantity(1)} style={{ minWidth: 56, paddingHorizontal: 14 }} /></View>
            <Button icon={X} danger label={`Remove ${selected.name}`} onPress={() => mutate(next => { next.draft.items = next.draft.items.filter(item => item.id !== selected.id); return next; })} style={{ minWidth: 56, paddingHorizontal: 14 }} />
          </View>
          {product?.variants.length > 1 && <Choices label="Size / serving" value={selected.variantId} onChange={variantId => mutate(next => configureCartItem(next, selected.id, variantId))}
            options={product.variants.map(variant => ({ value: variant.id, label: `${variant.name} · ${money(variant.price)}` }))} />}
          {product?.modifierGroups.map(group => <View key={group.id} style={{ gap: 8, marginBottom: 12 }}>
            <T style={[s.label, group.required && !group.options.some(option => selected.optionIds.includes(option.id)) && { color: color.red }]}>{group.name}{group.required ? ' (required)' : ''}</T>
            <View style={s.wrap}>{group.options.map(option => <Button key={option.id} primary={selected.optionIds.includes(option.id)} accessibilityState={{ selected: selected.optionIds.includes(option.id) }}
              onPress={() => mutate(next => toggleCartOption(next, selected.id, group.id, option.id))}>{option.name}{option.price ? ` +${money(option.price)}` : ''}</Button>)}</View>
          </View>)}
        </View>}
        <PersistentField label="Customer name" value={state.draft.customer} onChangeText={customer => draft({ customer })} placeholder="Walk-in customer" />
        <Choices value={state.draft.service} onChange={service => draft({ service })} options={['Dine-in', 'Takeaway'].map(value => ({ value, label: value }))} />
      </ScrollView>
      <View style={[s.orderFooter, { paddingBottom: 12 + (mobile ? 0 : insets.bottom) }]}>
        <Button primary disabled={!items.length || incomplete} onPress={onPay} style={{ minHeight: 64 }}>Charge {money(amount.total / 100)}</Button>
        <View style={s.row}><Button style={{ flex: 1, paddingHorizontal: 10 }} disabled={!items.length} onPress={hold}>Hold order</Button><Button style={{ flex: 1, paddingHorizontal: 10 }} onPress={() => modal({ type: 'held' })}>Held ({state.held.length})</Button></View>
      </View>
    </View>
  </View>;
}
