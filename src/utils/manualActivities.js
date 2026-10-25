import { supabase } from '../supabaseClient'
import { fetchAllActivities } from '../api'

const num = (v) => parseFloat(String(v ?? 0).replace(',', '.')) || 0

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
        asset_isin: asset?.isin || null,
        asset_name: asset?.name || 'Unbekanntes Asset',
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

    // 2. Ins Supabase-Schema transformieren
    const rows = parqetActs.map(a => {
        const type = String(a.type || '').toLowerCase()
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
            parqet_id: String(a.id), // Eindeutige Parqet-ID für Upsert
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

    return { total: rows.length }
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

// Lädt jetzt ALLES direkt und ausschließlich aus Supabase
export async function fetchAllDbActivities() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('user_activities')
        .select('*')
        .order('datetime', { ascending: false })

    if (error) {
        console.warn('Fehler beim Laden aus user_activities:', error.message)
        return []
    }

    return (data || []).map(formatActivity)
}