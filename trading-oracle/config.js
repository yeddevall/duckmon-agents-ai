// Monad Mainnet Configuration for Agents
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
            name: 'Monad Explorer',
            url: 'https://explorer.monad.xyz',
        },
    },
};

// Contract Addresses - Monad Mainnet
export const contracts = {
    DUCK_TOKEN: '0x0862F464c8457266b66c58F1D7C1137B72647777',
    LENS: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea',
    BONDING_CURVE_ROUTER: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22',
    DEX_ROUTER: '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137',
    WMON: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    // DuckSignals contract - UPDATE AFTER DEPLOYMENT
    DUCK_SIGNALS: process.env.DUCK_SIGNALS_ADDRESS || '0x0000000000000000000000000000000000000000',
};

// Lens ABI for price queries
export const LENS_ABI = [
    {
        type: 'function',
        name: 'getAmountOut',
        inputs: [
            { name: '_token', type: 'address' },
            { name: '_amountIn', type: 'uint256' },
            { name: '_isBuy', type: 'bool' },
        ],
        outputs: [
            { name: 'router', type: 'address' },
            { name: 'amountOut', type: 'uint256' },
        ],
        stateMutability: 'view',
    },
];

// DuckSignals ABI for blockchain integration
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
        inputs: [
            { name: 'direction', type: 'string' },
            { name: 'confidence', type: 'uint256' },
            { name: 'referencePrice', type: 'uint256' },
            { name: 'targetTime', type: 'uint256' },
        ],
        name: 'postPrediction',
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
