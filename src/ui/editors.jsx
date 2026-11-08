import React, { useState } from 'react';
import { View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { T, Button, Field, Toggle, Choices, Dialog, Divider } from './components';
import { s, color } from './theme';
import { clone, uid } from '../domain/model.js';
import { menuCategory, saveMenuItem, removeMenuItem } from '../domain/menu.js';
import { CategoryChoices } from './categories';
export const options = list => list.map(i => ({ value: i.id, label: i.name }));
export function ProductEditor({ product, controller, close }) {
  const [form, set] = useState(() => ({ ...clone(product || { id: uid('product'), name: '', description: '', active: true, trackInventory: false,
    variants: [{ id: uid('size'), name: 'Regular', price: '' }], modifierGroups: [] }), category: menuCategory(product?.category) || '' }));
  const [removing, setRemoving] = useState(false);
  const patch = fields => set(current => ({ ...current, ...fields }));
  function variant(id, fields) { patch({ variants: form.variants.map(v => v.id === id ? { ...v, ...fields } : v) }); }
  function group(id, fields) { patch({ modifierGroups: form.modifierGroups.map(g => g.id === id ? { ...g, ...fields } : g) }); }
  async function save() {
    const next = clone(form); next.name = next.name.trim();
    if (next.variants.some(v => String(v.price).trim() === '')) throw new Error('Enter a price for every size or serving. Use 0 for a free item.');
    next.variants.forEach(v => { v.price = Number(v.price); }); next.modifierGroups.forEach(g => g.options.forEach(o => { o.price = Number(o.price); }));
    await controller.mutate(state => saveMenuItem(state, next)); close();
  }
  if (removing) return <Dialog key="remove" title="Remove menu item?" onClose={() => setRemoving(false)} saveDanger saveLabel="Remove item" onSave={async () => { await controller.mutate(state => removeMenuItem(state, product.id)); close(); }}>
    <T style={s.h2}>{product.name}</T><T>This item will be removed from the menu. Saved sales and receipts will remain.</T>
  </Dialog>;
  return <Dialog key="edit" title={product ? 'Edit menu item' : 'Add menu item'} onClose={close} onSave={save} wide>
    <Field label="Item name" value={form.name} onChangeText={name => patch({ name })} autoFocus />
    <Field label="Description" value={form.description} onChangeText={description => patch({ description })} multiline />
    <View style={{ gap: 8, marginBottom: 16 }}><T style={s.label}>Category</T><CategoryChoices value={form.category} onChange={category => patch({ category })} /></View>
    <T style={s.h2}>Sizes or servings</T>
    {form.variants.map(v => <View key={v.id} style={s.row}>
      <Field label="Size / serving" style={{ flex: 1 }} value={v.name} onChangeText={name => variant(v.id, { name })} />
      <Field label="Price (₱)" numeric style={{ width: 110 }} value={v.price} onChangeText={price => variant(v.id, { price })} />
      {form.variants.length > 1 && <Button icon={Trash2} label={`Remove ${v.name}`} onPress={() => patch({ variants: form.variants.filter(i => i.id !== v.id) })} style={{ paddingHorizontal: 10 }} />}
    </View>)}
    <Button icon={Plus} onPress={() => patch({ variants: [...form.variants, { id: uid('size'), name: '', price: '' }] })}>Add size / serving</Button>
    <Divider /><T style={s.h2}>Milk, extras & other options</T>
    {form.modifierGroups.map(g => <View key={g.id} style={[s.panel, { padding: 14, gap: 8 }]}>
      <Field label="Option group name" value={g.name} onChangeText={name => group(g.id, { name })} placeholder="Milk type, extras…" />
      <Choices label="Selection" value={g.mode} onChange={mode => group(g.id, { mode })} options={[{ value: 'single', label: 'Choose one' }, { value: 'multiple', label: 'Choose several' }]} />
      <Toggle label="Customer must choose an option" value={g.required} onChange={required => group(g.id, { required })} />
      {g.options.map(o => <View key={o.id} style={s.row}>
        <Field label="Option name" style={{ flex: 1 }} value={o.name} onChangeText={name => group(g.id, { options: g.options.map(i => i.id === o.id ? { ...i, name } : i) })} />
        <Field label="Extra (₱)" numeric style={{ width: 95 }} value={o.price} onChangeText={price => group(g.id, { options: g.options.map(i => i.id === o.id ? { ...i, price } : i) })} />
        <Button icon={Trash2} label={`Remove ${o.name || 'option'}`} style={{ paddingHorizontal: 8 }} onPress={() => group(g.id, { options: g.options.filter(i => i.id !== o.id) })} />
      </View>)}
      <Button icon={Plus} onPress={() => group(g.id, { options: [...g.options, { id: uid('option'), name: '', price: 0 }] })}>Add option</Button>
      <Button danger onPress={() => patch({ modifierGroups: form.modifierGroups.filter(i => i.id !== g.id) })}>Remove option group</Button>
    </View>)}
    <Button icon={Plus} onPress={() => patch({ modifierGroups: [...form.modifierGroups, { id: uid('group'), name: '', mode: 'single', required: false, options: [{ id: uid('option'), name: '', price: 0 }] }] })}>Add option group</Button>
    <Toggle label="Available on menu" value={form.active} onChange={active => patch({ active })} />
    {product && <><Divider /><Button icon={Trash2} danger onPress={() => setRemoving(true)}>Remove menu item</Button></>}
  </Dialog>;
}
