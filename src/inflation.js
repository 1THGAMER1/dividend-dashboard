// Historische deutsche Inflationsraten (Destatis / Eurostat)
// Quelle: Statistisches Bundesamt, VPI-Jahreswerte
export const INFLATION_RATES = {
    2018: 0.019,
    2019: 0.014,
    2020: 0.005,
    2021: 0.031,
    2022: 0.079,
    2023: 0.059,
    2024: 0.022,
    2025: 0.023,
    2026: 0.020, // Schätzung (Bundesbank Prognose)
}

/**
 * Gibt die Inflationsrate für ein Jahr zurück.
 * Für unbekannte Jahre: Durchschnitt der bekannten Werte.
 */
export function inflationRate(year) {
    if (INFLATION_RATES[year] !== undefined) return INFLATION_RATES[year]
    const vals = Object.values(INFLATION_RATES)
    return vals.reduce((s, v) => s + v, 0) / vals.length
}

/**
 * Berechnet den inflationsbereinigten Realwert eines Betrags.
 * amount: nominaler Betrag im Zieljahr
 * fromYear: Basisjahr (z.B. erstes Dividendenjahr)
 * toYear: Jahr des Betrags
 *
 * Formel: realValue = amount / Π(1 + rate_y) für y von fromYear+1 bis toYear
 */
export function realValue(amount, fromYear, toYear) {
    if (toYear <= fromYear) return amount
    let factor = 1
    for (let y = fromYear + 1; y <= toYear; y++) {
        factor *= (1 + inflationRate(y))
    }
    return amount / factor
}

/**
 * Berechnet für ein monthly-Objekt { year: [12 Monatswerte] }
 * den inflationsbereinigten Gesamtbetrag.
 * Referenzjahr = frühstes Jahr in den Daten.
 */
export function calcRealTotal(monthly) {
    const years = Object.keys(monthly).map(Number).sort()
    if (!years.length) return 0
    const baseYear = years[0]
    let real = 0
    for (const year of years) {
        const months = monthly[year] || []
        const yearTotal = months.reduce((s, v) => s + (v || 0), 0)
        real += realValue(yearTotal, baseYear, year)
    }
    return real
}

/**
 * Gibt den kumulierten Kaufkraftverlust-Faktor zurück.
 * D.h.: Um denselben Wert wie in baseYear zu haben, brauchst du diesen Faktor × Betrag.
 * Nützlich für "benötigte Dividende um Inflation zu schlagen".
 */
export function cumulativeInflationFactor(baseYear, toYear) {
    if (toYear <= baseYear) return 1
    let factor = 1
    for (let y = baseYear + 1; y <= toYear; y++) {
        factor *= (1 + inflationRate(y))
    }
    return factor
}
