// Monad Mainnet Configuration for MEV Bot
export const monadMainnet = {
    id: 143,
    name: 'Monad',
    network: 'monad',
    nativeCurrency: {
        decimals: 18,
        name: 'MON',
        symbol: 'MON',
    },
    rpcUrls: {
        default: {
            http: ['https://rpc.monad.xyz'],
        },
        public: {
            http: ['https://rpc.monad.xyz'],
        },
    },
    blockExplorers: {
        default: {
            name: 'MonadVision',
            url: 'https://monadvision.com',
        },
    },
};

// Contract Addresses
export const contracts = {
    DUCK_TOKEN: '0x0862F464c8457266b66c58F1D7C1137B72647777',
    WMON: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    DUCK_SIGNALS: process.env.DUCK_SIGNALS_ADDRESS || '0x0000000000000000000000000000000000000000',

    // DEX Routers - Add real addresses when available
    UNISWAP_V2_ROUTER: '0x0000000000000000000000000000000000000001',
    SUSHISWAP_ROUTER: '0x0000000000000000000000000000000000000002',
};

// MEV Configuration
export const MEV_CONFIG = {
    // Minimum profit threshold (in USD)
    MIN_PROFIT_USD: 10,

    // Maximum gas price willing to pay (in gwei)
    MAX_GAS_PRICE: 100,

    // Slippage tolerance
    MAX_SLIPPAGE: 0.5, // 0.5%

    // Monitoring interval (leverage 400ms blocks)
    MEMPOOL_SCAN_INTERVAL: 500, // 500ms - slightly above block time
    OPPORTUNITY_CHECK_INTERVAL: 1000, // 1 second

    // Transaction limits
    MAX_PENDING_TXS: 5,
    TX_TIMEOUT: 30000, // 30 seconds

    // MEV strategies enabled
    STRATEGIES: {
        SANDWICH: true,          // Sandwich attacks (ethical trading)
        FRONTRUN: false,         // Disabled by default (ethical concerns)
        BACKRUN: true,           // Backrunning opportunities
        ARBITRAGE: true,         // Cross-DEX arbitrage
        LIQUIDATION: true,       // Liquidation sniping
    },

    // Risk management
    MAX_POSITION_SIZE: 1000,     // Max USD per trade
    STOP_LOSS_PERCENT: 5,        // 5% stop loss
};

// Standard ERC20 ABI
export const ERC20_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'approve',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'allowance',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
        ],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
];

// DEX Router ABI (simplified)
export const ROUTER_ABI = [
    {
        type: 'function',
        name: 'getAmountsOut',
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            { name: 'path', type: 'address[]' }
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'swapExactTokensForTokens',
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMin', type: 'uint256' },
            { name: 'path', type: 'address[]' },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' }
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'nonpayable',
    },
];

// DuckSignals ABI
export const DUCK_SIGNALS_ABI = [
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'registerAgent',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'signalType', type: 'string' },
            { name: 'confidence', type: 'uint256' },
            { name: 'price', type: 'uint256' },
            { name: 'reason', type: 'string' },
        ],
        name: 'postSignal',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
];
