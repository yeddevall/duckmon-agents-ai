// WebSocket Client for Agents
// Agents use this to send data to the WebSocket server

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const SERVER_URL = process.env.WEBSOCKET_SERVER_URL || 'http://localhost:3001';

const log = {
    info: (msg) => console.log(`\x1b[36m[WS]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[WS]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[WS]\x1b[0m ${msg}`),
};

/**
 * Send MEV opportunity to server
 */
export async function sendMEVOpportunity(opportunity) {
    try {
        const response = await fetch(`${SERVER_URL}/api/mev/opportunity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opportunity),
        });

        if (response.ok) {
            log.success('MEV opportunity sent');
            return true;
        }
    } catch (error) {
        log.error(`Failed to send MEV: ${error.message}`);
    }
    return false;
}

/**
 * Send token launch to server
 */
export async function sendTokenLaunch(launch) {
    try {
        const response = await fetch(`${SERVER_URL}/api/token/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(launch),
        });

        if (response.ok) {
            log.success(`Token launch sent: ${launch.tokenSymbol}`);
            return true;
        }
    } catch (error) {
        log.error(`Failed to send token: ${error.message}`);
    }
    return false;
}

/**
 * Send gas update to server
 */
export async function sendGasUpdate(gasUpdate) {
    try {
        const response = await fetch(`${SERVER_URL}/api/gas/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gasUpdate),
        });

        if (response.ok) {
            log.success(`Gas update sent: ${gasUpdate.currentGas.toFixed(1)} gwei`);
            return true;
        }
    } catch (error) {
        log.error(`Failed to send gas: ${error.message}`);
    }
    return false;
}

/**
 * Send whale alert to server
 */
export async function sendWhaleAlert(alert) {
    try {
        const response = await fetch(`${SERVER_URL}/api/whale/alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(alert),
        });

        if (response.ok) {
            log.success(`Whale alert sent: ${alert.type}`);
            return true;
        }
    } catch (error) {
        log.error(`Failed to send whale: ${error.message}`);
    }
    return false;
}

/**
 * Send agent heartbeat
 */
export async function sendHeartbeat(agentId) {
    try {
        const response = await fetch(`${SERVER_URL}/api/agent/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId }),
        });

        return response.ok;
    } catch (error) {
        // Silent fail for heartbeat
        return false;
    }
}

/**
 * Send trading signal/analysis result to server
 * Used by agents to post analysis for any token
 */
export async function sendSignal(signal) {
    try {
        const response = await fetch(`${SERVER_URL}/api/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signal),
        });

        if (response.ok) {
            log.success(`Signal sent: ${signal.agentName} → ${signal.type} (${signal.tokenSymbol || 'DUCK'})`);
            return true;
        }
    } catch (error) {
        log.error(`Failed to send signal: ${error.message}`);
    }
    return false;
}

/**
 * Start heartbeat interval for an agent
 */
export function startHeartbeat(agentId, intervalMs = 30000) {
    log.info(`Starting heartbeat for ${agentId}`);

    // Send initial heartbeat
    sendHeartbeat(agentId);

    // Send periodic heartbeats
    const interval = setInterval(() => {
        sendHeartbeat(agentId);
    }, intervalMs);

    return () => clearInterval(interval);
}

export default {
    sendMEVOpportunity,
    sendTokenLaunch,
    sendGasUpdate,
    sendWhaleAlert,
    sendSignal,
    sendHeartbeat,
    startHeartbeat,
};
