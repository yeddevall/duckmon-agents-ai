#!/usr/bin/env node

/**
 * DUCKMON Agent Orchestrator v2.0
 * Manages 7 agents with staggered starts, auto-restart, and health monitoring
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const agents = [
    { name: 'Trading Oracle',     path: 'trading-oracle',     delay: 0 },
    { name: 'Prediction Bot',     path: 'prediction-bot',     delay: 5000 },
    { name: 'Market Analyzer',    path: 'market-analyzer',    delay: 10000 },
    { name: 'Whale Observer',     path: 'whale-observer',     delay: 15000 },
    { name: 'Liquidity Sentinel', path: 'liquidity-sentinel', delay: 20000 },
    { name: 'Social Sentiment',   path: 'social-sentiment',   delay: 25000 },
    { name: 'On-Chain Analytics', path: 'onchain-analytics',  delay: 30000 },
];

const MAX_RESTART_DELAY = 300000; // 5 min max backoff
const INITIAL_RESTART_DELAY = 5000;
const HEALTH_CHECK_INTERVAL = 60000;

const agentProcesses = new Map();
const agentHealth = new Map();

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ${s % 60}s`;
}

function runAgent(agent) {
    const agentPath = path.join(__dirname, agent.path);
    const proc = spawn('node', ['index.js'], {
        cwd: agentPath,
        stdio: 'inherit',
        env: process.env,
    });

    const health = agentHealth.get(agent.name) || {
        restarts: 0,
        lastStart: Date.now(),
        lastCrash: null,
        status: 'STARTING',
        restartDelay: INITIAL_RESTART_DELAY,
    };
    health.status = 'RUNNING';
    health.lastStart = Date.now();
    agentHealth.set(agent.name, health);
    agentProcesses.set(agent.name, proc);

    proc.on('error', (err) => {
        console.error(`\x1b[31m[ORCH] ${agent.name} error: ${err.message}\x1b[0m`);
        health.status = 'ERROR';
    });

    proc.on('exit', (code) => {
        health.status = 'STOPPED';
        agentProcesses.delete(agent.name);

        if (code !== 0 && code !== null) {
            health.lastCrash = Date.now();
            health.restarts++;

            // Exponential backoff: 5s -> 10s -> 20s -> ... -> max 5min
            const delay = Math.min(health.restartDelay, MAX_RESTART_DELAY);
            console.log(`\x1b[33m[ORCH] ${agent.name} exited (code ${code}). Restarting in ${delay / 1000}s...\x1b[0m`);

            setTimeout(() => {
                console.log(`\x1b[36m[ORCH] Restarting ${agent.name} (attempt #${health.restarts + 1})...\x1b[0m`);
                runAgent(agent);
            }, delay);

            health.restartDelay = Math.min(delay * 2, MAX_RESTART_DELAY);
        } else {
            console.log(`\x1b[33m[ORCH] ${agent.name} stopped gracefully.\x1b[0m`);
        }
    });

    return proc;
}

function printStatus() {
    const sep = '═'.repeat(62);
    console.log(`\n\x1b[36m${sep}\x1b[0m`);
    console.log(`\x1b[36m  DUCKMON ORCHESTRATOR v2.0 - Agent Status\x1b[0m`);
    console.log(`\x1b[36m${sep}\x1b[0m`);

    for (const agent of agents) {
        const health = agentHealth.get(agent.name) || {};
        const isRunning = agentProcesses.has(agent.name);
        const statusIcon = isRunning ? '\x1b[32mRUN\x1b[0m' : '\x1b[31mOFF\x1b[0m';
        const uptime = health.lastStart ? formatUptime(Date.now() - health.lastStart) : 'N/A';
        const restarts = health.restarts || 0;

        console.log(`  [${statusIcon}] ${agent.name.padEnd(22)} | Up: ${uptime.padEnd(12)} | Restarts: ${restarts}`);
    }

    console.log(`\x1b[36m${sep}\x1b[0m`);
    console.log(`  Total: ${agentProcesses.size}/${agents.length} running | Uptime: ${formatUptime(Date.now() - startTime)}`);
    console.log(`\x1b[36m${sep}\x1b[0m\n`);
}

const startTime = Date.now();

async function main() {
    console.log(`
\x1b[36m╔══════════════════════════════════════════════════════════════╗
║           DUCKMON ORCHESTRATOR v2.0                           ║
║        Managing ${agents.length} Autonomous Trading Agents                  ║
║              Powered by Monad                                ║
╚══════════════════════════════════════════════════════════════╝\x1b[0m
    `);

    // Check if running specific agent
    const specificAgent = process.argv[2];

    if (specificAgent) {
        const agent = agents.find(a => a.path === specificAgent);
        if (agent) {
            console.log(`\x1b[36m[ORCH]\x1b[0m Starting single agent: ${agent.name}`);
            runAgent(agent);
            return;
        }
        console.error(`Unknown agent: ${specificAgent}`);
        console.log('Available:', agents.map(a => a.path).join(', '));
        process.exit(1);
    }

    // Staggered start: 5s between each agent (DexScreener rate limit protection)
    console.log(`\x1b[36m[ORCH]\x1b[0m Starting ${agents.length} agents with staggered launches...\n`);

    for (const agent of agents) {
        if (agent.delay > 0) {
            await new Promise(r => setTimeout(r, agent.delay - (agents[agents.indexOf(agent) - 1]?.delay || 0)));
        }
        console.log(`\x1b[32m[ORCH]\x1b[0m Launching ${agent.name}...`);
        runAgent(agent);
    }

    console.log(`\n\x1b[32m[ORCH]\x1b[0m All ${agents.length} agents launched!\n`);

    // Health monitoring
    setInterval(printStatus, HEALTH_CHECK_INTERVAL);

    // Initial status after all agents start
    setTimeout(printStatus, 35000);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\x1b[33m[ORCH] Shutting down all agents...\x1b[0m');
    for (const [name, proc] of agentProcesses) {
        console.log(`\x1b[33m[ORCH] Stopping ${name}...\x1b[0m`);
        proc.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 2000);
});

process.on('SIGTERM', () => {
    for (const [, proc] of agentProcesses) proc.kill('SIGTERM');
    setTimeout(() => process.exit(0), 2000);
});

main().catch(console.error);
