// DUCKMON AI Intelligence Module v3.0
// Powered by Google Gemini - Enhanced with timeout, caching, exponential backoff
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GEMINI_API_KEY = process.env.VITE_API_KEY || process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const AI_CONFIG = {
    maxRetries: 3,
    timeout: 30000,
    temperature: 0.3,       // Lower for deterministic JSON output (was 0.7)
    maxOutputTokens: 1024,
};

// Response cache (5 min TTL)
const _cache = new Map();
const CACHE_TTL = 300000;

const log = {
    ai: (msg) => console.log(`\x1b[35m[AI]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[AI-ERR]\x1b[0m ${msg}`),
};

function getCacheKey(prompt) {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < Math.min(prompt.length, 200); i++) {
        hash = ((hash << 5) - hash) + prompt.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(36);
}

async function callGeminiAPI(prompt, retries = AI_CONFIG.maxRetries) {
    if (!GEMINI_API_KEY) {
        return null;
    }

    // Check cache
    const cacheKey = getCacheKey(prompt);
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
    }

    try {
        // AbortController with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: AI_CONFIG.temperature,
                    maxOutputTokens: AI_CONFIG.maxOutputTokens,
                },
            }),
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

        // Cache successful response
        if (result) {
            _cache.set(cacheKey, { data: result, time: Date.now() });
            // Clean old cache entries
            if (_cache.size > 50) {
                for (const [key, val] of _cache) {
                    if (Date.now() - val.time > CACHE_TTL) _cache.delete(key);
                }
            }
        }

        return result;
    } catch (error) {
        if (retries > 0) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = 1000 * Math.pow(2, AI_CONFIG.maxRetries - retries);
            await new Promise(r => setTimeout(r, delay));
            return callGeminiAPI(prompt, retries - 1);
        }
        log.error(`Gemini API failed: ${error.message}`);
        return null;
    }
}

function parseJSON(text) {
    if (!text) return null;
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch (e) {
        log.error(`JSON parse failed: ${e.message}`);
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════
// MARKET ANALYSIS (for Trading Oracle)
// ═══════════════════════════════════════════════════════════════════

export async function generateMarketAnalysis(data) {
    const { price, priceChange24h, volume24h, rsi, macd, macdSignal, bollingerPosition, momentum, volatility, stochasticRSI, ichimoku, fibonacci, regime } = data;

    const prompt = `You are an expert cryptocurrency market analyst. Analyze the following DUCK token data and provide a professional trading signal.

MARKET DATA:
- Current Price: ${price}
- 24h Change: ${priceChange24h > 0 ? '+' : ''}${(priceChange24h || 0).toFixed(2)}%
- 24h Volume: $${(volume24h || 0).toLocaleString()}
- RSI(14): ${(rsi || 50).toFixed(1)}
- MACD: ${(macd || 0).toFixed(6)} (Signal: ${(macdSignal || 0).toFixed(6)})
- Bollinger %B: ${(bollingerPosition || 50).toFixed(2)}%
- Momentum: ${(momentum || 0).toFixed(2)}%
- Volatility: ${(volatility || 0).toFixed(2)}%
${stochasticRSI ? `- Stochastic RSI: K=${stochasticRSI.k?.toFixed(1)}, D=${stochasticRSI.d?.toFixed(1)}` : ''}
${ichimoku ? `- Ichimoku: ${ichimoku.signal}` : ''}
${regime ? `- Market Regime: ${regime}` : ''}

Provide a JSON response:
{
    "signal": "BUY" or "SELL" or "HOLD",
    "confidence": number 50-95,
    "reason": "Brief 1-line explanation",
    "support": "price level as number",
    "resistance": "price level as number",
    "riskReward": "ratio like 1:2.5",
    "stopLoss": "price level",
    "takeProfit": "price level",
    "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
    "keyFactors": ["factor1", "factor2", "factor3"]
}

Respond with ONLY the JSON.`;

    return parseJSON(await callGeminiAPI(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// PRICE PREDICTION (for Prediction Bot)
// ═══════════════════════════════════════════════════════════════════

export async function generatePricePrediction(data) {
    const { currentPrice, priceHistory, trend, support, resistance, timeframe } = data;
    const recentPrices = (priceHistory || []).slice(-10).map(p => p.toFixed(8)).join(', ');

    const prompt = `You are an expert cryptocurrency price prediction analyst. Predict future price movement for DUCK token.

CURRENT DATA:
- Current Price: ${currentPrice}
- Recent Prices (10 points): ${recentPrices}
- Overall Trend: ${trend}
- Support Level: ${support}
- Resistance Level: ${resistance}
- Timeframe: ${timeframe}

Provide a JSON response:
{
    "direction": "UP" or "DOWN" or "SIDEWAYS",
    "confidence": number 50-95,
    "targetPrice": "predicted price as number",
    "percentChange": "expected % change as number",
    "analysis": "Brief 1-line reasoning",
    "probability": { "bullish": number, "bearish": number, "sideways": number },
    "keyLevels": { "strongSupport": "price", "weakSupport": "price", "weakResistance": "price", "strongResistance": "price" }
}

Respond with ONLY the JSON.`;

    return parseJSON(await callGeminiAPI(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// WHALE BEHAVIOR (for Whale Observer)
// ═══════════════════════════════════════════════════════════════════

export async function analyzeWhaleBehavior(data) {
    const { wallet, balanceChange, newBalance, percentOfSupply, recentActivity, networkStats } = data;

    const prompt = `You are an expert on-chain analyst specializing in whale behavior. Analyze this whale wallet activity.

WHALE DATA:
- Wallet: ${wallet}
- Balance Change: ${balanceChange > 0 ? '+' : ''}${(balanceChange || 0).toLocaleString()} DUCK
- New Balance: ${(newBalance || 0).toLocaleString()} DUCK
- % of Total Supply: ${(percentOfSupply || 0).toFixed(2)}%
- Recent Activity: ${recentActivity || 'Unknown'}

NETWORK:
- Gas Price: ${networkStats?.gasPrice || 'N/A'} gwei
- TX/Block: ${networkStats?.txPerBlock || 'N/A'}
- Congestion: ${networkStats?.congestion || 'N/A'}

Provide a JSON response:
{
    "behavior": "ACCUMULATING" or "DISTRIBUTING" or "TRADING" or "DORMANT",
    "intent": "Brief analysis of likely intent",
    "marketImpact": "LOW" or "MODERATE" or "HIGH" or "CRITICAL",
    "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
    "recommendation": "Brief action recommendation",
    "riskAssessment": "Risk level for retail traders",
    "historicalPattern": "Pattern comparison",
    "priceImpact": "Expected price impact"
}

Respond with ONLY the JSON.`;

    return parseJSON(await callGeminiAPI(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// DAILY SUMMARY (for Orchestrator)
// ═══════════════════════════════════════════════════════════════════

export async function generateDailySummary(data) {
    const { signals, predictions, whaleAlerts, pricePerformance, volumeStats } = data;

    const prompt = `You are a professional cryptocurrency market analyst. Create a comprehensive daily summary for DUCK token.

TODAY'S DATA:
- Signals: ${signals?.buy || 0} BUY, ${signals?.sell || 0} SELL, ${signals?.hold || 0} HOLD
- Predictions: ${predictions?.bullish || 0} Bullish, ${predictions?.bearish || 0} Bearish
- Whale Alerts: ${whaleAlerts?.accumulation || 0} Accumulation, ${whaleAlerts?.distribution || 0} Distribution
- Price Performance: ${(pricePerformance || 0) > 0 ? '+' : ''}${(pricePerformance || 0).toFixed(2)}%
- Volume (24h): $${(volumeStats?.volume24h || 0).toLocaleString()}

Provide a JSON response:
{
    "marketCondition": "BULLISH" or "BEARISH" or "CONSOLIDATING" or "VOLATILE",
    "summary": "2-3 sentence professional summary",
    "keyHighlights": ["highlight1", "highlight2", "highlight3"],
    "outlook": "Brief next 24h outlook",
    "riskLevel": "LOW" or "MODERATE" or "HIGH",
    "actionableInsight": "One clear recommendation",
    "confidenceScore": number 60-95
}

Respond with ONLY the JSON.`;

    return parseJSON(await callGeminiAPI(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// NEW: SENTIMENT ANALYSIS (for Social Sentiment Agent)
// ═══════════════════════════════════════════════════════════════════

export async function generateSentimentAnalysis(data) {
    const { holderCount, holderChange24h, volume24h, volumeChange, buys24h, sells24h, priceChange24h, liquidityUsd } = data;

    const prompt = `You are a crypto social sentiment and market psychology analyst. Analyze DUCK token social metrics.

SOCIAL & MARKET DATA:
- Holders: ${holderCount || 'N/A'} (${holderChange24h > 0 ? '+' : ''}${holderChange24h || 0} in 24h)
- Volume 24h: $${(volume24h || 0).toLocaleString()} (Change: ${volumeChange > 0 ? '+' : ''}${(volumeChange || 0).toFixed(1)}%)
- Buys/Sells 24h: ${buys24h || 0} / ${sells24h || 0} (Ratio: ${sells24h > 0 ? (buys24h / sells24h).toFixed(2) : 'N/A'})
- Price Change 24h: ${(priceChange24h || 0) > 0 ? '+' : ''}${(priceChange24h || 0).toFixed(2)}%
- Liquidity: $${(liquidityUsd || 0).toLocaleString()}

Provide a JSON response:
{
    "sentimentScore": number 0-100,
    "sentiment": "EXTREME_FEAR" or "FEAR" or "NEUTRAL" or "GREED" or "EXTREME_GREED",
    "socialMomentum": "DECLINING" or "STABLE" or "GROWING" or "VIRAL",
    "holderBehavior": "ACCUMULATING" or "DISTRIBUTING" or "HOLDING",
    "volumeAnalysis": "Brief analysis of volume patterns",
    "marketPsychology": "Brief 1-line market psychology analysis",
    "signal": "BUY" or "SELL" or "HOLD",
    "confidence": number 50-90,
    "keyInsights": ["insight1", "insight2", "insight3"]
}

Respond with ONLY the JSON.`;

    return parseJSON(await callGeminiAPI(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// NEW: LIQUIDITY ANALYSIS (for Liquidity Sentinel Agent)
// ═══════════════════════════════════════════════════════════════════

export async function generateLiquidityAnalysis(data) {
    const { bondingProgress, isGraduated, liquidityUsd, liquidityChange, lpEvents, volume24h } = data;

    const prompt = `You are a DeFi liquidity analyst specializing in memecoin bonding curves and LP analysis.

LIQUIDITY DATA:
- Bonding Curve Progress: ${(bondingProgress || 0).toFixed(1)}%
- Graduated: ${isGraduated ? 'YES' : 'NO'}
- Current Liquidity: $${(liquidityUsd || 0).toLocaleString()}
- Liquidity Change: ${liquidityChange > 0 ? '+' : ''}${(liquidityChange || 0).toFixed(1)}%
- LP Events: ${lpEvents || 'None detected'}
- Volume 24h: $${(volume24h || 0).toLocaleString()}

Provide a JSON response:
{
    "liquidityHealth": "CRITICAL" or "LOW" or "MODERATE" or "HEALTHY" or "STRONG",
    "rugRisk": number 0-100,
    "bondingStatus": "Brief bonding curve analysis",
    "lpAnalysis": "Brief LP health analysis",
    "graduationProximity": "Brief graduation status",
    "recommendation": "Brief action recommendation",
    "signal": "BUY" or "SELL" or "HOLD",
    "confidence": number 50-90,
    "keyRisks": ["risk1", "risk2"]
}

Respond with ONLY the JSON.`;

    return parseJSON(await callGeminiAPI(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// NEW: ON-CHAIN INSIGHT (for On-Chain Analytics Agent)
// ═══════════════════════════════════════════════════════════════════

export async function generateOnChainInsight(data) {
    const { uniqueHolders, holderChange, buyCount, sellCount, tokenVelocity, largeTransfers, networkActivity } = data;

    const prompt = `You are an on-chain data analyst. Analyze DUCK token on-chain activity patterns.

ON-CHAIN DATA:
- Unique Holders: ${uniqueHolders || 'N/A'} (Change: ${holderChange > 0 ? '+' : ''}${holderChange || 0})
- Buys: ${buyCount || 0} | Sells: ${sellCount || 0} | Ratio: ${sellCount > 0 ? (buyCount / sellCount).toFixed(2) : 'N/A'}
- Token Velocity: ${(tokenVelocity || 0).toFixed(4)}
- Large Transfers (>0.1% supply): ${largeTransfers || 0}
- Network TX/Block: ${networkActivity?.txPerBlock || 'N/A'}

Provide a JSON response:
{
    "onChainHealth": "WEAK" or "MODERATE" or "STRONG" or "VERY_STRONG",
    "accumulationScore": number 0-100,
    "organicGrowth": true or false,
    "smartMoneyFlow": "INFLOW" or "OUTFLOW" or "NEUTRAL",
    "analysis": "Brief 1-line on-chain analysis",
    "signal": "BUY" or "SELL" or "HOLD",
    "confidence": number 50-90,
    "keyMetrics": ["metric1", "metric2", "metric3"]
}

Respond with ONLY the JSON.`;

    return parseJSON(await callGeminiAPI(prompt));
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

export function formatAISignalReason(aiAnalysis) {
    if (!aiAnalysis) return null;
    const { signal, reason, support, resistance, riskReward, sentiment, keyFactors } = aiAnalysis;

    const parts = [
        `AI ${signal}`,
        reason,
        support ? `S: ${support}` : null,
        resistance ? `R: ${resistance}` : null,
        riskReward ? `R/R: ${riskReward}` : null,
        sentiment,
        keyFactors ? `Factors: ${keyFactors.slice(0, 2).join(', ')}` : null,
    ].filter(Boolean);

    return parts.join(' | ');
}

export function isAIEnabled() {
    return !!GEMINI_API_KEY;
}

export function getAIStatus() {
    return {
        enabled: isAIEnabled(),
        model: 'gemini-2.0-flash',
        features: [
            'market-analysis', 'price-prediction', 'whale-behavior',
            'daily-summary', 'sentiment-analysis', 'liquidity-analysis', 'onchain-insight',
        ],
    };
}

export default {
    generateMarketAnalysis,
    generatePricePrediction,
    analyzeWhaleBehavior,
    generateDailySummary,
    generateSentimentAnalysis,
    generateLiquidityAnalysis,
    generateOnChainInsight,
    formatAISignalReason,
    isAIEnabled,
    getAIStatus,
};
