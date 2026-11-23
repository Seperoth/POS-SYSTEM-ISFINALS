// Fit a separate neighborhood for each dish and weekday using observed days only.
export function trainSeasonalKnn(history, throughDay) {
  const observed = new Map();
  for (const { itemId, day, units } of history) {
    if (day > throughDay) continue;
    if (!observed.has(itemId)) observed.set(itemId, new Map());
    observed.get(itemId).set(day, units);
  }
  return ({ itemId, day }) => {
    const dish = observed.get(itemId);
    const lag = dish?.get(day - 7);
    if (day <= throughDay || lag === undefined) {
      throw new Error(`No observed seven-day lag for ${itemId} on forecast day ${day}.`);
    }
    const comparable = [];
    for (let pastDay = day - 7; pastDay > 7; pastDay -= 7) {
      const units = dish.get(pastDay);
      const priorUnits = dish.get(pastDay - 7);
      if (units !== undefined && priorUnits !== undefined) {
        comparable.push({ pastDay, units, distance: Math.abs(lag - priorUnits) });
      }
    }
    const closest = comparable.sort((a, b) => a.distance - b.distance || b.pastDay - a.pastDay).slice(0, 3);
    if (!closest.length) throw new Error(`No KNN training examples for ${itemId} on day ${day}.`);
    let weightedUnits = 0;
    let totalWeight = 0;
    for (const match of closest) {
      const weight = 1 / (1 + match.distance);
      weightedUnits += weight * match.units;
      totalWeight += weight;
    }
    return weightedUnits / totalWeight;
  };
}
