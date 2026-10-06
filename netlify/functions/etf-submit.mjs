import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const MAX_BODY_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 20000
const MAX_ETFS_PER_USER = 100
const MAX_SUBMISSIONS_PER_HOUR = 20

// Wie weit ein vertrauenswürdiger Upload von einem bestehenden Katalogstand abweichen darf
// (Gewichte in Prozentpunkten)
const LOOSE = { topN: 10, minOverlap: 6, maxWeightDiff: 2.0, maxSumDiff: 6, countRatio: 1.5 }

const UNSAFE = /[\u0000-\u001F\u007F<>{}\[\]\\`]/g
const cleanText = (v, max) => String(v ?? '').replace(UNSAFE, '').replace(/\s+/g, ' ').trim().slice(0, max)
const nameKey = (n) => String(n).toUpperCase().replace(/\s+/g, ' ').trim()
const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
})

// Serverseitige Prüfung: der Browser-Check allein wäre umgehbar
function validatePayload(p) {
    if (!p || typeof p !== 'object') return { error: 'Ungültige Anfrage.' }

    const etfKey = cleanText(p.etfKey, 120).toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9 &+.'-]{2,119}$/.test(etfKey)) return { error: 'Ungültige ETF-Kennung.' }

    const etfName = cleanText(p.etfName, 200)
    if (!etfName) return { error: 'ETF-Name fehlt.' }

    if (!Array.isArray(p.rows) || p.rows.length < 5 || p.rows.length > MAX_ROWS) {
        return { error: `Es sind 5 bis ${MAX_ROWS} Positionen erlaubt.` }
    }

    const rows = []
    for (const r of p.rows) {
        if (!r || typeof r !== 'object') return { error: 'Ungültige Zeile.' }
        const Name = cleanText(r.Name, 120)
        const Country = cleanText(r.Country, 60) || 'GLOBAL'
        const Weight = Number(r.Weight)
        if (!Name || !Number.isFinite(Weight) || Weight <= 0 || Weight > 100) {
            return { error: 'Ungültige Zeile (Name oder Gewicht).' }
        }
        rows.push({ Name, Country, Weight: +Weight.toFixed(6) })
    }

    const withLetters = rows.filter(r => /[A-Za-zÄÖÜäöü]/.test(r.Name)).length
    if (withLetters / rows.length < 0.8) return { error: 'Die Namen enthalten überwiegend Zahlen.' }

    const sum = rows.reduce((s, r) => s + r.Weight, 0)
    if (sum < 50 || sum > 105) return { error: `Die Gewichte summieren sich auf ${sum.toFixed(1)} %.` }

    return { etfKey, etfName, rows, sum }
}

// Gleichen sich zwei Dateien? (Zeilenzahl, Summe, Top-N-Namen samt Gewicht)
function similar(a, b, t) {
    if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return false
    const ratio = a.length / b.length
    if (ratio < 1 / t.countRatio || ratio > t.countRatio) return false

    const sum = (rows) => rows.reduce((s, r) => s + Number(r.Weight || 0), 0)
    if (Math.abs(sum(a) - sum(b)) > t.maxSumDiff) return false

    const weights = new Map(b.map(r => [nameKey(r.Name), Number(r.Weight)]))
    const top = [...a].sort((x, y) => y.Weight - x.Weight).slice(0, t.topN)
    let overlap = 0
    for (const r of top) {
        const w = weights.get(nameKey(r.Name))
        if (w !== undefined && Math.abs(w - r.Weight) <= t.maxWeightDiff) overlap++
    }
    return overlap >= t.minOverlap
}

async function publish(admin, rec, source) {
    const now = new Date().toISOString()
    const { error } = await admin.from('etf_catalog').upsert({
        etf_key: rec.etf_key,
        etf_name: rec.etf_name,
        rows: rec.rows,
        row_count: rec.row_count,
        weight_sum: rec.weight_sum,
        source,
        approved_at: now,
        updated_at: now
    }, { onConflict: 'etf_key' })
    if (error) throw error
}

export const handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST erlaubt.' })

        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        const missing = []
        if (!url) missing.push('SUPABASE_URL')
        if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
        if (missing.length) {
            console.error('[etf-submit] Fehlende Umgebungsvariablen:', missing.join(', '))
            return json(500, { error: `Server nicht konfiguriert (fehlt: ${missing.join(', ')}).` })
        }
        const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

        // 1. Login erzwingen
        const auth = event.headers.authorization || event.headers.Authorization || ''
        const token = auth.replace(/^Bearer\s+/i, '')
        if (!token) return json(401, { error: 'Bitte einloggen.' })

        const { data: userData, error: userErr } = await admin.auth.getUser(token)
        const user = userData?.user
        if (userErr || !user) return json(401, { error: 'Sitzung ungültig, bitte neu einloggen.' })
        if (user.is_anonymous || !user.email_confirmed_at) {
            return json(403, { error: 'Bitte bestätige zuerst deine E-Mail-Adresse.' })
        }

        // 2. Größe und Format
        const raw = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf8')
            : (event.body || '')
        if (!raw || Buffer.byteLength(raw) > MAX_BODY_BYTES) {
            return json(413, { error: 'Anfrage leer oder zu groß.' })
        }

        let payload
        try { payload = JSON.parse(raw) } catch { return json(400, { error: 'Ungültiges JSON.' }) }

        const v = validatePayload(payload)
        if (v.error) return json(400, { error: v.error })
        const { etfKey, etfName, rows, sum } = v

        // 3. Ratenbegrenzung und Kontingent
        const since = new Date(Date.now() - 3600 * 1000).toISOString()
        const { count: recent } = await admin.from('etf_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).gte('updated_at', since)
        if ((recent ?? 0) >= MAX_SUBMISSIONS_PER_HOUR) {
            return json(429, { error: 'Zu viele Uploads in kurzer Zeit. Bitte später erneut versuchen.' })
        }

        const { data: ownExisting } = await admin.from('etf_submissions')
            .select('id').eq('user_id', user.id).eq('etf_key', etfKey).maybeSingle()
        if (!ownExisting) {
            const { count: total } = await admin.from('etf_submissions')
                .select('id', { count: 'exact', head: true }).eq('user_id', user.id)
            if ((total ?? 0) >= MAX_ETFS_PER_USER) {
                return json(403, { error: `Maximal ${MAX_ETFS_PER_USER} ETFs pro Nutzer.` })
            }
        }

        // 4. In Quarantäne speichern (Uploads des Admins gelten sofort als freigegeben)
        const isAdmin = !!process.env.ADMIN_USER_ID && user.id === process.env.ADMIN_USER_ID
        const contentHash = createHash('sha256')
            .update(JSON.stringify([...rows].sort((x, y) => nameKey(x.Name).localeCompare(nameKey(y.Name)))))
            .digest('hex')

        const record = {
            user_id: user.id,
            etf_key: etfKey,
            etf_name: etfName,
            rows,
            row_count: rows.length,
            weight_sum: sum,
            content_hash: contentHash,
            status: isAdmin ? 'approved' : 'pending',
            updated_at: new Date().toISOString()
        }
        const { error: subErr } = await admin.from('etf_submissions')
            .upsert(record, { onConflict: 'user_id,etf_key' })
        if (subErr) throw subErr

        if (isAdmin) {
            await publish(admin, record, 'manual')
            return json(200, { ok: true, status: 'approved', message: 'Direkt in den Katalog übernommen.' })
        }

        // 5. Automatische Freigabe nur für Nutzer, die du als vertrauenswürdig eingetragen hast
        const { data: trusted } = await admin.from('trusted_contributors')
            .select('user_id').eq('user_id', user.id).maybeSingle()
        if (!trusted) {
            return json(200, {
                ok: true, status: 'pending',
                message: 'Gespeichert. Du nutzt die Datei sofort selbst, für alle anderen wird sie nach einer Prüfung freigegeben.'
            })
        }

        // Auch Vertrauenswürdige dürfen einen bestehenden Katalogstand nur begrenzt verändern
        const { data: existing } = await admin.from('etf_catalog')
            .select('rows').eq('etf_key', etfKey).maybeSingle()
        if (existing && !similar(rows, existing.rows, LOOSE)) {
            return json(200, {
                ok: true, status: 'pending',
                message: 'Gespeichert. Die Daten weichen deutlich vom freigegebenen Stand ab und werden manuell geprüft.'
            })
        }

        await publish(admin, record, 'trusted')
        await admin.from('etf_submissions')
            .update({ status: 'approved', updated_at: new Date().toISOString() })
            .eq('user_id', user.id).eq('etf_key', etfKey)

        return json(200, { ok: true, status: 'approved', message: 'Direkt in den Katalog übernommen.' })
    } catch (err) {
        console.error('[etf-submit]', err)
        return json(500, { error: 'Interner Fehler beim Speichern.' })
    }
}