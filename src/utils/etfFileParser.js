import * as XLSX from 'xlsx'
import { parseWeight } from './portfolioXray'

const SAFE_READ_OPTIONS = {
    type: 'array',
    sheetRows: 20000,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellNF: false,
    bookVBA: false
}

async function readWorkbook(file) {
    const data = await file.arrayBuffer()
    return XLSX.read(data, SAFE_READ_OPTIONS)
}

const NAME_SYNONYMS = ['holding name', 'bezeichnung der position', 'security description', 'security name', 'wertpapiere', 'name', 'emittent', 'issuer', 'holding', 'bezeichnung', 'wertpapier']
const WEIGHT_SYNONYMS = ['percent of fund', '% der assets', '% of market value', '% des fondsvolumens', '% of net assets', '% of fund', 'weighting', 'weight', 'gewichtung', 'gewicht', 'anteil']
const COUNTRY_SYNONYMS = ['trade country name', 'country', 'land', 'standort', 'location', 'sitz', 'region']

// Englische Ländernamen -> deutsche Ländernamen, wie getRegion sie kennt
const COUNTRY_EN_DE = {
    'UNITED STATES': 'Vereinigte Staaten', 'USA': 'Vereinigte Staaten', 'UNITED KINGDOM': 'Vereinigtes Königreich',
    'GERMANY': 'Deutschland', 'FRANCE': 'Frankreich', 'SWITZERLAND': 'Schweiz', 'NETHERLANDS': 'Niederlande',
    'SWEDEN': 'Schweden', 'ITALY': 'Italien', 'SPAIN': 'Spanien', 'IRELAND': 'Irland', 'BELGIUM': 'Belgien',
    'NORWAY': 'Norwegen', 'FINLAND': 'Finnland', 'AUSTRIA': 'Österreich', 'DENMARK': 'Dänemark',
    'CANADA': 'Kanada', 'MEXICO': 'Mexiko', 'HONG KONG': 'Hongkong', 'SINGAPORE': 'Singapur',
    'SOUTH KOREA': 'Südkorea', 'KOREA (SOUTH)': 'Südkorea', 'INDIA': 'Indien', 'AUSTRALIA': 'Australien',
    'NEW ZEALAND': 'Neuseeland', 'SOUTH AFRICA': 'Südafrika', 'SAUDI ARABIA': 'Saudi-Arabien',
    'LUXEMBOURG': 'Luxemburg', 'TURKEY': 'Türkei', 'GREECE': 'Griechenland', 'POLAND': 'Polen'
}

// Ländercodes (z. B. Vanguard-Spalte "Region") -> deutsche Ländernamen
const ISO_TO_DE = {
    US: 'Vereinigte Staaten', CA: 'Kanada', MX: 'Mexiko', BM: 'Bermuda', PR: 'Puerto Rico',
    GB: 'Vereinigtes Königreich', UK: 'Vereinigtes Königreich', DE: 'Deutschland', FR: 'Frankreich',
    CH: 'Schweiz', NL: 'Niederlande', SE: 'Schweden', IT: 'Italien', ES: 'Spanien', IE: 'Irland',
    BE: 'Belgien', NO: 'Norwegen', FI: 'Finnland', AT: 'Österreich', DK: 'Dänemark', PT: 'Portugal',
    PL: 'Polen', CZ: 'Tschechien', HU: 'Ungarn', GR: 'Griechenland', TR: 'Türkei', LU: 'Luxemburg',
    JE: 'Jersey', CY: 'Zypern', IS: 'Island',
    JP: 'Japan', TW: 'Taiwan', IN: 'Indien', CN: 'China', HK: 'Hongkong', SG: 'Singapur',
    KR: 'Südkorea', NZ: 'Neuseeland', SA: 'Saudi-Arabien', ID: 'Indonesien', MY: 'Malaysia',
    TH: 'Thailand', QA: 'Katar', PH: 'Philippinen', KW: 'Kuwait', IL: 'Israel', VN: 'Vietnam',
    AU: 'Australien', ZA: 'Südafrika', EG: 'Ägypten', MA: 'Marokko', KE: 'Kenia',
    BR: 'Brasilien', CL: 'Chile', AE: 'Vereinigte Arabische Emirate'
}
const clean = v => String(v ?? '').trim().toLowerCase()

function findColumn(headerCells, synonyms) {
    for (const s of synonyms) {
        const i = headerCells.findIndex(c => c === s)
        if (i !== -1) return i
    }
    for (const s of synonyms) {
        const i = headerCells.findIndex(c => c.startsWith(s))
        if (i !== -1) return i
    }
    return -1
}

function parseSheet(ws) {
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    for (let r = 0; r < Math.min(grid.length, 80); r++) {
        const cells = grid[r].map(clean)
        const nameCol = findColumn(cells, NAME_SYNONYMS)
        const weightCol = findColumn(cells, WEIGHT_SYNONYMS)
        if (nameCol === -1 || weightCol === -1) continue
        const countryCol = findColumn(cells, COUNTRY_SYNONYMS)

        const rows = []
        for (const row of grid.slice(r + 1)) {
            const name = String(row[nameCol] ?? '').trim()
            const weight = parseWeight(row[weightCol])
            if (!name || !(weight > 0) || /^(total|gesamt|summe|sum)\b/i.test(name)) continue
            let country = countryCol !== -1 ? String(row[countryCol] ?? '').trim() : ''
            country = COUNTRY_EN_DE[country.toUpperCase()] || ISO_TO_DE[country.toUpperCase()] || country || 'GLOBAL'
            rows.push({ Name: name, Weight: weight, Country: country })
        }
        if (rows.length) return rows
    }
    return []
}

// Einheit automatisch erkennen: Summe soll ~100 % ergeben (Bruchteile, %, Basispunkte, ...)
function scaleToPercent(rows) {
    const sum = rows.reduce((s, r) => s + r.Weight, 0)
    if (!(sum > 0)) return rows
    let factor = 1
    while (sum * factor * 10 <= 105) factor *= 10
    while (sum * factor > 105 && factor > 1e-9) factor /= 10
    return rows.map(r => ({ ...r, Weight: r.Weight * factor }))
}

export async function importEtfHoldings(file) {
    const workbook = await readWorkbook(file)
    for (const sheetName of workbook.SheetNames) {
        const rows = parseSheet(workbook.Sheets[sheetName])
        if (rows.length) return scaleToPercent(rows)
    }
    throw new Error('Keine Holdings-Tabelle gefunden: Spalten für Name und Gewichtung wurden nicht erkannt.')
}

// Alte Export-Namen bleiben bestehen, damit EtfUploadWidget.jsx unverändert funktioniert
export const importVanguardHoldings = importEtfHoldings
export const importVanEckHoldings = importEtfHoldings
export const importXtrackersHoldings = importEtfHoldings
export const importStoxx600Holdings = importEtfHoldings
export const importGenericEtfHoldings = importEtfHoldings

// Text oberhalb der Tabelle (Fondsname etc.), um zu prüfen, ob die Datei zum ETF passt
export async function readFileMeta(file) {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data, { type: 'array' })
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' })
    const lines = []
    for (let r = 0; r < Math.min(grid.length, 80); r++) {
        const cells = grid[r].map(clean)
        if (findColumn(cells, NAME_SYNONYMS) !== -1 && findColumn(cells, WEIGHT_SYNONYMS) !== -1) break
        lines.push(grid[r].map(c => String(c ?? '').trim()).filter(Boolean).join(' '))
    }
    return lines.join(' ')
}