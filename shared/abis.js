// Consolidated ABIs for all DUCKMON Agents

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
    {
        type: 'function',
        name: 'getProgress',
        inputs: [{ name: '_token', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'isGraduated',
        inputs: [{ name: '_token', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
    },
];

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
    {
        inputs: [{ name: 'count', type: 'uint256' }],
        name: 'getRecentSignals',
        outputs: [{
            name: '',
            type: 'tuple[]',
            components: [
                { name: 'agent', type: 'address' },
                { name: 'signalType', type: 'string' },
                { name: 'confidence', type: 'uint256' },
                { name: 'price', type: 'uint256' },
                { name: 'reason', type: 'string' },
                { name: 'timestamp', type: 'uint256' },
            ],
        }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'count', type: 'uint256' }],
        name: 'getRecentPredictions',
        outputs: [{
            name: '',
            type: 'tuple[]',
            components: [
                { name: 'agent', type: 'address' },
                { name: 'direction', type: 'string' },
                { name: 'confidence', type: 'uint256' },
                { name: 'referencePrice', type: 'uint256' },
                { name: 'targetTime', type: 'uint256' },
                { name: 'verified', type: 'bool' },
                { name: 'correct', type: 'bool' },
                { name: 'timestamp', type: 'uint256' },
            ],
        }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'agent', type: 'address' }],
        name: 'getAgentAccuracy',
        outputs: [
            { name: 'total', type: 'uint256' },
            { name: 'correct', type: 'uint256' },
            { name: 'accuracy', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];

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
    {
        type: 'event',
        name: 'Approval',
        inputs: [
            { name: 'owner', type: 'address', indexed: true },
            { name: 'spender', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false },
        ],
    },
];
