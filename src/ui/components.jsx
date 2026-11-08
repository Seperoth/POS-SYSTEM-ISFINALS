import React, { useEffect, useRef, useState } from 'react';
import { Text, View, TextInput, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { X, Check, Plus } from 'lucide-react-native';
import { s, color } from './theme';
export const T = ({ style, children, ...props }) => <Text {...props} style={[s.text, style]}>{children}</Text>;
export function Button({ children, onPress, primary, disabled, style, icon: Icon, danger, label, ...props }) {
  return <Pressable {...props} accessibilityRole="button" accessibilityLabel={label || (typeof children === 'string' ? children : undefined)} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, primary && s.primary, disabled && s.disabled, pressed && { opacity: 0.7 }, style]}>
    {Icon && <Icon size={22} color={danger ? color.red : Icon === Plus ? (primary ? '#86efac' : color.green) : primary ? '#fff' : color.ink} />}
    {children != null && <T style={[s.buttonText, primary && s.white, danger && { color: color.red }]}>{children}</T>}
  </Pressable>;
}
export function Field({ label, value, onChangeText, style, numeric, multiline, ...props }) {
  return <View style={[s.fieldGroup, style]}>{label && <T style={s.label}>{label}</T>}<TextInput accessibilityLabel={label} {...props} value={String(value ?? '')} onChangeText={onChangeText}
    keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} placeholderTextColor="#8a8b8d" style={[s.field, multiline && { minHeight: 84, textAlignVertical: 'top' }]} /></View>;
}
export function PersistentField({ value, onChangeText, ...props }) {
  const [text, setText] = useState(String(value ?? ''));
  const pending = useRef(0), sequence = useRef(0), savedValue = useRef(String(value ?? ''));
  savedValue.current = String(value ?? '');
  useEffect(() => { if (!pending.current) setText(String(value ?? '')); }, [value]);
  function change(next) {
    const request = ++sequence.current;
    pending.current = request;
    // Native text must update in the same event, without waiting for SQLite.
    // Older acknowledgements must not replace newer keystrokes.
    setText(next);
    Promise.resolve(onChangeText(next)).then(saved => {
      if (pending.current !== request) return;
      pending.current = 0;
      if (!saved) setText(savedValue.current);
    }).catch(() => {
      if (pending.current === request) { pending.current = 0; setText(savedValue.current); }
    });
  }
  return <Field {...props} value={text} onChangeText={change} />;
}
export function Choices({ options, value, onChange, multiple, label }) {
  const selected = item => multiple ? value.includes(item.value) : value === item.value;
  return <View style={{ marginBottom: 16, gap: 8 }}>{label && <T style={s.label}>{label}</T>}<View style={s.wrap}>{options.map((item, i) => <Button key={`${item.value}:${i}`} primary={selected(item)}
    accessibilityState={{ selected: selected(item) }} onPress={() => onChange(multiple ? selected(item) ? value.filter(v => v !== item.value) : [...value, item.value] : item.value)}>{item.label}</Button>)}</View></View>;
}
export const Toggle = ({ label, value, onChange }) => <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[s.row, { minHeight: 48, marginBottom: 12 }]}>
  <View style={{ width: 24, height: 24, borderWidth: 1, borderColor: color.muted, backgroundColor: value ? color.active : '#fff', alignItems: 'center', justifyContent: 'center' }}>{value && <Check size={18} color="#fff" />}</View><T style={{ flex: 1 }}>{label}</T></Pressable>;
export const Divider = () => <View style={s.divider} />;
export const Empty = ({ title, action, onPress }) => <View style={s.empty}><T style={[s.h2, s.muted, { alignSelf: 'stretch', textAlign: 'center' }]}>{title}</T>{action && <Button icon={Plus} onPress={onPress}>{action}</Button>}</View>;
export function Dialog({ title, children, onClose, onSave, saveLabel = 'Save', cancelLabel = 'Cancel', saveDanger = false, wide, footer, busy: externalBusy }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() { setBusy(true); setError(''); try { await onSave(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <Modal transparent animationType="fade" visible onRequestClose={() => !busy && onClose()}><View style={s.overlay}><View style={[s.dialog, wide && { maxWidth: 840 }]}>
    <View style={s.dialogHeader}><T style={[s.h2, { flex: 1 }]}>{title}</T><Button label="Close dialog" icon={X} disabled={busy || externalBusy} onPress={onClose} style={{ paddingHorizontal: 10 }} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.dialogBody}>{children}{error ? <T accessibilityRole="alert" style={s.error}>{error}</T> : null}</ScrollView>
    <View style={s.dialogFooter}>{footer || <><Button onPress={onClose} disabled={busy || externalBusy}>{cancelLabel}</Button>{onSave && <Button primary={!saveDanger} danger={saveDanger} style={saveDanger && { borderColor: color.red }} onPress={save} disabled={busy || externalBusy}>{busy ? 'Saving…' : saveLabel}</Button>}</>}</View>
  </View></View></Modal>;
}
export const Loading = ({ label = 'Opening POS…' }) => <View style={[s.app, { alignItems: 'center', justifyContent: 'center', gap: 18 }]}><ActivityIndicator color={color.ink} /><T>{label}</T></View>;
