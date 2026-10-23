// Netlify Scheduled Function: Wöchentlicher Portfolio-Newsletter mit automatischem Snapshot-Fallback
const RESEND_API_KEY = process.env.RESEND_API_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL

const PARQET_TOKEN_URL = 'https://connect.parqet.com/oauth2/token'
const PARQET_API_BASE = 'https://connect.parqet.com'

const fmtEur = (n) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)

const fmtPct = (n) =>
    `${(Number(n) || 0) >= 0 ? '+' : ''}${(Number(n) || 0).toFixed(2).replace('.', ',')} %`

// ── 1. PARQET LIVE ABRUF ──────────────────────────────────────────────────────
async function getParqetAccessToken(clientId, refreshToken) {
    const res = await fetch(PARQET_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        }),
    })
    if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Token-Refresh fehlgeschlagen (${res.status}): ${txt}`)
    }
    return res.json()
}

async function fetchParqetWeeklyData(accessToken) {
    const portRes = await fetch(`${PARQET_API_BASE}/portfolios`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!portRes.ok) throw new Error('Portfolios konnten nicht geladen werden')
    const portData = await portRes.json()
    const portfolio = Array.isArray(portData) ? portData[0] : (portData.portfolios?.[0] || portData.data?.[0])
    if (!portfolio?.id) throw new Error('Kein Portfolio gefunden')

    // 7-Tage Performance
    const perfRes = await fetch(`${PARQET_API_BASE}/performance`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            portfolioIds: [portfolio.id],
            interval: { type: 'relative', value: '1w' },
        }),
    })
    if (!perfRes.ok) throw new Error('Performance konnte nicht geladen werden')
    const perfData = await perfRes.json()

    // Kürzliche Dividenden
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const actsRes = await fetch(
        `${PARQET_API_BASE}/portfolios/${portfolio.id}/activities?types=dividend&from=${encodeURIComponent(thirtyDaysAgo)}&limit=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const actsData = actsRes.ok ? await actsRes.json() : { activities: [] }

    return { portfolio, perfData, activities: actsData.activities || [] }
}

// ── 2. FALLBACK: DATEN AUS SUPABASE SNAPSHOT HOLEN ────────────────────────────
async function fetchSupabaseSnapshotData(userId) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/shared_portfolios?user_id=eq.${userId}&select=portfolio_data,updated_at&order=updated_at.desc&limit=1`,
        {
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
        }
    )
    if (!res.ok) return null
    const data = await res.json()
    const row = data?.[0]
    if (!row?.portfolio_data) return null

    const pData = row.portfolio_data
    const currentValue = pData.currentValue || 0
    const holdings = pData.holdings || []

    // Aus Snapshot simulieren
    const validHoldings = holdings
        .filter(h => (h.value || 0) > 0)
        .map(h => ({
            asset: { name: h.name || h.isin },
            position: { currentValue: h.value },
            performance: {
                unrealizedGains: {
                    inInterval: {
                        gainNet: (h.value || 0) - (h.costValue || 0),
                        returnNet: (h.costValue > 0) ? (((h.value - h.costValue) / h.costValue) * 100) : 0,
                    }
                }
            }
        }))

    return {
        isFallback: true,
        snapshotDate: new Date(row.updated_at).toLocaleDateString('de-DE'),
        currentValue,
        holdings: validHoldings,
        weekGain: validHoldings.reduce((s, h) => s + (h.performance.unrealizedGains.inInterval.gainNet || 0), 0),
        weekReturn: null,
        activities: [],
    }
}

// ── 3. HTML-TEMPLATE ─────────────────────────────────────────────────────────
function buildNewsletterHtml({ userEmail, currentValue, weekGain, weekReturn, topHoldings, recentDividends, isFallback, snapshotDate }) {
    const isPos = weekGain >= 0
    const gainColor = isPos ? '#22c55e' : '#ef4444'

    const validHoldings = (topHoldings || [])
        .filter(h => (h.position?.currentValue || 0) > 0)
        .map(h => {
            const val = Number(h.position?.currentValue || 0)
            const gain = Number(h.performance?.unrealizedGains?.inInterval?.gainGross || h.performance?.unrealizedGains?.inInterval?.gainNet || 0)
            const ret = Number(h.performance?.unrealizedGains?.inInterval?.returnGross || h.performance?.unrealizedGains?.inInterval?.returnNet || 0)
            return { name: h.asset?.name || h.asset?.isin || 'Asset', val, gain, ret }
        })

    const winners = validHoldings.filter(h => h.gain > 0).sort((a, b) => b.ret - a.ret).slice(0, 3)
    const losers = validHoldings.filter(h => h.gain < 0).sort((a, b) => a.ret - b.ret).slice(0, 3)

    const renderTableRows = (list, isWinner) => list.map(h => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #1e2a3a; color: #f1f5f9; font-size: 13px; font-weight: 600;">${h.name}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #1e2a3a; text-align: right; color: #94a3b8; font-size: 12px;">${fmtEur(h.val)}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #1e2a3a; text-align: right; color: ${isWinner ? '#22c55e' : '#ef4444'}; font-size: 13px; font-weight: 700;">
        ${h.gain >= 0 ? '+' : ''}${fmtEur(h.gain)} ${h.ret ? `(${fmtPct(h.ret)})` : ''}
      </td>
    </tr>
  `).join('')

    const divRows = (recentDividends || []).slice(0, 4).map(a => `
    <li style="margin-bottom: 6px; color: #94a3b8; font-size: 12px;">
      <strong style="color: #f1f5f9;">${a.resolvedName || a.asset?.name || 'Ausschüttung'}:</strong> 
      <span style="color: #22c55e; font-weight: 600;">+${fmtEur(a.amountNet || a.amount || 0)}</span>
      <span style="color: #64748b;">(${new Date(a.datetime).toLocaleDateString('de-DE')})</span>
    </li>
  `).join('')

    return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="margin: 0; padding: 20px 10px; background-color: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div style="max-width: 560px; margin: 0 auto; background: #161b27; border: 1px solid #1e2a3a; border-radius: 16px; overflow: hidden;">
      
      <!-- HEADER -->
      <div style="padding: 24px; background: #10141f; border-bottom: 1px solid #1e2a3a; text-align: center;">
        <h1 style="margin: 0; font-size: 20px; color: #f1f5f9; font-weight: 700;">📊 Dein Wochen-Rückblick</h1>
        <p style="margin: 6px 0 0; color: #64748b; font-size: 12px;">
          ${isFallback ? `Snapshot-Stand: ${snapshotDate} (Parqet-Verbindung erneuern)` : 'Live Parqet-Performance der letzten 7 Tage'}
        </p>
      </div>

      <!-- HAUPT-KPI -->
      <div style="padding: 24px; text-align: center; border-bottom: 1px solid #1e2a3a;">
        <div style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Portfoliowert</div>
        <div style="font-size: 32px; font-weight: 800; color: #f1f5f9; margin: 6px 0;">${fmtEur(currentValue)}</div>
        <div style="display: inline-block; padding: 4px 12px; border-radius: 20px; background: ${isPos ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${gainColor}; font-weight: 700; font-size: 13px;">
          ${isPos ? '▲' : '▼'} ${isPos ? '+' : ''}${fmtEur(weekGain)} ${weekReturn != null ? `(${fmtPct(weekReturn)}) diese Woche` : 'Gesamtgewinn'}
        </div>
      </div>

      ${winners.length > 0 ? `
      <div style="padding: 20px 24px; border-bottom: 1px solid #1e2a3a;">
        <h3 style="margin: 0 0 10px; font-size: 13px; color: #22c55e; text-transform: uppercase; letter-spacing: 0.4px;">🏆 Top-Gewinner</h3>
        <table style="width: 100%; border-collapse: collapse;">${renderTableRows(winners, true)}</table>
      </div>` : ''}

      ${losers.length > 0 ? `
      <div style="padding: 20px 24px; border-bottom: 1px solid #1e2a3a;">
        <h3 style="margin: 0 0 10px; font-size: 13px; color: #ef4444; text-transform: uppercase; letter-spacing: 0.4px;">📉 Schwächste Werte</h3>
        <table style="width: 100%; border-collapse: collapse;">${renderTableRows(losers, false)}</table>
      </div>` : ''}

      ${recentDividends && recentDividends.length > 0 ? `
      <div style="padding: 20px 24px; border-bottom: 1px solid #1e2a3a;">
        <h3 style="margin: 0 0 12px; font-size: 13px; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.4px;">💰 Dividendeneingänge</h3>
        <ul style="margin: 0; padding-left: 18px;">${divRows}</ul>
      </div>` : ''}

      <!-- FOOTER -->
      <div style="padding: 24px 20px; text-align: center; background: #0c1019; color: #64748b; font-size: 11px; line-height: 1.6;">
        <p style="margin: 0 0 10px;">Du erhältst diese E-Mail, weil du den wöchentlichen Report auf <strong>DividendDashboard</strong> aktiviert hast.</p>
        <p style="margin: 0;"><a href="https://dividenddashboard.netlify.app/#profile" style="color: #38bdf8; text-decoration: underline; font-weight: 600;">Hier Einstellungen anpassen oder abmelden</a></p>
      </div>

    </div>
  </body>
  </html>`
}

// ── 4. RESEND VERSAND ────────────────────────────────────────────────────────
async function sendEmailViaResend({ to, subject, html }) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'Portfolio Dashboard <onboarding@resend.dev>',
            to: ['carminebe22@gmail.com'],
            subject,
            html,
        }),
    })
    if (!res.ok) {
        const err = await res.text().catch(() => '')
        throw new Error(`Resend API Fehler (${res.status}): ${err}`)
    }
    return res.json()
}

// ── 5. HAUPT-HANDLER ─────────────────────────────────────────────────────────
export const handler = async function(event, context) {
    if (!RESEND_API_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Umgebungsvariablen fehlen.' }) }
    }

    try {
        const profilesRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=id,parqet_client_id,parqet_refresh_token,newsletter_active&newsletter_active=eq.true`,
            {
                headers: {
                    apikey: SUPABASE_SERVICE_ROLE_KEY,
                    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
            }
        )
        if (!profilesRes.ok) throw new Error(`Profile-Laden fehlgeschlagen: ${profilesRes.status}`)
        const profiles = await profilesRes.json()

        const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
        })
        const usersData = usersRes.ok ? await usersRes.json() : { users: [] }
        const emailMap = new Map((usersData.users || []).map(u => [u.id, u.email]))

        const results = []

        for (const profile of profiles) {
            const email = emailMap.get(profile.id)
            if (!email) continue

            let emailPayload = null

            // VERSUCH 1: LIVE-ABRUF VON PARQET
            if (profile.parqet_client_id && profile.parqet_refresh_token) {
                try {
                    const tokenData = await getParqetAccessToken(profile.parqet_client_id, profile.parqet_refresh_token)

                    // Neuen Token sofort mit await sichern
                    if (tokenData.refresh_token && tokenData.refresh_token !== profile.parqet_refresh_token) {
                        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
                            method: 'PATCH',
                            headers: {
                                apikey: SUPABASE_SERVICE_ROLE_KEY,
                                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal',
                            },
                            body: JSON.stringify({ parqet_refresh_token: tokenData.refresh_token }),
                        }).catch(() => {})
                    }

                    const { perfData, activities } = await fetchParqetWeeklyData(tokenData.access_token)
                    const perf = perfData?.performance || {}
                    const holdings = perfData?.holdings || perfData?.performance?.holdings || []

                    const nameMap = {}
                    holdings.forEach(h => {
                        const name = h.asset?.name || h.asset?.isin
                        if (h.id && name) nameMap[h.id] = name
                        if (h.asset?.isin && name) nameMap[h.asset.isin] = name
                    })

                    const realDividends = (activities || [])
                        .filter(a => a.type === 'dividend')
                        .map(a => ({
                            ...a,
                            resolvedName: a.asset?.name || nameMap[a.holdingId] || nameMap[a.asset?.isin] || 'Dividende'
                        }))

                    emailPayload = {
                        isFallback: false,
                        currentValue: perf.valuation?.atIntervalEnd ?? 0,
                        weekGain: (perf.unrealizedGains?.inInterval?.gainGross ?? 0) + (perf.realizedGains?.inInterval?.gainGross ?? 0),
                        weekReturn: perf.unrealizedGains?.inInterval?.returnGross ?? 0,
                        topHoldings: holdings,
                        recentDividends: realDividends,
                    }
                } catch (parqetErr) {
                    console.warn(`[Parqet Live fehlgeschlagen für ${email}]: ${parqetErr.message} -> Schalte auf Fallback`)
                }
            }

            // VERSUCH 2: FALLBACK AUF SUPABASE SNAPSHOT
            if (!emailPayload) {
                try {
                    emailPayload = await fetchSupabaseSnapshotData(profile.id)
                } catch (snapErr) {
                    console.error(`[Snapshot Fallback fehlgeschlagen]: ${snapErr.message}`)
                }
            }

            // Wenn Daten da sind -> E-Mail senden!
            if (emailPayload) {
                const html = buildNewsletterHtml({
                    userEmail: email,
                    ...emailPayload
                })

                await sendEmailViaResend({
                    to: email,
                    subject: `Dein Portfolio-Rückblick: ${emailPayload.weekGain >= 0 ? '+' : ''}${fmtEur(emailPayload.weekGain)}`,
                    html,
                })

                results.push({
                    userId: profile.id,
                    email,
                    status: 'sent',
                    mode: emailPayload.isFallback ? 'fallback_snapshot' : 'live_parqet'
                })
            } else {
                results.push({ userId: profile.id, email, status: 'error', reason: 'Weder Parqet noch Snapshot verfügbar' })
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, processed: results.length, results }),
        }
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
    }
}