// Structured Logging Module for DUCKMON Agents

const COLORS = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
};

const SIGNAL_COLORS = {
    BUY: COLORS.green,
    SELL: COLORS.red,
    HOLD: COLORS.yellow,
};

function timestamp() {
    return new Date().toISOString().slice(11, 19);
}

export function createLogger(agentName) {
    const prefix = `[${agentName}]`;

    return {
        info: (msg) =>
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.cyan}${prefix} [INFO]${COLORS.reset} ${msg}`),

        success: (msg) =>
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.green}${prefix} [OK]${COLORS.reset} ${msg}`),

        warning: (msg) =>
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.yellow}${prefix} [WARN]${COLORS.reset} ${msg}`),

        error: (msg) =>
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.red}${prefix} [ERR]${COLORS.reset} ${msg}`),

        signal: (type, msg) => {
            const color = SIGNAL_COLORS[type] || COLORS.white;
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${color}${prefix} [${type}]${COLORS.reset} ${msg}`);
        },

        whale: (msg) =>
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}${prefix} [WHALE]${COLORS.reset} ${msg}`),

        network: (msg) =>
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}${prefix} [NET]${COLORS.reset} ${msg}`),

        ai: (msg) =>
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}${prefix} [AI]${COLORS.reset} ${msg}`),

        predict: (dir, msg) => {
            const arrow = dir === 'UP' ? '\x1b[32m' : dir === 'DOWN' ? '\x1b[31m' : '\x1b[33m';
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${arrow}${prefix} [${dir}]${COLORS.reset} ${msg}`);
        },

        alert: (level, msg) => {
            const colors = { CRITICAL: COLORS.red, WARNING: COLORS.yellow, INFO: COLORS.cyan };
            console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${colors[level] || COLORS.white}${prefix} [${level}]${COLORS.reset} ${msg}`);
        },

        separator: () => console.log('═'.repeat(70)),

        banner: (title, subtitle) => {
            const sep = '═'.repeat(70);
            console.log(`\n${sep}`);
            console.log(`  ${title}`);
            if (subtitle) console.log(`  ${subtitle}`);
            console.log(sep);
        },
    };
}

// Utility formatting functions
export function formatPrice(price) {
    return price.toFixed(8);
}

export function formatNumber(num) {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
}

export function formatAddress(addr) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

export function getHealthBar(health) {
    const filled = Math.round(health / 10);
    const empty = 10 - filled;
    const color = health >= 70 ? COLORS.green : health >= 40 ? COLORS.yellow : COLORS.red;
    return `${color}${'█'.repeat(filled)}${'░'.repeat(empty)}${COLORS.reset}`;
}
