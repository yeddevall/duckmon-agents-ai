/**
 * DUCKMON WEBSOCKET SERVER v1.0
 * Real-time Agent Broadcasting
 *
 * Provides REST API endpoints for agents and WebSocket for real-time clients.
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;

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
    startTime: Date.now(),
};

const MAX_ITEMS = 100;
const MAX_ALERTS = 50;

function addToList(list, item, max = MAX_ITEMS) {
    list.unshift({ ...item, receivedAt: Date.now() });
    if (list.length > max) list.length = max;
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
    console.log('        🦆 DUCKMON WEBSOCKET SERVER v1.0');
    console.log('           Real-time Agent Broadcasting');
    console.log('');
    console.log(sep);
    console.log('');
    console.log(`  Server:     http://localhost:${PORT}`);
    console.log(`  Health:     http://localhost:${PORT}/health`);
    console.log(`  WebSocket:  ws://localhost:${PORT}`);
    console.log('');
    console.log('  Endpoints:');
    console.log(`    POST /api/mev/opportunity   – MEV Bot posts opportunities`);
    console.log(`    POST /api/token/launch      – Token Launch posts new tokens`);
    console.log(`    POST /api/gas/update         – Gas Optimizer posts updates`);
    console.log(`    POST /api/whale/alert        – Whale Observer posts alerts`);
    console.log(`    POST /api/agent/heartbeat    – Agent heartbeat`);
    console.log(`     GET /api/state              – Get current state`);
    console.log('');
    console.log(sep);
    console.log('');
});
