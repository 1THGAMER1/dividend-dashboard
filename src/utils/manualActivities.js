import { supabase } from '../supabaseClient'
import { fetchAllActivities, getKnownAssets, invalidateKnownAssets } from '../api'
import { normalizeName, sameCompany } from './portfolioXray'

const num = (v) => parseFloat(String(v ?? 0).replace(',', '.')) || 0
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/
const isIsin = (v) => ISIN_RE.test(String(v || '').trim().toUpperCase())
const isCryptoType = (t) => /crypto|krypto|coin|token/i.test(String(t || ''))

// Bekannte Papiere mit echter ISIN, je ISIN einmal
const toIndex = (list) => {
    const byIsin = new Map()
    ;(list || []).forEach(a => {
        const isin = String(a.isin || '').trim().toUpperCase()
        if (isIsin(isin) && a.name && !byIsin.has(isin)) {
            byIsin.set(isin, { isin, name: a.name, key: normalizeName(a.name) })
        }
    })
    return [...byIsin.values()]
}

// Genau ein Treffer = sicher. Mehrere (z. B. Aktiengattungen) oder keiner = nicht zusammenführen.
function matchKnownAsset(index, name) {
    const key = normalizeName(name)
    if (!key) return null
    const exact = index.filter(a => a.key === key)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) return null
    const loose = index.filter(a => Math.min(a.key.length, key.length) >= 8 && sameCompany(key, a.key))
    return loose.length === 1 ? loose[0] : null
}

// Beim Anlegen/Ändern: Papier ohne ISIN auf die ISIN eines bekannten Papiers abbilden
async function resolveAssetIdentity(asset) {
    const name = asset?.name || 'Unbekanntes Asset'
    const isin = asset?.isin || null
    if (isIsin(isin) || isCryptoType(asset?.assetType)) return { isin, name }
    const hit = matchKnownAsset(toIndex(await getKnownAssets()), name)
    return hit ? { isin: hit.isin, name: hit.name } : { isin, name }
}

// Alle Zeilen seitenweise laden (Supabase liefert pro Abfrage höchstens 1000)
async function fetchAllRows() {
    const PAGE = 1000
    let all = []
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('user_activities')
            .select('*')
            .order('datetime', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1)
        if (error) { console.warn('Fehler beim Laden aus user_activities:', error.message); break }
        all = all.concat(data || [])
        if (!data || data.length < PAGE) break
    }
    return all
}

// Führt manuell erfasste Papiere (Yahoo-Kürzel wie AAPL) mit denselben Papieren aus Parqet (echte ISIN) zusammen
export async function unifyManualAssets() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { merged: 0 }

    const rows = await fetchAllRows()
    const index = toIndex(rows.map(r => ({ isin: r.asset_isin, name: r.asset_name })))
    if (!index.length) return { merged: 0 }

    // Manuelle Zeilen ohne ISIN, gruppiert nach Kürzel und Name
    const groups = new Map()
    rows
        .filter(r => !r.parqet_id && !isIsin(r.asset_isin) && !isCryptoType(r.asset_type))
        .forEach(r => {
            const k = `${r.asset_isin || ''}|${r.asset_name || ''}`
            if (!groups.has(k)) groups.set(k, [])
            groups.get(k).push(r)
        })

    let merged = 0
    for (const list of groups.values()) {
        const hit = matchKnownAsset(index, list[0].asset_name)
        if (!hit) continue
        const ids = list.map(r => r.id)
        for (let i = 0; i < ids.length; i += 100) {
            const { error } = await supabase
                .from('user_activities')
                .update({ asset_isin: hit.isin, asset_name: hit.name })
                .in('id', ids.slice(i, i + 100))
                .eq('user_id', user.id)
            if (!error) merged += Math.min(100, ids.length - i)
        }
    }
    invalidateKnownAssets()
    return { merged }
}
// Speichert EINE manuelle Aktivität in Supabase
export async function createManualActivity({
                                               type,
                                               datetime,
                                               shares = 0,
                                               price = 0,
                                               amount,
                                               fee = 0,
                                               tax = 0,
                                               asset,
                                               currency = 'EUR'
                                           }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nicht eingeloggt')

    const net = Number(amount) - Number(fee) - Number(tax)
    const identity = await resolveAssetIdentity(asset)

    const payload = {
        user_id: user.id,
        parqet_id: null, // rein manuell
        type,
        datetime: new Date(datetime).toISOString(),
        shares: Number(shares) || 0,
        price: Number(price) || 0,
        amount: Number(amount),
        amount_net: net,
        fee: Number(fee) || 0,
        tax: Number(tax) || 0,
        currency,
        asset_isin: identity.isin,
        asset_name: identity.name,
        asset_type: asset?.assetType || 'Security'
    }

    const { data, error } = await supabase
        .from('user_activities')
        .insert([payload])
        .select()
        .single()

    if (error) throw error
    return formatActivity(data)
}

// Synchronisiert ALLE Parqet-Aktivitäten direkt in die Supabase-Tabelle
export async function syncParqetToSupabase(namesMap = {}) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nicht eingeloggt')

    // 1. Alle Aktivitäten von Parqet abrufen
    const parqetActs = await fetchAllActivities()
    if (!parqetActs || parqetActs.length === 0) return { inserted: 0 }

    // Erlaubte Typen
    const KNOWN_TYPES = ['buy', 'sell', 'dividend', 'interest', 'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fees_taxes']

    // 2. Ins Supabase-Schema transformieren
    const rows = parqetActs.map(a => {
        let type = String(a.type || '').toLowerCase()
        if (!KNOWN_TYPES.includes(type)) {
            // Unbekannte Typen sicherheitshalber auf 'fees_taxes' oder passendes Fallback lenken
            if (type.includes('tax') || type.includes('fee')) type = 'fees_taxes'
            else if (type.includes('transfer')) type = 'transfer_in'
            else type = 'fees_taxes'
        }

        const key = a.asset?.isin || a.asset?.symbol || a.asset?.holding_id || a.holdingId || ''
        const name = namesMap[String(key).toUpperCase()]
            || a.asset?.name
            || key
            || (a.holdingAssetType === 'cash' ? 'Verrechnungskonto' : 'Wertpapier')

        const shares = num(a.shares ?? a.quantity)
        const fee = num(a.fee)
        const tax = num(a.tax)
        const amount = ['dividend', 'interest'].includes(type)
            ? num(a.amountNet ?? a.amount)
            : (num(a.amount ?? a.total ?? a.amountNet) || (type === 'fees_taxes' ? fee + tax : 0))
        const price = num(a.price) || (shares > 0 ? num(a.amount) / shares : 0)
        const amountNet = num(a.amountNet ?? (amount - fee - tax))

        return {
            user_id: user.id,
            parqet_id: String(a.id),
            type,
            datetime: new Date(a.datetime).toISOString(),
            shares,
            price,
            amount,
            amount_net: amountNet,
            fee,
            tax,
            currency: a.currency || 'EUR',
            asset_isin: String(key || ''),
            asset_name: name,
            asset_type: a.asset?.assetType || a.holdingAssetType || 'Security',
        }
    })

    // 3. In 100er-Häppchen per UPSERT nach Supabase schreiben (keine Duplikate!)
    const CHUNK_SIZE = 100
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase
            .from('user_activities')
            .upsert(chunk, { onConflict: 'user_id,parqet_id' })

        if (error) {
            console.error('Fehler beim Parqet-Sync nach Supabase:', error)
            throw error
        }
    }

    invalidateKnownAssets()
    const { merged } = await unifyManualAssets()
    return { total: rows.length, merged }
}

// Formatiert eine DB-Zeile für das UI
export function formatActivity(row) {
    if (!row) return null
    return {
        id: row.id,
        parqetId: row.parqet_id,
        isManual: !row.parqet_id, // wenn keine parqet_id, dann manuell erfasst
        type: row.type,
        date: row.datetime,
        datetime: row.datetime,
        shares: parseFloat(row.shares || 0),
        price: parseFloat(row.price || 0),
        amount: parseFloat(row.amount || 0),
        amountNet: parseFloat(row.amount_net || row.amount || 0),
        fee: parseFloat(row.fee || 0),
        tax: parseFloat(row.tax || 0),
        gross: parseFloat(row.amount || 0),
        name: row.asset_name,
        isin: row.asset_isin,
        assetType: row.asset_type,
        currency: row.currency || 'EUR'
    }
}
// Lädt ALLES aus Supabase, seitenweise (Supabase liefert pro Abfrage höchstens 1000 Zeilen)
export async function fetchAllDbActivities() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const PAGE = 1000
    let all = []
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('user_activities')
            .select('*')
            .order('datetime', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1)

        if (error) {
            console.warn('Fehler beim Laden aus user_activities:', error.message)
            break
        }
        all = all.concat(data || [])
        if (!data || data.length < PAGE) break
    }
    return (await fetchAllRows()).map(formatActivity)
}

// Aktualisiert eine bestehende manuelle Aktivität
export async function updateManualActivity(id, {
    type,
    datetime,
    shares = 0,
    price = 0,
    amount,
    fee = 0,
    tax = 0,
    asset,
    currency = 'EUR'
}) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nicht eingeloggt')

    const net = Number(amount) - Number(fee) - Number(tax)

    const payload = {
        type,
        datetime: new Date(datetime).toISOString(),
        shares: Number(shares) || 0,
        price: Number(price) || 0,
        amount: Number(amount),
        amount_net: net,
        fee: Number(fee) || 0,
        tax: Number(tax) || 0,
        currency,
        asset_isin: asset?.isin || null,
        asset_name: asset?.name || 'Unbekanntes Asset',
        asset_type: asset?.assetType || 'Security'
    }

    const { data, error } = await supabase
        .from('user_activities')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id) // Sicherheitscheck RLS
        .select()
        .single()

    if (error) throw error
    return formatActivity(data)
}

// Löscht eine manuelle Aktivität
export async function deleteManualActivity(id) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nicht eingeloggt')

    const { error } = await supabase
        .from('user_activities')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

    if (error) throw error
    return true
}

// Bringt eine DB-Aktivität in die Parqet-Form, damit dataUtils (groupByHolding, buildForecast, …) sie versteht
export function toParqetShape(a) {
    const t = String(a.type || '').trim().toLowerCase()
    const type = ['dividende', 'dividenden'].includes(t) ? 'dividend' : t
    const key = a.isin || a.name || 'unknown'
    const income = ['dividend', 'interest'].includes(type)
    const net = a.amountNet ?? a.amount
    // Beim Sync steht bei Dividenden der Nettobetrag in amount: Brutto = Netto + Steuer
    const gross = income ? Math.max(Number(a.gross) || 0, +(net + (a.tax || 0)).toFixed(2)) : a.amount
    return {
        id: a.id,
        type,
        datetime: a.datetime || a.date,
        shares: a.shares,
        price: a.price,
        amount: gross,
        amountNet: net,
        fee: a.fee,
        tax: a.tax,
        currency: a.currency,
        holdingAssetType: a.assetType,
        asset: { isin: key, symbol: key, name: a.name },
    }
}

// Repariert Aktivitäten, bei denen der Name fälschlicherweise = ISIN ist
export async function repairActivityNames(namesMap = {}) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nicht eingeloggt')

    const { data: rows, error: fetchErr } = await supabase
        .from('user_activities')
        .select('id, asset_isin, asset_name')
        .eq('user_id', user.id)

    if (fetchErr) throw fetchErr

    let fixedCount = 0

    for (const row of rows || []) {
        const isin = row.asset_isin
        const currentName = row.asset_name

        // Nur reparieren, wenn der gespeicherte Name = ISIN ist (also fehlerhaft)
        if (isin && currentName && isin.toUpperCase() === currentName.toUpperCase()) {
            const correctName = namesMap[isin.toUpperCase()]
            if (correctName && correctName.toUpperCase() !== isin.toUpperCase()) {
                const { error: updateErr } = await supabase
                    .from('user_activities')
                    .update({ asset_name: correctName })
                    .eq('id', row.id)
                    .eq('user_id', user.id)

                if (!updateErr) fixedCount++
            }
        }
    }

    return { fixedCount, total: rows?.length || 0 }
}