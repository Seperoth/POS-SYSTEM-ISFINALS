import React from 'react';
import { View, Pressable } from 'react-native';
import { MENU_CATEGORIES } from '../domain/menu.js';
import { T } from './components';
import { s, color, categoryColors } from './theme';

export function CategoryChoices({ value, onChange, allLabel }) {
  const options = allLabel ? [allLabel, ...MENU_CATEGORIES] : MENU_CATEGORIES;
  return <View style={s.wrap}>{options.map(category => {
    const selected = value === category, tone = categoryColors[category];
    return <Pressable key={category} accessibilityRole="button" accessibilityLabel={category} accessibilityState={{ selected }} onPress={() => onChange(category)}
      style={({ pressed }) => [s.button, { borderColor: tone?.solid || color.active, borderWidth: selected ? 2 : 1, backgroundColor: selected ? tone?.solid || color.active : tone?.tint || '#fff', opacity: pressed ? 0.7 : 1 }]}>
      <T style={[s.buttonText, { color: selected ? '#fff' : tone?.solid || color.ink }]}>{category}</T>
    </Pressable>;
  })}</View>;
}
