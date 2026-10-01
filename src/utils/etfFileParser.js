import * as XLSX from 'xlsx'
import { normalizeName, parseWeight } from './portfolioXray'

async function parseExcelRows(file, skipRows, nameField, weightField, countryField = null) {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { range: skipRows })

    return rows.map(row => {
        const rawName = row[nameField]
        const rawWeight = row[weightField]
        const rawCountry = countryField ? row[countryField] : 'GLOBAL'
        if (!rawName) return null

        return {
            Name: normalizeName(rawName),
            Weight: parseWeight(rawWeight),
            Country: rawCountry ? String(rawCountry).trim() : 'GLOBAL'
        }
    }).filter(Boolean)
}

export async function importVanguardHoldings(file) {
    const items = await parseExcelRows(file, 6, 'Holding name', '% of market value')
    return items.map(i => ({ ...i, Weight: i.Weight / 10000 }))
}

export async function importVanEckHoldings(file) {
    return await parseExcelRows(file, 2, 'Bezeichnung der Position', '% des Fondsvolumens')
}

export async function importXtrackersHoldings(file) {
    const items = await parseExcelRows(file, 3, 'Name', 'Weighting', 'Country')
    return items.map(i => ({ ...i, Weight: i.Weight / 1000000 }))
}

export async function importStoxx600Holdings(file) {
    const items = await parseExcelRows(file, 19, 'Name', 'Gewichtung', 'Land')
    return items.map(i => ({ ...i, Weight: i.Weight * 100 }))
}