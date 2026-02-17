/**
 * DUCKMON WEBSOCKET SERVER v2.0
 * Real-time Agent Broadcasting + Token Analysis Engine
 *
 * Provides REST API endpoints for agents and WebSocket for real-time clients.
 * Frontend can request analysis for any token via Socket.IO.
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { fetchPrice } from './shared/priceService.js';
import { generateFullAnalysis } from './shared/technical-analysis.js';

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

function addToList(list, item, max = MAX_ITEMS) {
    list.unshift({ ...item, receivedAt: Date.now() });
    if (list.length > max) list.length = max;
}

// ═══════════════════════════════════════════════════════════════════
// TOKEN ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════

// Per-token price history buffers (for technical analysis)
const priceHistories = new Map(); // tokenAddress -> number[]
const HISTORY_MAX = 200;
let analysisInterval = null;

/**
 * Fetch price and build history for a token, then run full technical analysis
 */
async function analyzeToken(tokenAddress) {
    if (!tokenAddress) return null;
    const key = tokenAddress.toLowerCase();

    try {
        // Fetch current price
        const priceData = await fetchPrice(tokenAddress);
        if (!priceData || !priceData.price) {
            console.log(`[Analysis] No price data for ${tokenAddress.slice(0, 10)}...`);
            return null;
        }

        // Append to history
        if (!priceHistories.has(key)) {
            priceHistories.set(key, []);
        }
        const history = priceHistories.get(key);
        history.push(priceData.price);
        if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);

        // Run technical analysis if we have enough data
        let technicalAnalysis = null;
        if (history.length >= 5) {
            technicalAnalysis = generateFullAnalysis(history);
        }

        // Generate signal
        let signalType = 'HOLD';
        let confidence = 50;
        const reasons = [];

        if (technicalAnalysis) {
            const { rsi, macd, trend, bollinger, stochasticRSI, ichimoku, fearGreed, regime } = technicalAnalysis;

            // Weighted scoring
            let buyScore = 0, sellScore = 0;

            if (rsi < 30) { buyScore += 0.20; reasons.push('RSI oversold'); }
            else if (rsi > 70) { sellScore += 0.20; reasons.push('RSI overbought'); }

            if (macd.histogram > 0 && macd.value > 0) { buyScore += 0.15; reasons.push('MACD bullish'); }
            else if (macd.histogram < 0 && macd.value < 0) { sellScore += 0.15; reasons.push('MACD bearish'); }

            if (bollinger.percentB < 10) { buyScore += 0.15; reasons.push('BB oversold'); }
            else if (bollinger.percentB > 90) { sellScore += 0.15; reasons.push('BB overbought'); }

            if (trend.direction === 'BULLISH') { buyScore += 0.15 * (trend.strength / 100); reasons.push('Bullish trend'); }
            else if (trend.direction === 'BEARISH') { sellScore += 0.15 * (trend.strength / 100); reasons.push('Bearish trend'); }

            if (ichimoku.signal === 'STRONG_BULLISH') { buyScore += 0.10; reasons.push('Ichimoku bullish'); }
            else if (ichimoku.signal === 'STRONG_BEARISH') { sellScore += 0.10; reasons.push('Ichimoku bearish'); }

            if (stochasticRSI.k < 20 && stochasticRSI.d < 20) { buyScore += 0.10; reasons.push('StochRSI oversold'); }
            else if (stochasticRSI.k > 80 && stochasticRSI.d > 80) { sellScore += 0.10; reasons.push('StochRSI overbought'); }

            const netScore = buyScore - sellScore;
            if (netScore > 0.15) { signalType = 'BUY'; confidence = Math.min(95, 50 + netScore * 150); }
            else if (netScore < -0.15) { signalType = 'SELL'; confidence = Math.min(95, 50 + Math.abs(netScore) * 150); }
            else { signalType = 'HOLD'; confidence = 50 - Math.abs(netScore) * 100; }

            confidence = Math.max(30, Math.round(confidence));
        }

        const result = {
            tokenAddress,
            tokenSymbol: priceData.tokenSymbol || 'UNKNOWN',
            tokenName: priceData.tokenName || 'Unknown Token',
            timestamp: Date.now(),
            agentName: 'WS Analysis Engine',

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

            // Technical analysis
            technical: technicalAnalysis,
            priceHistory: history.slice(-50), // last 50 prices for charts

            // Signal
            type: signalType,
            confidence,
            reasons,
        };

        // Cache the result
        state.analysisResults[key] = result;

        return result;
    } catch (error) {
        console.error(`[Analysis] Error analyzing ${tokenAddress.slice(0, 10)}...: ${error.message}`);
        return null;
    }
}

/**
 * Start/restart the analysis interval for the current token
 */
function startAnalysisLoop(tokenAddress) {
    // Clear existing interval
    if (analysisInterval) {
        clearInterval(analysisInterval);
        analysisInterval = null;
    }

    if (!tokenAddress) return;

    state.currentToken = tokenAddress;

    // Run immediately, then every ANALYSIS_INTERVAL
    console.log(`[Analysis] Starting analysis loop for ${tokenAddress.slice(0, 10)}... (every ${ANALYSIS_INTERVAL / 60000}min)`);

    const runAndBroadcast = async () => {
        const result = await analyzeToken(tokenAddress);
        if (result) {
            io.emit('analysis:result', result);
            console.log(`[Analysis] ${result.tokenSymbol} = $${result.priceUsd?.toFixed(6) || result.price?.toFixed(6)} | ${result.type} (${result.confidence}%)`);
        }
    };

    runAndBroadcast(); // immediate first run
    analysisInterval = setInterval(runAndBroadcast, ANALYSIS_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════════
// SOCKET.IO CONNECTIONS
// ═══════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Send current state to new client
    socket.emit('state', {
        agents: state.agents,
        recentSignals: state.signals.slice(0, 20),
        recentAlerts: state.whaleAlerts.slice(0, 10),
        recentLaunches: state.tokenLaunches.slice(0, 10),
        recentMEV: state.mevOpportunities.slice(0, 10),
        recentGas: state.gasUpdates.slice(0, 5),
        currentToken: state.currentToken,
    });

    // If there's a cached analysis for current token, send it
    if (state.currentToken) {
        const key = state.currentToken.toLowerCase();
        if (state.analysisResults[key]) {
            socket.emit('analysis:result', state.analysisResults[key]);
        }
    }

    // Listen for token analysis requests from frontend
    socket.on('token:analyze', (data) => {
        const tokenAddress = typeof data === 'string' ? data : data?.tokenAddress;
        if (!tokenAddress || typeof tokenAddress !== 'string' || tokenAddress.length < 10) {
            socket.emit('error', { message: 'Invalid token address' });
            return;
        }

        console.log(`[WS] Token analysis requested: ${tokenAddress.slice(0, 10)}... from ${socket.id}`);

        // Start analysis loop for new token (resets interval)
        startAnalysisLoop(tokenAddress);
    });

    socket.on('disconnect', () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
    });
});

// ═══════════════════════════════════════════════════════════════════
// REST API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// Agent Heartbeat
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

// Agent Signal (from any agent — trading oracle, prediction bot, etc.)
app.post('/api/signal', (req, res) => {
    const data = req.body;
    if (!data.agentName) return res.status(400).json({ error: 'agentName required' });

    addToList(state.signals, data);
    io.emit('signal', data);
    console.log(`[API] Signal from ${data.agentName}: ${data.type || 'HOLD'} (${data.confidence || 0}%) - ${data.tokenSymbol || 'DUCK'}`);
    res.json({ ok: true });
});

// Token Launch posts new tokens
app.post('/api/token/launch', (req, res) => {
    const data = req.body;
    addToList(state.tokenLaunches, data, MAX_ALERTS);
    io.emit('token:launch', data);
    console.log(`[API] Token launch: ${data.symbol || data.name || 'unknown'}`);
    res.json({ ok: true });
});

// MEV Bot posts opportunities
app.post('/api/mev/opportunity', (req, res) => {
    const data = req.body;
    addToList(state.mevOpportunities, data, MAX_ALERTS);
    io.emit('mev:opportunity', data);
    console.log(`[API] MEV opportunity: ${data.type || 'unknown'}`);
    res.json({ ok: true });
});

// Gas Optimizer posts updates
app.post('/api/gas/update', (req, res) => {
    const data = req.body;
    addToList(state.gasUpdates, data, MAX_ALERTS);
    io.emit('gas:update', data);
    res.json({ ok: true });
});

// Whale Observer posts alerts
app.post('/api/whale/alert', (req, res) => {
    const data = req.body;
    addToList(state.whaleAlerts, data, MAX_ALERTS);
    io.emit('whale:alert', data);
    console.log(`[API] Whale alert: ${data.type || 'unknown'}`);
    res.json({ ok: true });
});

// Get current state
app.get('/api/state', (_req, res) => {
    const agentList = Object.entries(state.agents).map(([name, info]) => ({
        name,
        ...info,
        isAlive: Date.now() - info.lastHeartbeat < 120000, // 2 min timeout
    }));

    res.json({
        uptime: Date.now() - state.startTime,
        agents: agentList,
        currentToken: state.currentToken,
        totalSignals: state.signals.length,
        totalAlerts: state.whaleAlerts.length,
        totalLaunches: state.tokenLaunches.length,
        totalMev: state.mevOpportunities.length,
        recentSignals: state.signals.slice(0, 10),
        recentAlerts: state.whaleAlerts.slice(0, 10),
    });
});

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: Date.now() - state.startTime,
        agents: Object.keys(state.agents).length,
        connections: io.engine.clientsCount,
        currentToken: state.currentToken,
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
    console.log('        🦆 DUCKMON WEBSOCKET SERVER v2.0');
    console.log('     Real-time Agent Broadcasting + Analysis');
    console.log('');
    console.log(sep);
    console.log('');
    console.log(`  Server:     http://localhost:${PORT}`);
    console.log(`  Health:     http://localhost:${PORT}/health`);
    console.log(`  WebSocket:  ws://localhost:${PORT}`);
    console.log('');
    console.log('  Agent REST API:');
    console.log(`    POST /api/signal            – Agent posts analysis signal`);
    console.log(`    POST /api/mev/opportunity    – MEV Bot posts opportunities`);
    console.log(`    POST /api/token/launch       – Token Launch posts new tokens`);
    console.log(`    POST /api/gas/update          – Gas Optimizer posts updates`);
    console.log(`    POST /api/whale/alert         – Whale Observer posts alerts`);
    console.log(`    POST /api/agent/heartbeat     – Agent heartbeat`);
    console.log(`     GET /api/state               – Get current state`);
    console.log('');
    console.log('  WebSocket Events (Frontend):');
    console.log(`    emit  token:analyze          – Request analysis for a token`);
    console.log(`    on    analysis:result         – Receive full analysis data`);
    console.log(`    on    signal                  – Receive agent signals`);
    console.log(`    on    whale:alert             – Receive whale alerts`);
    console.log(`    on    gas:update              – Receive gas updates`);
    console.log(`    on    agent:heartbeat         – Receive agent status`);
    console.log('');
    console.log(sep);
    console.log('');
});
