import React, { useState } from 'react'

const KNOWN_CRYPTOS = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'AVAX', 'LINK', 'BNB', 'MATIC', 'SUI', 'NEAR', 'PEPE']

export default function AssetLogo({
                                      symbol = '',
                                      isin = '',
                                      name = '',
                                      assetType = '',
                                      size = 32
                                  }) {
    const [imgFailed, setImgFailed] = useState(false)

    const cleanSymbol = String(symbol || '').toUpperCase().split('.')[0]
    const isCrypto = assetType?.toLowerCase()?.includes('crypto') || KNOWN_CRYPTOS.includes(cleanSymbol)

    // 1. URL ermitteln
    let logoUrl = null
    if (!imgFailed) {
        if (isCrypto && cleanSymbol) {
            logoUrl = `https://assets.coincap.io/assets/icons/${cleanSymbol.toLowerCase()}@2x.png`
        } else if (isin && isin.length === 12) {
            // Öffentliches CDN ohne Authentifizierung
            logoUrl = `https://assets.parqet.com/logos/isin/${isin}`
        } else if (cleanSymbol) {
            logoUrl = `https://raw.githubusercontent.com/nvstly/icons/main/ticker_icons/${cleanSymbol}.png`
        }
    }

    // 2. Initialen als Fallback berechnen (z.B. "Apple Inc." -> "AP", "Bitcoin" -> "BT")
    const getInitials = () => {
        const text = name || cleanSymbol || isin || '?'
        const parts = text.trim().split(/\s+/)
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase()
        }
        return text.slice(0, 2).toUpperCase()
    }

    // Zufällige, aber pro Aktie feste Hintergrundfarbe für das Fallback-Badge
    const getBadgeColor = (str) => {
        const colors = ['#009991', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1']
        let hash = 0
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
        return colors[Math.abs(hash) % colors.length]
    }

    // Fallback: Initialen-Kreis rendern
    if (!logoUrl || imgFailed) {
        const bg = isCrypto ? '#f59e0b' : getBadgeColor(name || cleanSymbol)
        return (
            <div
                style={{
                    width: size,
                    height: size,
                    minWidth: size,
                    borderRadius: '50%',
                    background: `${bg}22`,
                    border: `1px solid ${bg}55`,
                    color: bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: Math.max(10, Math.floor(size * 0.38)),
                    fontWeight: 700,
                    userSelect: 'none',
                }}
                title={name || cleanSymbol}
            >
                {getInitials()}
            </div>
        )
    }

    // Bild rendern
    return (
        <img
            src={logoUrl}
            alt={name || cleanSymbol}
            onError={() => setImgFailed(true)}
            style={{
                width: size,
                height: size,
                minWidth: size,
                borderRadius: '50%',
                objectFit: 'contain',
                background: '#0f1420',
                border: '1px solid #1e2a3a',
            }}
            loading="lazy"
        />
    )
}