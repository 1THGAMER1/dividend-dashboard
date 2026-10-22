// Netlify Scheduled Function: Wöchentlicher Portfolio-Newsletter
// Läuft jeden Montag um 07:00 UTC (ca. 08:00/09:00 Uhr deutsche Zeit)

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
// Fallback auf die normale Supabase-URL, falls keine spezielle Variable gesetzt ist
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL

const PARQET_TOKEN_URL = 'https://connect.parqet.com/oauth2/token'
const PARQET_API_BASE = 'https://connect.parqet.com'

const fmtEur = (n) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)

const fmtPct = (n) =>
    `${(Number(n) || 0) >= 0 ? '+' : ''}${(Number(n) || 0).toFixed(2).replace('.', ',')} %`

// ── 1. PARQET AUTH PRO NUTZER ────────────────────────────────────────────────
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
        throw new Error(`Parqet Token-Refresh fehlgeschlagen (${res.status}): ${txt}`)
    }
    return res.json()
}

async function fetchParqetWeeklyData(accessToken) {
    // 1. Portfolio-ID holen
    const portRes = await fetch(`${PARQET_API_BASE}/portfolios`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'DividendDashboard/1.0',
        },
    })
    if (!portRes.ok) {
        const errText = await portRes.text().catch(() => '')
        throw new Error(`Portfolios konnten nicht geladen werden (HTTP ${portRes.status}): ${errText.slice(0, 200)}`)
    }
    const portData = await portRes.json()
    // Parqet liefert manchmal ein Array direkt oder unter .portfolios / .data
    const portfolio = Array.isArray(portData)
        ? portData[0]
        : (portData.portfolios?.[0] || portData.data?.[0] || portData.items?.[0])

    if (!portfolio?.id) {
        throw new Error(`Kein Portfolio gefunden. Antwort war: ${JSON.stringify(portData).slice(0, 150)}`)
    }

    // 2. 7-Tage-Performance (1w) abholen
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
    if (!perfRes.ok) throw new Error('Wochen-Performance konnte nicht geladen werden')
    const perfData = await perfRes.json()

    // 3. Neueste Dividenden-Aktivitäten der letzten 30 Tage holen
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
    const actsRes = await fetch(
        `${PARQET_API_BASE}/portfolios/${portfolio.id}/activities?types=dividend&from=${encodeURIComponent(thirtyDaysAgo)}&limit=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const actsData = actsRes.ok ? await actsRes.json() : { activities: [] }

    return { portfolio, perfData, activities: actsData.activities || [] }
}

// ── 2. HTML-MAIL TEMPLATE ────────────────────────────────────────────────────
function buildNewsletterHtml({ userEmail, currentValue, weekGain, weekReturn, topHoldings, recentDividends }) {
    const isPos = weekGain >= 0
    const gainColor = isPos ? '#22c55e' : '#ef4444'

    const holdingsRows = (topHoldings || []).slice(0, 5).map(h => {
        const val = Number(h.position?.currentValue || 0)
        const gain = Number(h.performance?.unrealizedGains?.inInterval?.gainNet || 0)
        const ret = Number(h.performance?.unrealizedGains?.inInterval?.returnNet || 0)
        const hPos = gain >= 0
        return `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #1e2a3a; color: #f1f5f9; font-size: 13px; font-weight: 600;">
          ${h.asset?.name || h.asset?.isin || 'Asset'}
        </td>
        <td style="padding: 10px 0; border-bottom: 1px solid #1e2a3a; text-align: right; color: #cbd5e1; font-size: 13px;">
          ${fmtEur(val)}
        </td>
        <td style="padding: 10px 0; border-bottom: 1px solid #1e2a3a; text-align: right; color: ${hPos ? '#22c55e' : '#ef4444'}; font-size: 13px; font-weight: 600;">
          ${hPos ? '+' : ''}${fmtEur(gain)} (${fmtPct(ret)})
        </td>
      </tr>
    `
    }).join('')

    const divRows = (recentDividends || []).slice(0, 4).map(a => `
    <li style="margin-bottom: 6px; color: #94a3b8; font-size: 12px;">
      <strong style="color: #f1f5f9;">${a.asset?.name || 'Wertpapier'}:</strong> 
      <span style="color: #22c55e; font-weight: 600;">+${fmtEur(a.amountNet || a.amount || 0)}</span>
      <span style="color: #64748b;">(${new Date(a.datetime).toLocaleDateString('de-DE')})</span>
    </li>
  `).join('')

    return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 20px 10px; background-color: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div style="max-width: 560px; margin: 0 auto; background: #161b27; border: 1px solid #1e2a3a; border-radius: 16px; overflow: hidden;">
      
      <!-- HEADER -->
      <div style="padding: 24px; background: #10141f; border-bottom: 1px solid #1e2a3a; text-align: center;">
        <h1 style="margin: 0; font-size: 20px; color: #f1f5f9; font-weight: 700;">📊 Dein Wochen-Rückblick</h1>
        <p style="margin: 6px 0 0; color: #64748b; font-size: 12px;">Zusammenfassung deiner Depot-Performance</p>
      </div>

      <!-- HAUPT-KPI -->
      <div style="padding: 24px; text-align: center; border-bottom: 1px solid #1e2a3a;">
        <div style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Aktueller Portfoliowert</div>
        <div style="font-size: 32px; font-weight: 800; color: #f1f5f9; margin: 6px 0;">${fmtEur(currentValue)}</div>
        <div style="display: inline-block; padding: 4px 12px; border-radius: 20px; background: ${isPos ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${gainColor}; font-weight: 700; font-size: 13px;">
          ${isPos ? '▲' : '▼'} ${isPos ? '+' : ''}${fmtEur(weekGain)} (${fmtPct(weekReturn)}) diese Woche
        </div>
      </div>

      <!-- TOP HOLDINGS -->
      ${holdingsRows ? `
      <div style="padding: 20px 24px; border-bottom: 1px solid #1e2a3a;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.4px;">Top Bestände der Woche</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${holdingsRows}
        </table>
      </div>
      ` : ''}

      <!-- LETZTE DIVIDENDEN -->
      ${divRows ? `
      <div style="padding: 20px 24px; border-bottom: 1px solid #1e2a3a;">
        <h3 style="margin: 0 0 12px; font-size: 14px; color: #22c55e; text-transform: uppercase; letter-spacing: 0.4px;">💰 Kürzliche Dividendeneingänge</h3>
        <ul style="margin: 0; padding-left: 18px;">
          ${divRows}
        </ul>
      </div>
      ` : ''}

      <!-- FOOTER -->
      <div style="padding: 20px; text-align: center; background: #0c1019; color: #64748b; font-size: 11px;">
        <p style="margin: 0 0 8px;">Du erhältst diese E-Mail, weil du den wöchentlichen Portfolio-Newsletter aktiviert hast.</p>
        <p style="margin: 0;">Einstellungen anpassen oder abmelden in deinem Profil.</p>
      </div>

    </div>
  </body>
  </html>
  `
}

// ── 3. RESEND MAIL-SENDUNG ───────────────────────────────────────────────────
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

// ── 4. HAUPTFUNKTION (CRON ODER MANUELLER TRIGGER) ───────────────────────────
export const handler = async function(event, context) {
    // Sicherheits-Check: Notwendige Umgebungsvariablen prüfen
    if (!RESEND_API_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Umgebungsvariablen RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_URL fehlen.' }),
        }
    }

    try {
        // 1. Alle Profile laden, die Newsletter aktiv haben und einen Token besitzen
        const profilesRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=id,parqet_client_id,parqet_refresh_token,newsletter_active&newsletter_active=eq.true&parqet_refresh_token=not.is.null`,
            {
                headers: {
                    apikey: SUPABASE_SERVICE_ROLE_KEY,
                    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
            }
        )
        if (!profilesRes.ok) {
            throw new Error(`Konnte Profile nicht aus Supabase laden: ${profilesRes.status}`)
        }
        const profiles = await profilesRes.json()

        // 2. Auth-User für E-Mail-Adressen laden
        const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
        })
        const usersData = usersRes.ok ? await usersRes.json() : { users: [] }
        const emailMap = new Map((usersData.users || []).map(u => [u.id, u.email]))

        const results = []

        // 3. Für jeden Nutzer den Newsletter versenden
        for (const profile of profiles) {
            const email = emailMap.get(profile.id)
            if (!email) {
                results.push({ userId: profile.id, status: 'skipped', reason: 'Keine E-Mail gefunden' })
                continue
            }

            try {
                // Frischen Access-Token von Parqet holen
                const tokenData = await getParqetAccessToken(profile.parqet_client_id, profile.parqet_refresh_token)

                // Falls Parqet einen rotierenden Refresh-Token zurückgibt, in Supabase aktualisieren
                if (tokenData.refresh_token && tokenData.refresh_token !== profile.parqet_refresh_token) {
                    fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
                        method: 'PATCH',
                        headers: {
                            apikey: SUPABASE_SERVICE_ROLE_KEY,
                            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ parqet_refresh_token: tokenData.refresh_token }),
                    }).catch(() => {})
                }

                // Wochendaten von Parqet holen
                const { perfData, activities } = await fetchParqetWeeklyData(tokenData.access_token)
                const perf = perfData?.performance || {}
                const currentValue = perf.valuation?.atIntervalEnd ?? 0
                const weekGain = (perf.unrealizedGains?.inInterval?.gainGross ?? 0) + (perf.realizedGains?.inInterval?.gainGross ?? 0)
                const weekReturn = perf.unrealizedGains?.inInterval?.returnGross ?? 0

                const holdings = perfData?.holdings || perfData?.performance?.holdings || []

                // HTML Mail erzeugen
                const html = buildNewsletterHtml({
                    userEmail: email,
                    currentValue,
                    weekGain,
                    weekReturn,
                    topHoldings: holdings,
                    recentDividends: activities,
                })

                // Mail über Resend versenden
                await sendEmailViaResend({
                    to: email,
                    subject: `Dein Portfolio-Rückblick: ${weekGain >= 0 ? '+' : ''}${fmtEur(weekGain)} (${fmtPct(weekReturn)})`,
                    html,
                })

                results.push({ userId: profile.id, email, status: 'sent' })
            } catch (err) {
                console.error(`Fehler bei Nutzer ${profile.id} (${email}):`, err.message)
                results.push({ userId: profile.id, email, status: 'error', error: err.message })
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, processed: results.length, results }),
        }
    } catch (globalErr) {
        console.error('Newsletter-Lauf fehlgeschlagen:', globalErr)
        return {
            statusCode: 500,
            body: JSON.stringify({ error: globalErr.message }),
        }
    }
}