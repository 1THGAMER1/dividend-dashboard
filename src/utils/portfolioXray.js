import { lookupCountry } from './countryOverrides.js'

export function normalizeName(name) {
    if (!name) return ''
    return String(name)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')        // Akzente: NESTLÉ → NESTLE
        .toUpperCase()
        .replace(/\([^)]*\)/g, ' ')                               // Klammern samt Inhalt: (ACC), (THE), (USD)
        .replace(/['"`´’]/g, '')
        .replace(/\s*&\s*/g, ' AND ')                             // JOHNSON & JOHNSON = JOHNSON AND JOHNSON
        .replace(/\.(COM|NET|ORG|IO|AI)\b/g, ' ')                 // AMAZON.COM → AMAZON
        .replace(/[.,;:]/g, '')                                   // INC. → INC, S.A. → SA, N.V. → NV
        .replace(/\bCLASS\s+[A-Z]\b/g, '')
        .replace(/\bCL\s+[A-Z]\b/g, '')
        .replace(/\bSERIES\s+[A-Z]\b/g, '')
        .replace(/\b(THE|SE|AG|KGAA|B|A\/S|SA|SAS|NV|PLC|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|GMBH|SPA|AB|ASA|OYJ|ADR|REG|REGISTERED|SHS|ORD|NEW|HOLDINGS|HOLDING)\b/g, '')
        .replace(/[-/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export function parseWeight(val) {
    if (typeof val === 'number') return val
    if (!val) return 0
    let s = String(val).trim().replace('%', '').replace(/\s/g, '')
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(',', '.')
    return parseFloat(s) || 0
}

export function isEtfName(name = '') {
    return /\betf\b|ucits|msci|stoxx|ftse|ishares|xtrackers|vanguard|vaneck|amundi|spdr/.test(String(name).toLowerCase())
}

// --- Flexible Spaltenerkennung für Holdings-Zeilen ---
const pick = (row, candidates) => {
    const keys = Object.keys(row || {})
    for (const c of candidates) {
        const k = keys.find(k => k.trim().toLowerCase() === c)
        if (k !== undefined && row[k] !== undefined && row[k] !== '') return row[k]
    }
    return undefined
}
const NAME_KEYS = ['name', 'emittent', 'holding', 'bezeichnung', 'security name', 'issuer']
const WEIGHT_KEYS = ['weight', 'weight (%)', 'gewichtung', 'gewichtung (%)', 'gewicht', 'anteil', '% of net assets', '% of fund']
const COUNTRY_KEYS = ['country', 'land', 'standort', 'location', 'market']

// Gibt bereinigte Zeilen { Name, Country, Weight } zurück (nur Zeilen mit Name und Gewicht > 0)
export function extractHoldingRows(rows) {
    if (!Array.isArray(rows)) return []
    const out = []
    for (const row of rows) {
        const name = pick(row, NAME_KEYS)
        const weight = parseWeight(pick(row, WEIGHT_KEYS))
        if (!name || !(weight > 0)) continue
        out.push({ Name: String(name), Country: pick(row, COUNTRY_KEYS) || 'GLOBAL', Weight: weight })
    }
    return out
}

export function getRegion(country) {
    if (!country) return 'Unbekannt'
    const c = String(country).toUpperCase()
        .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')

    if (['VEREINIGTE STAATEN', 'KANADA', 'MEXIKO', 'BERMUDA', 'PUERTO RICO'].includes(c)) return 'Nordamerika'
    if (['VEREINIGTES KOENIGREICH', 'UNITED KINGDOM', 'DAENEMARK', 'DENMARK', 'DEUTSCHLAND', 'FRANKREICH', 'SCHWEIZ', 'NIEDERLANDE', 'SCHWEDEN', 'ITALIEN', 'SPANIEN', 'IRLAND', 'BELGIEN', 'NORWEGEN', 'FINNLAND', 'OESTERREICH', 'PORTUGAL', 'POLEN', 'TSCHECHIEN', 'UNGARN', 'GRIECHENLAND', 'TUERKEI', 'LUXEMBURG', 'JERSEY', 'ZYPERN', 'ISLAND'].some(x => c.includes(x))) return 'Europa'
    if (['JAPAN', 'TAIWAN', 'INDIEN', 'CHINA', 'HONGKONG', 'SINGAPUR', 'SUEDKOREA', 'NEUSEELAND', 'SAUDI-ARABIEN', 'INDONESIEN', 'MALAYSIA', 'THAILAND', 'KATAR', 'PHILIPPINEN', 'KUWAIT', 'ISRAEL', 'VIETNAM'].some(x => c.includes(x))) return 'Asien'
    if (c === 'AUSTRALIEN') return 'Ozeanien und Australien'
    if (['SUEDAFRIKA', 'AEGYPTEN', 'MAROKKO', 'KENIA'].includes(c)) return 'Afrika'
    if (c === 'ROHSTOFFE') return 'Rohstoffe'
    if (c === 'BARGELD') return 'Bargeld'
    if (c === 'KRYPTO') return 'Krypto'
    if (c === 'GLOBAL') return 'Global'

    return 'Sonstige'
}

export function computePortfolioXRay(etfHoldingsMap, userHoldings, currentValue) {
    if (!currentValue || currentValue <= 0 || !userHoldings) return []
    const aggregated = {}
    const add = (name, country, weight) => {
        if (!name || !(weight > 0)) return
        if (!aggregated[name]) {
            aggregated[name] = { Name: name, Country: country, Weight: 0 }
        } else if (aggregated[name].Country === 'GLOBAL' && country && country !== 'GLOBAL') {
            // Ein späterer ETF kennt das Land: übernehmen
            aggregated[name].Country = country
        }
        aggregated[name].Weight += weight
    }

    const positions = userHoldings
        .filter(item => {
            const shares = item.shares ?? item.quantity ?? item.amount
            return shares === undefined || shares > 0
        })
        .map(item => {
            const rawName = item.name || item.title || ''
            return { rawName, key: normalizeName(rawName), weight: (item.value || 0) / currentValue }
        })
        .filter(p => p.key && p.weight > 0)

    const etfEntries = Object.entries(etfHoldingsMap || {})
        .map(([n, holdings]) => ({ key: normalizeName(n), holdings }))
        .filter(e => e.key)

    for (const p of positions) {
        const etf = etfEntries.find(e => e.key === p.key)
            || etfEntries.find(e => p.key.includes(e.key) || e.key.includes(p.key))
        let covered = 0

        if (etf) {
            for (const row of extractHoldingRows(etf.holdings)) {
                add(normalizeName(row.Name), row.Country, (row.Weight / 100) * p.weight * 100)
                covered += row.Weight
            }
        }

        if (covered > 0) {
            // Rest, falls die Datei nicht 100 % abdeckt (z. B. nur Top-Positionen)
            if (covered < 99.5) add(p.key + ' (REST)', 'GLOBAL', ((100 - covered) / 100) * p.weight * 100)
            continue
        }

        // Nicht aufgeschlüsselt: sichtbar lassen, statt stumm zu verlieren
        const looksLikeEtf = isEtfName(p.rawName)
        const isCrypto = ['BITCOIN', 'SOLANA', 'DOGECOIN', 'ETH'].some(c => p.key.includes(c))
        add(looksLikeEtf ? p.key + ' (NICHT AUFGESCHLÜSSELT)' : p.key,
            isCrypto ? 'Krypto' : 'GLOBAL',
            p.weight * 100)
    }

    for (const entry of Object.values(aggregated)) {
        if (String(entry.Country).toUpperCase() === 'GLOBAL') {
            const c = lookupCountry(entry.Name)
            if (c) entry.Country = c
        }
    }

    return Object.values(aggregated).sort((a, b) => b.Weight - a.Weight)
}