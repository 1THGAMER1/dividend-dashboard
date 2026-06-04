/**
 * Baut automatisch eine Merge-Map aus den Aktivitäten:
 * Positionen mit identischem Namen (case-insensitive, getrimmt) werden
 * auf eine kanonische ISIN zusammengeführt (die neueste nach Datum).
 *
 * So werden ISIN-Wechsel (z.B. BlackRock 2024) automatisch erkannt –
 * ohne manuelle Einträge.
 */
export function buildIsinMergeMap(activities, names = {}) {
  // 1. Sammle alle ISINs und ihren jüngsten Aktivitäts-Zeitstempel
  const isinLastSeen = {}   // isin → Date (jüngste Aktivität)
  const isinName     = {}   // isin → normalisierteer Name

  for (const a of activities) {
    const isin = a.asset?.isin || a.asset?.symbol || 'unknown'
    if (isin === 'unknown') continue
    const d = new Date(a.datetime)
    if (!isinLastSeen[isin] || d > isinLastSeen[isin]) {
      isinLastSeen[isin] = d
    }
    // Name: aus names-Map oder aus der Aktivität selbst
    if (!isinName[isin]) {
      const raw = names[isin] || a.asset?.name || a.asset?.symbol || ''
      isinName[isin] = raw.trim().toLowerCase()
    }
  }

  // 2. Gruppiere ISINs nach normalisiertem Namen
  const nameToIsins = {}  // normalName → [isin, ...]
  for (const [isin, normalName] of Object.entries(isinName)) {
    if (!normalName) continue
    if (!nameToIsins[normalName]) nameToIsins[normalName] = []
    nameToIsins[normalName].push(isin)
  }

  // 3. Baue Merge-Map: alte ISINs → neueste ISIN
  const mergeMap = {}
  for (const isins of Object.values(nameToIsins)) {
    if (isins.length < 2) continue  // kein Merge nötig
    // Kanonische ISIN = die mit der jüngsten Aktivität
    const canonical = isins.sort(
      (a, b) => (isinLastSeen[b] || 0) - (isinLastSeen[a] || 0)
    )[0]
    for (const isin of isins) {
      if (isin !== canonical) mergeMap[isin] = canonical
    }
  }

  return mergeMap
}

/**
 * Erstellt eine resolve-Funktion für eine gegebene Merge-Map.
 */
export function makeResolver(mergeMap) {
  return (isin) => mergeMap[isin] ?? isin
}
