#!/usr/bin/env node

/**
 * DUCKMON Agent Orchestrator
 * Runs all trading agents in parallel
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const agents = [
    { name: 'Trading Oracle', path: 'trading-oracle' },
    { name: 'Prediction Bot', path: 'prediction-bot' },
    { name: 'Market Analyzer', path: 'market-analyzer' }
];

console.log('🦆 DUCKMON Agent Orchestrator');
console.log('==============================\n');

function runAgent(agent) {
    console.log(`🚀 Starting ${agent.name}...`);

    const agentPath = path.join(__dirname, agent.path);
    const proc = spawn('node', ['index.js'], {
        cwd: agentPath,
        stdio: 'inherit',
        env: process.env
    });

    proc.on('error', (err) => {
        console.error(`❌ ${agent.name} error:`, err.message);
    });

    proc.on('exit', (code) => {
        if (code !== 0) {
            console.log(`⚠️ ${agent.name} exited with code ${code}`);
        }
    });

    return proc;
}

// Check if running specific agent
const specificAgent = process.argv[2];

if (specificAgent) {
    const agent = agents.find(a => a.path === specificAgent);
    if (agent) {
        runAgent(agent);
    } else {
        console.error(`Unknown agent: ${specificAgent}`);
        console.log('Available agents:', agents.map(a => a.path).join(', '));
        process.exit(1);
    }
} else {
    // Run all agents
    console.log('Starting all agents...\n');
    agents.forEach(runAgent);
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down agents...');
    process.exit(0);
});
