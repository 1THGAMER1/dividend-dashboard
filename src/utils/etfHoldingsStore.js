import { supabase } from '../supabaseClient.js'
import { normalizeName, isEtfName, getShares } from './portfolioXray'

// Schlüssel eines ETFs: ISIN (falls in den Parqet-Daten vorhanden), sonst normalisierter Name
export function etfKeyFor(holding) {
    const isin = String(holding?.isin || '').trim().toUpperCase()
    if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return isin
    return normalizeName(holding?.name || holding?.title || '').toUpperCase()
}

const toEntry = (r, status) => ({
    rows: r.rows,
    count: r.row_count,
    sum: Number(r.weight_sum),
    updatedAt: r.updated_at,
    status
})

// Nur die Keys laden, die im Depot vorkommen (spart Daten)
export async function loadCatalog(keys) {
    const { data, error } = await supabase
        .from('etf_catalog')
        .select('etf_key, rows, row_count, weight_sum, updated_at')
        .in('etf_key', keys)
    if (error) throw error
    return Object.fromEntries((data || []).map(r => [r.etf_key, toEntry(r, 'approved')]))
}

// Durch die Policy liefert Supabase automatisch nur die eigenen Uploads
export async function loadMySubmissions(keys) {
    const { data, error } = await supabase
        .from('etf_submissions')
        .select('etf_key, rows, row_count, weight_sum, updated_at, status')
        .in('etf_key', keys)
        .neq('status', 'rejected')
    if (error) throw error
    return Object.fromEntries((data || []).map(r => [r.etf_key, toEntry(r, r.status)]))
}

export async function submitHoldings({ etfKey, etfName, rows }) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Bitte einloggen, um Holdings zu speichern.')

    const res = await fetch('/.netlify/functions/etf-submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ etfKey, etfName, rows })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `Fehler ${res.status}`)
    return body
}
// Baut die Map { ETF-Name aus Parqet: Holdings } wie das Upload-Widget, aber ohne Upload
export async function loadEtfHoldingsMapFor(holdings) {
    const etfs = (holdings || []).filter(h => {
        const shares = getShares(h)
        if (shares !== undefined && shares <= 0) return false
        return isEtfName(h.name || h.title || '')
    })
    const keys = [...new Set(etfs.map(etfKeyFor).filter(Boolean))]
    if (!keys.length) return {}

    const [catalog, mine] = await Promise.all([loadCatalog(keys), loadMySubmissions(keys)])
    const map = {}
    for (const h of etfs) {
        const key = etfKeyFor(h)
        const entry = mine[key] || catalog[key]
        if (entry) map[h.name || h.title] = entry.rows
    }
    return map
}