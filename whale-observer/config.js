// Monad Mainnet Configuration for Whale Observer
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

// Contract Addresses - Monad Mainnet
export const contracts = {
    DUCK_TOKEN: '0x0862F464c8457266b66c58F1D7C1137B72647777',
    WMON: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    DUCK_SIGNALS: process.env.DUCK_SIGNALS_ADDRESS || '0x0000000000000000000000000000000000000000',
};

// Token Metadata
export const TOKENS = {
    DUCK: {
        address: contracts.DUCK_TOKEN,
        symbol: 'DUCK',
        name: 'Duck on Monad',
        decimals: 18,
        totalSupply: 1_000_000_000, // 1B tokens
    },
    WMON: {
        address: contracts.WMON,
        symbol: 'WMON',
        name: 'Wrapped Monad',
        decimals: 18,
    },
};

// Whale Thresholds
export const WHALE_CONFIG = {
    // Minimum balance to be considered a whale (% of supply)
    DUCK_WHALE_THRESHOLD: 0.5, // 0.5% of supply = 5M tokens

    // Alert thresholds
    LARGE_TRANSFER_THRESHOLD: 0.1, // 0.1% of supply = 1M tokens
    MEGA_TRANSFER_THRESHOLD: 0.5, // 0.5% of supply = 5M tokens

    // Monitoring intervals
    BALANCE_CHECK_INTERVAL: 300000, // 5 minutes
    NETWORK_CHECK_INTERVAL: 60000, // 1 minute

    // Top holders to track
    TOP_HOLDERS_COUNT: 20,
};

// ERC20 ABI for balance queries
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
        name: 'totalSupply',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'decimals',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'symbol',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'Transfer',
        inputs: [
            { name: 'from', type: 'address', indexed: true },
            { name: 'to', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false },
        ],
    },
];

// DuckSignals ABI for posting alerts
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
    {
        inputs: [{ name: 'agent', type: 'address' }],
        name: 'agents',
        outputs: [
            { name: 'name', type: 'string' },
            { name: 'totalSignals', type: 'uint256' },
            { name: 'totalPredictions', type: 'uint256' },
            { name: 'correctPredictions', type: 'uint256' },
            { name: 'lastActive', type: 'uint256' },
            { name: 'isRegistered', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
