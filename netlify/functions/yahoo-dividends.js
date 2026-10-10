export const handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        let symbol = event.queryStringParameters?.symbol || event.queryStringParameters?.ticker;

        if (!symbol) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Symbol parameter is required' })
            };
        }

        // Direktes Mapping für bekannte Problem-ISINs
        const ISIN_MAPPING = {
            'JE00B588CD74': 'SGBS.MI', // WisdomTree Physical Swiss Gold
        };

        if (ISIN_MAPPING[symbol]) {
            symbol = ISIN_MAPPING[symbol];
        } else {
            // Automatischer ISIN-zu-Ticker-Fallback
            const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/;

            if (ISIN_REGEX.test(symbol)) {
                try {
                    const searchRes = await fetch(
                        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}`,
                        {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        }
                    );

                    if (searchRes.ok) {
                        const searchData = await searchRes.json();

                        if (searchData.quotes && searchData.quotes.length > 0) {
                            const quotes = searchData.quotes;

                            // Keine Indizes zulassen
                            const validQuotes = quotes.filter(q => {
                                const type = (q.quoteType || '').toUpperCase();
                                return type === 'ETF' || type === 'EQUITY' || type === 'MUTUALFUND';
                            });

                            let bestMatch = validQuotes.find(q =>
                                q.symbol?.endsWith('.DE') ||
                                q.symbol?.endsWith('.F') ||
                                q.symbol?.endsWith('.PA') ||
                                q.symbol?.endsWith('.AS')
                            );

                            if (!bestMatch && validQuotes.length > 0) {
                                bestMatch = validQuotes[0];
                            }

                            if (!bestMatch) {
                                bestMatch = quotes[0];
                            }

                            if (bestMatch?.symbol) {
                                symbol = bestMatch.symbol;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('ISIN-Suche in Netlify-Function fehlgeschlagen:', e.message);
                }
            }
        }

        if (!/^[A-Za-z0-9.-]+$/.test(symbol)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid symbol format' })
            };
        }

        // "max" ist wichtig, damit auch ältere Splits gefunden werden.
        // range und interval können weiterhin als URL-Parameter überschrieben werden.
        const range = event.queryStringParameters?.range || 'max';
        const interval = event.queryStringParameters?.interval || '1mo';

        // Dividenden und Aktiensplits gemeinsam abfragen
        const url =
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
            `?range=${encodeURIComponent(range)}` +
            `&interval=${encodeURIComponent(interval)}` +
            '&events=div%7Csplit';

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Yahoo Finance API returned status ${response.status}`);
        }

        const data = await response.json();

        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'No data found for this symbol' })
            };
        }

        const result = data.chart.result[0];
        const meta = result.meta || {};
        const events = result.events || {};

        let marketPrice = meta.regularMarketPrice ?? null;
        let currency = (meta.currency || 'EUR').toUpperCase();

        // Dividenden extrahieren
        let dividends = [];

        if (events.dividends) {
            dividends = Object.values(events.dividends)
                .map(div => ({
                    amount: Number(div.amount) || 0,
                    date: new Date(div.date * 1000).toISOString().split('T')[0],
                    timestamp: div.date
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
        }

        // Aktiensplits extrahieren.
        // Yahoo liefert normalerweise numerator / denominator, zum Beispiel 10 / 1.
        // splitRatio ist ein zusätzlicher Fallback, falls Yahoo das Verhältnis als Text liefert.
        const splits = Object.values(events.splits || {})
            .map(split => {
                let ratio = null;

                const numerator = Number(split.numerator);
                const denominator = Number(split.denominator);

                if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
                    ratio = numerator / denominator;
                } else if (typeof split.splitRatio === 'string') {
                    const match = split.splitRatio.match(/([\d.]+)\s*:\s*([\d.]+)/);
                    if (match) {
                        const left = Number(match[1]);
                        const right = Number(match[2]);
                        if (Number.isFinite(left) && Number.isFinite(right) && right !== 0) {
                            ratio = left / right;
                        }
                    }
                }

                return {
                    date: split.date
                        ? new Date(split.date * 1000).toISOString().split('T')[0]
                        : null,
                    ratio
                };
            })
            .filter(split =>
                split.date &&
                Number.isFinite(split.ratio) &&
                split.ratio > 0 &&
                split.ratio !== 1
            )
            .sort((a, b) => a.date.localeCompare(b.date));

        // Jahresdividenden berechnen
        const yearlyTotals = {};

        dividends.forEach(div => {
            const year = new Date(div.timestamp * 1000).getFullYear();
            yearlyTotals[year] = (yearlyTotals[year] || 0) + div.amount;
        });

        // Fremdwährung nach EUR umrechnen (Kurs und Dividendenbeträge)
        if (currency !== 'EUR') {
            try {
                let fxSymbol = `${currency}EUR=X`;

                // Yahoo notiert EURUSD als US-Dollar pro Euro.
                if (currency === 'USD') {
                    fxSymbol = 'EURUSD=X';
                }

                const fxUrl =
                    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fxSymbol)}` +
                    '?range=1d&interval=1d';

                const fxRes = await fetch(fxUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (fxRes.ok) {
                    const fxData = await fxRes.json();
                    const fxRate = fxData.chart?.result?.[0]?.meta?.regularMarketPrice;

                    if (fxRate && fxRate > 0) {
                        const conversionRate = currency === 'USD' ? 1 / fxRate : fxRate;

                        if (marketPrice != null) {
                            marketPrice *= conversionRate;
                        }

                        dividends = dividends.map(div => ({
                            ...div,
                            amount: div.amount * conversionRate
                        }));

                        for (const year of Object.keys(yearlyTotals)) {
                            yearlyTotals[year] *= conversionRate;
                        }

                        currency = 'EUR';
                    }
                }
            } catch (e) {
                console.warn(`Wechselkurs-Abfrage für ${currency} fehlgeschlagen:`, e.message);
            }
        }

        const responseData = {
            symbol: meta.symbol || symbol,
            resolvedTicker: symbol,
            currency,
            instrumentType: meta.instrumentType,
            regularMarketPrice: marketPrice,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
            dividends,
            splits,
            yearlyTotals,
            totalDividendsCount: dividends.length,
            lastDividend: dividends.length > 0 ? dividends[0] : null
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error('Error in yahoo-dividends function:', error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to fetch dividend data',
                details: error.message
            })
        };
    }
};