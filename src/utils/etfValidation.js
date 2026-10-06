import { normalizeName } from './portfolioXray'

const MAX_FILE_MB = 10
const STOP_TOKENS = new Set([
    'UCITS', 'ETF', 'USD', 'EUR', 'GBP', 'CHF', 'ACC', 'ACCUMULATING',
    'DIST', 'DIS', 'DISTRIBUTING', 'INCOME', 'FUND', 'INDEX'
])

// Vor dem Einlesen
export function checkFile(file) {
    const errors = []
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) errors.push('Nur .xlsx, .xls oder .csv werden unterstützt.')
    if (file.size === 0) errors.push('Die Datei ist leer.')
    if (file.size > MAX_FILE_MB * 1024 * 1024) errors.push(`Die Datei ist größer als ${MAX_FILE_MB} MB.`)
    return errors
}

function distinctiveTokens(etfName) {
    return normalizeName(etfName)
        .split(' ')
        .filter(t => t.length >= 3 && !STOP_TOKENS.has(t) && !/^\d+[A-Z]?$/.test(t))
}

// Nach dem Einlesen, vor dem Speichern
export function validateEtfUpload({ etfName, rows, sum, metaText, previousCount }) {
    const errors = []
    const warnings = []

    if (!rows.length) {
        errors.push('Keine Zeilen mit Name und Gewicht gefunden.')
        return { errors, warnings }
    }
    if (rows.length < 5) {
        errors.push(`Nur ${rows.length} Positionen gefunden – vermutlich nicht die vollständige Holdings-Tabelle.`)
    }

    const withLetters = rows.filter(r => /[A-Za-zÄÖÜäöü]/.test(r.Name)).length
    if (withLetters / rows.length < 0.8) {
        errors.push('Die Namensspalte enthält überwiegend Zahlen – vermutlich wurde die falsche Spalte erkannt.')
    }

    if (sum < 50 || sum > 105) {
        errors.push(`Die Gewichte summieren sich auf ${sum.toFixed(1)} % (erwartet: ca. 100 %).`)
    } else if (sum < 90 || sum > 101.5) {
        warnings.push(`Die Gewichte summieren sich auf ${sum.toFixed(1)} % statt ca. 100 %. Die Datei ist evtl. unvollständig.`)
    }

    const maxWeight = Math.max(...rows.map(r => r.Weight))
    if (maxWeight > 25) {
        warnings.push(`Die größte Einzelposition hat ${maxWeight.toFixed(1)} % – bitte prüfen.`)
    }

    // Gehört die Datei zu diesem ETF? (nur prüfbar, wenn die Datei oberhalb der Tabelle einen Fondsnamen enthält)
    const tokens = distinctiveTokens(etfName)
    if (metaText && tokens.length) {
        const meta = normalizeName(metaText)
        const hits = tokens.filter(t => meta.includes(t)).length
        if (hits / tokens.length < 0.5) {
            warnings.push(`Der Fondsname in der Datei passt nicht zu „${etfName}“ – möglicherweise ist es die falsche Datei.`)
        }
    }

    if (previousCount && rows.length < previousCount * 0.5) {
        warnings.push(`Die Datei hat nur ${rows.length} Positionen, der gespeicherte Stand hat ${previousCount}.`)
    }

    return { errors, warnings }
}