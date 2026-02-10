import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    🔌 DUCKMON AGENTS WEBSOCKET SERVER                        ║
// ║              Real-time Agent Data Broadcasting                               ║
// ║                           Powered by Socket.IO                                ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const app = express();
const httpServer = createServer(app);

// Socket.IO setup with CORS
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Middleware
app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════════════════════════════════════════
// SHARED STATE (from agents)
// ══════════════════════════════════════════════════════════════════════════════

const sharedState = {
    mevOpportunities: [],
    tokenLaunches: [],
    gasUpdates: [],
    whaleAlerts: [],
    agentStatus: {
        'mev-bot': { running: false, lastUpdate: null },
        'token-launch-detector': { running: false, lastUpdate: null },
        'gas-optimizer': { running: false, lastUpdate: null },
        'whale-observer': { running: false, lastUpdate: null },
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// REST API ENDPOINTS (for agents to post data)
// ══════════════════════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        connectedClients: io.engine.clientsCount,
        agentStatus: sharedState.agentStatus,
    });
});

// MEV Bot posts opportunity
app.post('/api/mev/opportunity', (req, res) => {
    const opportunity = {
        ...req.body,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
    };

    sharedState.mevOpportunities.unshift(opportunity);
    sharedState.mevOpportunities = sharedState.mevOpportunities.slice(0, 50);

    // Broadcast to all connected clients
    io.emit('mev-opportunity', opportunity);

    console.log(`[MEV] New opportunity: ${opportunity.type} - $${opportunity.profit}`);
    res.json({ success: true, id: opportunity.id });
});

// Token Launch Detector posts new token
app.post('/api/token/launch', (req, res) => {
    const launch = {
        ...req.body,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
    };

    sharedState.tokenLaunches.unshift(launch);
    sharedState.tokenLaunches = sharedState.tokenLaunches.slice(0, 50);

    // Broadcast to all connected clients
    io.emit('token-launch', launch);

    console.log(`[TOKEN] New launch: ${launch.tokenSymbol} - Safety: ${launch.safetyScore}/100`);
    res.json({ success: true, id: launch.id });
});

// Gas Optimizer posts update
app.post('/api/gas/update', (req, res) => {
    const gasUpdate = {
        ...req.body,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
    };

    sharedState.gasUpdates.unshift(gasUpdate);
    sharedState.gasUpdates = sharedState.gasUpdates.slice(0, 50);

    // Broadcast to all connected clients
    io.emit('gas-update', gasUpdate);

    console.log(`[GAS] Update: ${gasUpdate.currentGas.toFixed(1)} gwei - ${gasUpdate.recommendation}`);
    res.json({ success: true, id: gasUpdate.id });
});

// Whale Observer posts alert
app.post('/api/whale/alert', (req, res) => {
    const alert = {
        ...req.body,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
    };

    sharedState.whaleAlerts.unshift(alert);
    sharedState.whaleAlerts = sharedState.whaleAlerts.slice(0, 50);

    // Broadcast to all connected clients
    io.emit('whale-alert', alert);

    console.log(`[WHALE] Alert: ${alert.type} - ${alert.wallet}`);
    res.json({ success: true, id: alert.id });
});

// Agent heartbeat (to track status)
app.post('/api/agent/heartbeat', (req, res) => {
    const { agentId } = req.body;

    if (sharedState.agentStatus[agentId]) {
        sharedState.agentStatus[agentId] = {
            running: true,
            lastUpdate: Date.now(),
        };

        io.emit('agent-status', sharedState.agentStatus);
    }

    res.json({ success: true });
});

// Get current state (for initial load)
app.get('/api/state', (req, res) => {
    res.json({
        mevOpportunities: sharedState.mevOpportunities.slice(0, 10),
        tokenLaunches: sharedState.tokenLaunches.slice(0, 10),
        gasUpdates: sharedState.gasUpdates.slice(0, 10),
        whaleAlerts: sharedState.whaleAlerts.slice(0, 10),
        agentStatus: sharedState.agentStatus,
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// WEBSOCKET EVENTS
// ══════════════════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Send initial state
    socket.emit('initial-state', {
        mevOpportunities: sharedState.mevOpportunities.slice(0, 10),
        tokenLaunches: sharedState.tokenLaunches.slice(0, 10),
        gasUpdates: sharedState.gasUpdates.slice(0, 10),
        whaleAlerts: sharedState.whaleAlerts.slice(0, 10),
        agentStatus: sharedState.agentStatus,
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });

    // Client can request current state
    socket.on('request-state', () => {
        socket.emit('initial-state', {
            mevOpportunities: sharedState.mevOpportunities.slice(0, 10),
            tokenLaunches: sharedState.tokenLaunches.slice(0, 10),
            gasUpdates: sharedState.gasUpdates.slice(0, 10),
            whaleAlerts: sharedState.whaleAlerts.slice(0, 10),
            agentStatus: sharedState.agentStatus,
        });
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// AGENT STATUS CHECKER (mark offline if no heartbeat)
// ══════════════════════════════════════════════════════════════════════════════

setInterval(() => {
    const now = Date.now();
    let statusChanged = false;

    Object.keys(sharedState.agentStatus).forEach(agentId => {
        const agent = sharedState.agentStatus[agentId];
        if (agent.lastUpdate && now - agent.lastUpdate > 60000) {
            // No heartbeat for 1 minute
            if (agent.running) {
                agent.running = false;
                statusChanged = true;
                console.log(`[STATUS] ${agentId} marked as offline`);
            }
        }
    });

    if (statusChanged) {
        io.emit('agent-status', sharedState.agentStatus);
    }
}, 30000); // Check every 30 seconds

// ══════════════════════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║              🔌 DUCKMON WEBSOCKET SERVER v1.0                                ║
║                  Real-time Agent Broadcasting                                ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Server:      http://localhost:${PORT}                                          ║
║  Health:      http://localhost:${PORT}/health                                   ║
║  WebSocket:   ws://localhost:${PORT}                                            ║
║                                                                              ║
║  Endpoints:                                                                  ║
║    POST /api/mev/opportunity        - MEV Bot posts opportunities            ║
║    POST /api/token/launch           - Token Launch posts new tokens          ║
║    POST /api/gas/update             - Gas Optimizer posts updates            ║
║    POST /api/whale/alert            - Whale Observer posts alerts            ║
║    POST /api/agent/heartbeat        - Agent heartbeat                        ║
║    GET  /api/state                  - Get current state                      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
});

export default app;
