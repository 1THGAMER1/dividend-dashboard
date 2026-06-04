/**
 * ISIN-Merge-Map
 *
 * Manche ETFs/Fonds bekommen bei einer Auflage-Änderung eine neue ISIN.
 * Damit historische Dividenden nicht unter einer alten ISIN separat auftauchen,
 * werden sie hier auf die aktuelle (kanonische) ISIN umgeschrieben.
 *
 * Format: { 'ALTE_ISIN': 'NEUE_ISIN', ... }
 *
 * Trage hier alle alten ISINs ein, die zur selben Position gehören.
 * Die Daten werden beim nächsten "Aktualisieren" automatisch zusammengeführt.
 *
 * Beispiel:
 *   'IE00B4L5Y983': 'IE000XTMP312',
 */
export const ISIN_MERGE_MAP = {
  // BlackRock-ISINs hier eintragen:

}

/**
 * Löst eine ISIN auf: gibt die kanonische (neueste) ISIN zurück.
 */
export function resolveIsin(isin) {
  return ISIN_MERGE_MAP[isin] ?? isin
}
