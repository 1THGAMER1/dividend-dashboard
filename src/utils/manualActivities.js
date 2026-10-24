import { supabase } from '../supabaseClient'

// Speichert eine Aktivität in Supabase
export async function createManualActivity({
                                               type,        // 'buy' | 'sell' | 'dividend'
                                               datetime,    // ISO String oder Date
                                               shares = 0,
                                               price = 0,
                                               amount,
                                               fee = 0,
                                               tax = 0,
                                               asset,       // { isin, name, assetType }
                                               currency = 'EUR'
                                           }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nicht eingeloggt')

    const net = Number(amount) - Number(fee) - Number(tax)

    const payload = {
        user_id: user.id,
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
    return formatToParqetActivity(data)
}

// Wandelt den DB-Eintrag in ein 100% kompatibles Parqet-Activity-Objekt um
export function formatToParqetActivity(dbRow) {
    if (!dbRow) return null
    return {
        id: `manual_${dbRow.id}`,
        type: dbRow.type,
        datetime: dbRow.datetime,
        shares: parseFloat(dbRow.shares || 0),
        price: parseFloat(dbRow.price || 0),
        amount: parseFloat(dbRow.amount || 0),
        amountNet: parseFloat(dbRow.amount_net || dbRow.amount || 0),
        fee: parseFloat(dbRow.fee || 0),
        tax: parseFloat(dbRow.tax || 0),
        currency: dbRow.currency || 'EUR',
        isManual: true, // Marker für später
        asset: {
            isin: dbRow.asset_isin,
            name: dbRow.asset_name,
            assetType: dbRow.asset_type
        }
    }
}

// Lädt alle manuellen Aktivitäten des Nutzers im Parqet-Format
export async function fetchManualActivities() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('user_activities')
        .select('*')
        .order('datetime', { ascending: false })

    if (error) {
        console.warn('Fehler beim Laden manueller Aktivitäten:', error.message)
        return []
    }

    return (data || []).map(formatToParqetActivity)
}