/**
 * DUCKMON WEBSOCKET SERVER v3.0
 * Institutional-Grade Analysis Engine + Multi-Agent Confluence
 *
 * Features:
 * - Multi-agent signal correlation (7 agents → 1 consensus)
 * - Professional market narrative (not raw RSI numbers)
 * - Risk-adjusted position sizing (Kelly criterion)
 * - Market regime classification with confidence
 * - Entry/Exit/Stop-loss level generation
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { fetchPrice } from './shared/priceService.js';
import {
    generateFullAnalysis, calculateSupportResistance,
    calculateATR, calculateFibonacciLevels, calculateVolumeProfile,
    calculateOBV, calculateTrendStrength, calculateFearGreedIndex,
    detectMarketRegime,
} from './shared/technical-analysis.js';

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;
const ANALYSIS_INTERVAL = 900_000; // 15 minutes

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════════

const io = new SocketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

const state = {
    agents: {},          // agent heartbeats
    signals: [],         // recent signals (max 100)
    agentSignals: {},    // agentName -> latest signal (for confluence)
    whaleAlerts: [],     // recent whale alerts (max 50)
    tokenLaunches: [],   // recent token launches (max 50)
    mevOpportunities: [],// recent MEV opportunities (max 50)
    gasUpdates: [],      // recent gas updates (max 50)
    currentToken: null,  // currently selected token from frontend
    analysisResults: {}, // tokenAddress -> latest analysis result
    startTime: Date.now(),
};

const MAX_ITEMS = 100;
const MAX_ALERTS = 50;
const SIGNAL_EXPIRY = 20 * 60 * 1000; // 20 min — agent signals expire

function addToList(list, item, max = MAX_ITEMS) {
    list.unshift({ ...item, receivedAt: Date.now() });
    if (list.length > max) list.length = max;
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-AGENT CONFLUENCE ENGINE
// Agent weights reflect reliability for signal generation
// ═══════════════════════════════════════════════════════════════════

const AGENT_WEIGHTS = {
    'Trading Oracle v3.0': 0.30,  // Primary technical analysis
    'Market Analyzer v3.0': 0.20,  // Market health & regime
    'Prediction Bot v3.0': 0.15,  // Directional forecasting
    'Liquidity Sentinel v1.0': 0.12,  // Liquidity & rug risk
    'Social Sentiment v1.0': 0.10,  // Sentiment overlay
    'On-Chain Analytics v1.0': 0.08,  // On-chain structure
    'Whale Observer v2.0': 0.05,  // Event-driven (sparse)
};

const SIGNAL_TO_SCORE = { BUY: 1, SELL: -1, HOLD: 0 };

function computeConfluenceScore() {
    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;
    let agentCount = 0;
    const breakdown = {};

    for (const [name, weight] of Object.entries(AGENT_WEIGHTS)) {
        const sig = state.agentSignals[name];
        if (!sig || now - sig.receivedAt > SIGNAL_EXPIRY) continue;

        const score = (SIGNAL_TO_SCORE[sig.type] || 0) * (sig.confidence / 100);
        weightedSum += score * weight;
        totalWeight += weight;
        agentCount++;

        breakdown[name] = {
            signal: sig.type,
            confidence: sig.confidence,
            score: +(score * weight).toFixed(3),
            category: sig.category,
            age: Math.round((now - sig.receivedAt) / 1000),
        };
    }

    if (totalWeight === 0) return { consensus: 'HOLD', strength: 0, agentCount: 0, breakdown };

    const normalizedScore = weightedSum / totalWeight; // range -1 to 1

    let consensus;
    if (normalizedScore > 0.15) consensus = 'BUY';
    else if (normalizedScore < -0.15) consensus = 'SELL';
    else consensus = 'HOLD';

    const strength = Math.min(95, Math.round(Math.abs(normalizedScore) * 100));
    const agreement = agentCount >= 3 ? calculateAgreement(breakdown) : 0;

    return { consensus, strength, normalizedScore: +normalizedScore.toFixed(3), agentCount, agreement, breakdown };
}

function calculateAgreement(breakdown) {
    const signals = Object.values(breakdown).map(b => b.signal);
    const mode = signals.sort((a, b) =>
        signals.filter(v => v === a).length - signals.filter(v => v === b).length
    ).pop();
    return Math.round((signals.filter(s => s === mode).length / signals.length) * 100);
}

// ═══════════════════════════════════════════════════════════════════
// PROFESSIONAL MARKET NARRATIVE GENERATOR
// Produces senior-analyst-level market commentary
// ═══════════════════════════════════════════════════════════════════

function generateNarrative(priceData, technical, confluence, levels, risk) {
    const sym = priceData.tokenSymbol || 'Token';
    const price = priceData.priceUsd || priceData.price;
    const parts = [];

    // 1. Market structure overview
    if (technical) {
        const { regime, trend, rsi, bollinger, fearGreed } = technical;
        const regimeText = {
            'STRONG_UPTREND': 'strong upward momentum',
            'UPTREND': 'a gradual uptrend',
            'DOWNTREND': 'a downward trend',
            'STRONG_DOWNTREND': 'significant selling pressure',
            'RANGING': 'a consolidation phase with range-bound action',
            'VOLATILE_CHOPPY': 'volatile, choppy conditions with no clear direction',
        }[regime] || 'mixed conditions';

        parts.push(`${sym} is currently trading at $${formatUsd(price)} and exhibits ${regimeText}.`);

        // Trend + momentum interpretation
        if (trend) {
            if (trend.direction === 'BULLISH' && trend.strength > 60) {
                parts.push(`Trend momentum is firmly bullish at ${trend.strength.toFixed(0)}% strength, suggesting continuation bias.`);
            } else if (trend.direction === 'BEARISH' && trend.strength > 60) {
                parts.push(`Bearish trend is dominant at ${trend.strength.toFixed(0)}% strength — caution warranted for long positions.`);
            } else {
                parts.push(`Trend is weak (${trend.strength.toFixed(0)}% ${trend.direction.toLowerCase()}), indicating indecision among market participants.`);
            }
        }

        // RSI interpretation (not raw numbers)
        if (rsi !== undefined) {
            if (rsi < 25) parts.push(`RSI at ${rsi.toFixed(0)} signals deeply oversold territory — a potential reversal zone, but falling knives require confirmation.`);
            else if (rsi < 35) parts.push(`RSI at ${rsi.toFixed(0)} suggests the sell-off may be maturing, watch for bullish divergence.`);
            else if (rsi > 75) parts.push(`RSI at ${rsi.toFixed(0)} indicates extreme overbought conditions — risk of a pullback is elevated.`);
            else if (rsi > 65) parts.push(`RSI at ${rsi.toFixed(0)} shows strong buying pressure but approaching overbought territory.`);
        }

        // Bollinger squeeze detection
        if (bollinger && bollinger.bandwidth < 5) {
            parts.push(`Bollinger Bands are tightly compressed (width: ${bollinger.bandwidth.toFixed(1)}%), indicating a volatility squeeze — expect a sharp directional move soon.`);
        } else if (bollinger && bollinger.percentB > 95) {
            parts.push(`Price is riding the upper Bollinger Band — strong momentum but risk of mean reversion.`);
        } else if (bollinger && bollinger.percentB < 5) {
            parts.push(`Price is at the lower Bollinger Band — potential bounce zone if support holds.`);
        }

        // Fear & Greed
        if (fearGreed !== undefined) {
            const fgLabel = fearGreed >= 75 ? 'Extreme Greed' : fearGreed >= 55 ? 'Greed' : fearGreed <= 25 ? 'Extreme Fear' : fearGreed <= 45 ? 'Fear' : 'Neutral';
            parts.push(`Market sentiment: ${fgLabel} (${fearGreed}/100).`);
        }
    }

    // 2. Agent confluence interpretation
    if (confluence.agentCount >= 2) {
        const agreementText = confluence.agreement >= 80 ? 'strong consensus' :
            confluence.agreement >= 60 ? 'moderate agreement' : 'mixed opinions';
        parts.push(`Multi-agent analysis (${confluence.agentCount} agents reporting) shows ${agreementText}: ${confluence.consensus} with ${confluence.strength}% conviction.`);
    }

    // 3. Key levels & actionable items
    if (levels) {
        if (levels.support > 0 && levels.resistance > 0) {
            const distToSupport = ((price - levels.support) / price * 100).toFixed(1);
            const distToResist = ((levels.resistance - price) / price * 100).toFixed(1);
            parts.push(`Key support at $${formatUsd(levels.support)} (${distToSupport}% below), resistance at $${formatUsd(levels.resistance)} (${distToResist}% above).`);
        }
        if (levels.fibonacci) {
            parts.push(`Fibonacci levels: 38.2% at $${formatUsd(levels.fibonacci.level_38_2)}, 61.8% at $${formatUsd(levels.fibonacci.level_61_8)}.`);
        }
    }

    // 4. Risk assessment
    if (risk) {
        if (risk.riskRewardRatio > 2) {
            parts.push(`Risk/reward ratio of ${risk.riskRewardRatio.toFixed(1)}:1 favors entry at current levels with a stop at $${formatUsd(risk.stopLoss)}.`);
        } else if (risk.riskRewardRatio < 1) {
            parts.push(`Risk/reward ratio of ${risk.riskRewardRatio.toFixed(1)}:1 is unfavorable — wait for a better entry or tighter stop placement.`);
        }
    }

    // 5. Agent-specific intelligence
    const sentimentAgent = state.agentSignals['Social Sentiment v1.0'];
    if (sentimentAgent && Date.now() - sentimentAgent.receivedAt < SIGNAL_EXPIRY) {
        const s = sentimentAgent;
        if (s.sentimentScore) {
            parts.push(`Social sentiment is ${s.sentimentLabel || 'neutral'} (${s.sentimentScore}/100)${s.buySellRatio24h ? ` with buy/sell ratio at ${s.buySellRatio24h.toFixed(2)}` : ''}.`);
        }
    }

    const liquidityAgent = state.agentSignals['Liquidity Sentinel v1.0'];
    if (liquidityAgent && Date.now() - liquidityAgent.receivedAt < SIGNAL_EXPIRY) {
        const l = liquidityAgent;
        if (l.rugRisk !== undefined) {
            if (l.rugRisk > 60) parts.push(`⚠️ Elevated rug risk (${l.rugRisk}/100) — exercise caution with position sizing.`);
            else if (l.rugRisk < 30) parts.push(`Liquidity health is strong with low rug risk (${l.rugRisk}/100).`);
        }
    }

    return parts.join(' ');
}

function formatUsd(n) {
    if (!n || isNaN(n)) return '0.00';
    if (n < 0.001) return n.toFixed(8);
    if (n < 1) return n.toFixed(6);
    if (n < 1000) return n.toFixed(4);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════════
// RISK-ADJUSTED POSITION SIZING
// Uses modified Kelly Criterion + ATR-based stops
// ═══════════════════════════════════════════════════════════════════

function calculateRiskLevels(price, technical, confluence) {
    if (!technical || !price) return null;

    const atr = technical.atr || 0;
    const support = technical.supportResistance?.support || price * 0.95;
    const resistance = technical.supportResistance?.resistance || price * 1.05;

    // ATR-based stop-loss (1.5x ATR from current price)
    const atrStop = price - (atr * 1.5);
    // S/R-based stop (just below support)
    const srStop = support * 0.99;
    // Use the tighter of the two
    const stopLoss = Math.max(atrStop, srStop);

    // Target: distance to resistance, at least 2x risk
    const risk = price - stopLoss;
    const target1 = price + risk * 2;   // 2:1 R/R
    const target2 = price + risk * 3;   // 3:1 R/R
    const riskRewardRatio = resistance > price ? (resistance - price) / risk : 1;

    // Modified Kelly Criterion for position sizing
    // Kelly% = (W * R - L) / R where W = win%, L = loss%, R = avg win/loss ratio
    const winRate = confluence.strength > 60 ? 0.55 : 0.50;
    const kellyPct = Math.max(0, Math.min(0.25, (winRate * riskRewardRatio - (1 - winRate)) / riskRewardRatio));
    // Half-Kelly for safety
    const positionSizePct = +(kellyPct * 50).toFixed(1); // percentage of portfolio

    return {
        stopLoss: +stopLoss.toFixed(8),
        target1: +target1.toFixed(8),
        target2: +target2.toFixed(8),
        riskRewardRatio: +riskRewardRatio.toFixed(2),
        positionSizePct,
        atr: +atr.toFixed(8),
        riskPerUnit: +risk.toFixed(8),
    };
}

// ═══════════════════════════════════════════════════════════════════
// TOKEN ANALYSIS ENGINE (Institutional Grade)
// ═══════════════════════════════════════════════════════════════════

const priceHistories = new Map();
const volumeHistories = new Map();
const HISTORY_MAX = 200;
let analysisInterval = null;

async function analyzeToken(tokenAddress) {
    if (!tokenAddress) return null;
    const key = tokenAddress.toLowerCase();

    try {
        const priceData = await fetchPrice(tokenAddress);
        if (!priceData || !priceData.price) {
            console.log(`[Analysis] No price data for ${tokenAddress.slice(0, 10)}...`);
            return null;
        }

        // Build price + volume history
        if (!priceHistories.has(key)) priceHistories.set(key, []);
        if (!volumeHistories.has(key)) volumeHistories.set(key, []);

        const history = priceHistories.get(key);
        const volHistory = volumeHistories.get(key);
        history.push(priceData.price);
        volHistory.push(priceData.volume || 0);
        if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
        if (volHistory.length > HISTORY_MAX) volHistory.splice(0, volHistory.length - HISTORY_MAX);

        // Core technical analysis
        let technicalAnalysis = null;
        if (history.length >= 5) {
            technicalAnalysis = generateFullAnalysis(history, volHistory);
        }

        // Extended analysis
        let supportResistance = null;
        let fibonacci = null;
        let volumeProfile = null;
        let obv = null;

        if (history.length >= 20) {
            supportResistance = calculateSupportResistance(history, volHistory);
            fibonacci = calculateFibonacciLevels(history);
            if (volHistory.some(v => v > 0)) {
                volumeProfile = calculateVolumeProfile(history, volHistory);
                obv = calculateOBV(history, volHistory);
            }
        }

        // Multi-agent confluence
        const confluence = computeConfluenceScore();

        // Combined signal: 60% own analysis + 40% agent consensus
        let signalType = 'HOLD';
        let confidence = 50;
        let ownScore = 0;

        if (technicalAnalysis) {
            const { rsi, macd, trend, bollinger, stochasticRSI, ichimoku } = technicalAnalysis;
            let buyScore = 0, sellScore = 0;

            // RSI zones
            if (rsi < 25) buyScore += 0.25;
            else if (rsi < 35) buyScore += 0.12;
            else if (rsi > 75) sellScore += 0.25;
            else if (rsi > 65) sellScore += 0.12;

            // MACD + histogram momentum
            if (macd.histogram > 0 && macd.value > 0) buyScore += 0.15;
            else if (macd.histogram < 0 && macd.value < 0) sellScore += 0.15;
            // MACD histogram reversal detection
            if (macd.histogram > 0 && macd.value < 0) buyScore += 0.08; // emerging bullish
            else if (macd.histogram < 0 && macd.value > 0) sellScore += 0.08; // emerging bearish

            // Bollinger position
            if (bollinger.percentB < 5) buyScore += 0.15;
            else if (bollinger.percentB < 15) buyScore += 0.08;
            else if (bollinger.percentB > 95) sellScore += 0.15;
            else if (bollinger.percentB > 85) sellScore += 0.08;

            // Trend strength contribution
            if (trend.direction === 'BULLISH') buyScore += 0.20 * (trend.strength / 100);
            else if (trend.direction === 'BEARISH') sellScore += 0.20 * (trend.strength / 100);

            // Ichimoku cloud
            if (ichimoku.signal === 'STRONG_BULLISH') buyScore += 0.10;
            else if (ichimoku.signal === 'BULLISH') buyScore += 0.05;
            else if (ichimoku.signal === 'STRONG_BEARISH') sellScore += 0.10;
            else if (ichimoku.signal === 'BEARISH') sellScore += 0.05;

            // Stochastic RSI with smoothing
            if (stochasticRSI.k < 20 && stochasticRSI.d < 20) buyScore += 0.10;
            else if (stochasticRSI.k > 80 && stochasticRSI.d > 80) sellScore += 0.10;
            // StochRSI crossover detection
            if (stochasticRSI.k > stochasticRSI.d && stochasticRSI.k < 30) buyScore += 0.05;
            else if (stochasticRSI.k < stochasticRSI.d && stochasticRSI.k > 70) sellScore += 0.05;

            ownScore = buyScore - sellScore; // range roughly -1 to 1
        }

        // Merge own analysis (60%) with agent confluence (40%)
        const agentScore = confluence.normalizedScore || 0;
        const mergedScore = (ownScore * 0.6) + (agentScore * 0.4);

        if (mergedScore > 0.10) { signalType = 'BUY'; confidence = Math.min(95, 50 + mergedScore * 120); }
        else if (mergedScore < -0.10) { signalType = 'SELL'; confidence = Math.min(95, 50 + Math.abs(mergedScore) * 120); }
        else { signalType = 'HOLD'; confidence = 50 - Math.abs(mergedScore) * 80; }
        confidence = Math.max(25, Math.round(confidence));

        // Key levels
        const levels = {
            support: supportResistance?.support || 0,
            resistance: supportResistance?.resistance || 0,
            fibonacci: fibonacci || null,
        };

        // Risk levels
        const risk = calculateRiskLevels(priceData.price, { ...technicalAnalysis, supportResistance, atr: technicalAnalysis?.atr }, confluence);

        // Professional narrative
        const narrative = generateNarrative(priceData, technicalAnalysis, confluence, levels, risk);

        const result = {
            tokenAddress,
            tokenSymbol: priceData.tokenSymbol || 'UNKNOWN',
            tokenName: priceData.tokenName || 'Unknown Token',
            timestamp: Date.now(),
            agentName: 'Duckmon Intelligence Engine v3.0',

            // Price data
            price: priceData.price,
            priceUsd: priceData.priceUsd || 0,
            priceNative: priceData.priceNative || 0,
            priceChange24h: priceData.priceChange24h || 0,
            priceChange1h: priceData.priceChange1h || 0,
            priceChange5m: priceData.priceChange5m || 0,
            volume24h: priceData.volume || 0,
            liquidity: priceData.liquidity || 0,
            marketCap: priceData.marketCap || 0,
            buys24h: priceData.buys24h || 0,
            sells24h: priceData.sells24h || 0,
            buys1h: priceData.buys1h || 0,
            sells1h: priceData.sells1h || 0,

            // Technical indicators (raw for charts)
            technical: technicalAnalysis,
            priceHistory: history.slice(-100),

            // Advanced analysis
            supportResistance,
            fibonacci,
            volumeProfile,

            // Multi-agent confluence
            confluence,

            // Signal
            type: signalType,
            confidence,

            // Risk management
            risk,

            // Key levels
            levels,

            // Professional narrative
            narrative,
        };

        state.analysisResults[key] = result;
        return result;

    } catch (error) {
        console.error(`[Analysis] Error analyzing ${tokenAddress.slice(0, 10)}...: ${error.message}`);
        return null;
    }
}

function startAnalysisLoop(tokenAddress) {
    if (analysisInterval) {
        clearInterval(analysisInterval);
        analysisInterval = null;
    }

    if (!tokenAddress) return;
    state.currentToken = tokenAddress;

    console.log(`[Analysis] Starting analysis loop for ${tokenAddress.slice(0, 10)}... (every ${ANALYSIS_INTERVAL / 60000}min)`);

    const runAndBroadcast = async () => {
        const result = await analyzeToken(tokenAddress);
        if (result) {
            io.emit('analysis:result', result);
            console.log(`[Analysis] ${result.tokenSymbol} = $${formatUsd(result.priceUsd || result.price)} | ${result.type} (${result.confidence}%) | ${result.confluence.agentCount} agents | R/R: ${result.risk?.riskRewardRatio || 'N/A'}`);
        }
    };

    runAndBroadcast();
    analysisInterval = setInterval(runAndBroadcast, ANALYSIS_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════════
// SOCKET.IO CONNECTIONS
// ═══════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.emit('state', {
        agents: state.agents,
        recentSignals: state.signals.slice(0, 20),
        recentAlerts: state.whaleAlerts.slice(0, 10),
        recentLaunches: state.tokenLaunches.slice(0, 10),
        recentMEV: state.mevOpportunities.slice(0, 10),
        recentGas: state.gasUpdates.slice(0, 5),
        currentToken: state.currentToken,
    });

    if (state.currentToken) {
        const key = state.currentToken.toLowerCase();
        if (state.analysisResults[key]) {
            socket.emit('analysis:result', state.analysisResults[key]);
        }
    }

    socket.on('token:analyze', (data) => {
        const tokenAddress = typeof data === 'string' ? data : data?.tokenAddress;
        if (!tokenAddress || typeof tokenAddress !== 'string' || tokenAddress.length < 10) {
            socket.emit('error', { message: 'Invalid token address' });
            return;
        }
        console.log(`[WS] Token analysis requested: ${tokenAddress.slice(0, 10)}... from ${socket.id}`);
        startAnalysisLoop(tokenAddress);
    });

    socket.on('disconnect', () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
    });
});

// ═══════════════════════════════════════════════════════════════════
// REST API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

app.post('/api/agent/heartbeat', (req, res) => {
    const { agentName, status, uptime, stats } = req.body;
    if (!agentName) return res.status(400).json({ error: 'agentName required' });

    state.agents[agentName] = {
        status: status || 'RUNNING',
        uptime: uptime || 0,
        stats: stats || {},
        lastHeartbeat: Date.now(),
    };

    io.emit('agent:heartbeat', { agentName, ...state.agents[agentName] });
    res.json({ ok: true });
});

// Agent Signal — UPGRADED: now also stores per-agent for confluence
app.post('/api/signal', (req, res) => {
    const data = req.body;
    if (!data.agentName) return res.status(400).json({ error: 'agentName required' });

    addToList(state.signals, data);
    state.agentSignals[data.agentName] = { ...data, receivedAt: Date.now() };
    io.emit('signal', data);
    console.log(`[Signal] ${data.agentName} → ${data.type || 'HOLD'} (${data.confidence || 0}%) [${data.category || 'general'}]`);
    res.json({ ok: true });
});

app.post('/api/token/launch', (req, res) => {
    const data = req.body;
    addToList(state.tokenLaunches, data, MAX_ALERTS);
    io.emit('token:launch', data);
    console.log(`[API] Token launch: ${data.symbol || data.name || 'unknown'}`);
    res.json({ ok: true });
});

app.post('/api/mev/opportunity', (req, res) => {
    const data = req.body;
    addToList(state.mevOpportunities, data, MAX_ALERTS);
    io.emit('mev:opportunity', data);
    console.log(`[API] MEV opportunity: ${data.type || 'unknown'}`);
    res.json({ ok: true });
});

app.post('/api/gas/update', (req, res) => {
    const data = req.body;
    addToList(state.gasUpdates, data, MAX_ALERTS);
    io.emit('gas:update', data);
    res.json({ ok: true });
});

app.post('/api/whale/alert', (req, res) => {
    const data = req.body;
    addToList(state.whaleAlerts, data, MAX_ALERTS);
    io.emit('whale:alert', data);
    console.log(`[API] Whale alert: ${data.type || 'unknown'}`);
    res.json({ ok: true });
});

// Full state endpoint — now includes confluence
app.get('/api/state', (_req, res) => {
    const agentList = Object.entries(state.agents).map(([name, info]) => ({
        name,
        ...info,
        isAlive: Date.now() - info.lastHeartbeat < 120000,
    }));

    res.json({
        uptime: Date.now() - state.startTime,
        agents: agentList,
        currentToken: state.currentToken,
        confluence: computeConfluenceScore(),
        totalSignals: state.signals.length,
        totalAlerts: state.whaleAlerts.length,
        totalLaunches: state.tokenLaunches.length,
        totalMev: state.mevOpportunities.length,
        recentSignals: state.signals.slice(0, 10),
        recentAlerts: state.whaleAlerts.slice(0, 10),
    });
});

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: Date.now() - state.startTime,
        agents: Object.keys(state.agents).length,
        connections: io.engine.clientsCount,
        currentToken: state.currentToken,
        confluenceAgents: Object.keys(state.agentSignals).length,
    });
});

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

server.listen(PORT, () => {
    const sep = '═'.repeat(60);

    console.log('');
    console.log(sep);
    console.log('');
    console.log('    🦆 DUCKMON INTELLIGENCE ENGINE v3.0');
    console.log('   Institutional-Grade Multi-Agent Analysis');
    console.log('');
    console.log(sep);
    console.log('');
    console.log(`  Server:     http://localhost:${PORT}`);
    console.log(`  Health:     http://localhost:${PORT}/health`);
    console.log(`  WebSocket:  ws://localhost:${PORT}`);
    console.log('');
    console.log('  Features:');
    console.log('    ✦ Multi-agent confluence scoring (7 agents)');
    console.log('    ✦ Professional market narrative');
    console.log('    ✦ Risk-adjusted position sizing (Kelly)');
    console.log('    ✦ ATR-based stop-loss / take-profit');
    console.log('    ✦ Volume profile + Fibonacci levels');
    console.log('');
    console.log('  Agent REST API:');
    console.log(`    POST /api/signal            – Agent posts analysis signal`);
    console.log(`    POST /api/mev/opportunity    – MEV Bot posts opportunities`);
    console.log(`    POST /api/token/launch       – Token Launch posts new tokens`);
    console.log(`    POST /api/gas/update          – Gas Optimizer posts updates`);
    console.log(`    POST /api/whale/alert         – Whale Observer posts alerts`);
    console.log(`    POST /api/agent/heartbeat     – Agent heartbeat`);
    console.log(`     GET /api/state               – Get current state + confluence`);
    console.log('');
    console.log('  WebSocket Events (Frontend):');
    console.log(`    emit  token:analyze          – Request analysis for a token`);
    console.log(`    on    analysis:result         – Institutional-grade analysis`);
    console.log(`    on    signal                  – Individual agent signals`);
    console.log(`    on    whale:alert             – Whale alerts`);
    console.log(`    on    gas:update              – Gas updates`);
    console.log(`    on    agent:heartbeat         – Agent status`);
    console.log('');
    console.log(sep);
    console.log('');
});
