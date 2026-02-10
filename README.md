# 🦆 DUCKMON AI Agents v2.0

> Advanced AI-powered trading agents for Monad Blockchain - Leveraging 10K TPS & 400ms Blocks

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Monad](https://img.shields.io/badge/Monad-Mainnet-blue)](https://monad.xyz)

## 🌟 Overview

DUCKMON Agents v2.0 is a comprehensive suite of **AI-powered trading bots** and **intelligent agents** designed specifically for the Monad blockchain. By leveraging Monad's groundbreaking performance (10,000 TPS, 400ms block times, parallel execution), these agents provide institutional-grade market intelligence, MEV opportunities, and automated trading strategies.

### 🎯 Key Features

- **🧠 AI-Enhanced Analysis**: Google Gemini integration for advanced market predictions
- **⚡ Real-time Processing**: Leverages 400ms block times for near-instant decisions
- **🔒 Enterprise Security**: Rate limiting, input validation, risk management
- **📊 Multi-Strategy**: Technical analysis, whale tracking, MEV, arbitrage, and more
- **🤖 Autonomous Operation**: Self-managing agents with on-chain signal posting

---

## 🤖 Agent Suite

### Core Trading Agents

| Agent | Version | Purpose | Key Features |
|-------|---------|---------|--------------|
| **🦆 Trading Oracle** | v2.0 | Technical Analysis | RSI, MACD, Bollinger Bands, AI-enhanced signals |
| **🔮 Prediction Bot** | v2.0 | Price Forecasting | Multi-timeframe predictions (5m/15m/1h) |
| **📊 Market Analyzer** | v2.0 | Market Intelligence | Volatility, sentiment, fear/greed index |
| **🐋 Whale Observer** | v2.0 | Whale Tracking | AI-powered behavior analysis, real-time alerts |

### Advanced MEV & DeFi Agents

| Agent | Version | Purpose | Key Features |
|-------|---------|---------|--------------|
| **⚡ MEV Bot** | v1.0 | MEV Opportunities | Arbitrage, backrun, liquidation sniping |
| **🔄 Arbitrage Hunter** | v1.0 | Cross-DEX Arbitrage | Multi-DEX price monitoring |
| **🚀 Token Launch Detector** | v1.0 | New Token Discovery | Honeypot detection, safety scoring |
| **⛽ Gas Optimizer** | v1.0 | Gas Price Intelligence | Real-time gas tracking, predictions |

---

## 🧠 AI & Algorithms

### Trading Oracle (AI-Enhanced Technical Analysis)
Combines traditional indicators with AI insights:
- **Technical Indicators**: RSI(14), MACD(12,26,9), Bollinger Bands(20,2), VWAP, ATR
- **AI Analysis**: Market sentiment, support/resistance prediction, risk/reward ratios
- **Confidence Scoring**: Weighted multi-indicator consensus (50-95%)

### Whale Observer (AI Behavior Analysis)
Advanced on-chain whale tracking:
- **Pattern Recognition**: Accumulation, distribution, trading patterns
- **AI Intent Analysis**: Predicts whale intent and market impact
- **Real-time Alerts**: Sub-second detection using 400ms blocks
- **Network Intelligence**: Gas analysis, congestion monitoring

### MEV Bot (Maximal Extractable Value)
Sophisticated MEV strategy execution:
- **Arbitrage Detection**: Cross-DEX price discrepancies
- **Backrun Opportunities**: Profit from large swaps
- **Liquidation Sniping**: Monitor lending protocols
- **Risk Management**: Position sizing, slippage protection

### Token Launch Detector (Safety & Discovery)
Automated new token monitoring:
- **Real-time Scanning**: Detects new pairs/tokens instantly
- **Safety Scoring**: Multi-factor safety analysis (0-100)
- **Honeypot Detection**: Automated scam detection
- **Liquidity Analysis**: Lock verification, ownership checks

---

## 📦 Installation

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- Monad wallet with MON for gas

### Quick Start

```bash
# Clone the repository
git clone https://github.com/duckonmonad/duckmon-agents.git
cd duckmon-agents

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Install concurrently for multi-agent support
npm install
```

---

## ⚙️ Configuration

Create a `.env` file in the root directory:

```env
# ═══════════════════════════════════════════════════════════
# BLOCKCHAIN CONFIGURATION
# ═══════════════════════════════════════════════════════════

# Required: Your wallet private key (KEEP SECURE!)
PRIVATE_KEY=your_private_key_here

# Monad Network RPC (default: https://rpc.monad.xyz)
RPC_URL=https://rpc.monad.xyz

# ═══════════════════════════════════════════════════════════
# CONTRACT ADDRESSES (Monad Mainnet)
# ═══════════════════════════════════════════════════════════

DUCK_TOKEN_ADDRESS=0x0862F464c8457266b66c58F1D7C1137B72647777
DUCK_SIGNALS_ADDRESS=0x... # DuckSignals contract address
WMON_ADDRESS=0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701

# ═══════════════════════════════════════════════════════════
# AI CONFIGURATION (Optional - for enhanced analysis)
# ═══════════════════════════════════════════════════════════

# Google Gemini API Key (for AI features)
VITE_API_KEY=your_gemini_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# ═══════════════════════════════════════════════════════════
# AGENT SETTINGS
# ═══════════════════════════════════════════════════════════

# Update intervals (milliseconds)
ANALYSIS_INTERVAL=900000          # 15 minutes
WHALE_CHECK_INTERVAL=300000       # 5 minutes
MEV_SCAN_INTERVAL=1000            # 1 second
GAS_UPDATE_INTERVAL=10000         # 10 seconds

# Trading settings
MIN_CONFIDENCE_THRESHOLD=60       # Minimum confidence for signals
MAX_SLIPPAGE=0.5                 # Maximum slippage (%)
MAX_GAS_PRICE=100                # Maximum gas price (gwei)

# Risk management
MAX_POSITION_SIZE_USD=5000       # Maximum trade size
STOP_LOSS_PERCENT=5              # Stop loss percentage
```

---

## 🚀 Usage

### Run All Core Agents
```bash
npm start
```

### Run Specific Agents

```bash
# Core Trading Agents
npm run trading-oracle      # Technical analysis
npm run prediction-bot      # Price predictions
npm run market-analyzer     # Market intelligence
npm run whale-observer      # Whale tracking

# MEV & Advanced Agents
npm run mev-bot            # MEV opportunities
npm run token-launch-detector  # New token discovery
npm run gas-optimizer      # Gas price monitoring

# Run MEV Suite (all MEV agents)
npm run mev-suite

# Run all agents concurrently
npm run start:all
```

### Custom Configuration

```bash
# Run with custom token
TOKEN_ADDRESS=0x... npm run trading-oracle

# Run with custom interval
ANALYSIS_INTERVAL=600000 npm run market-analyzer

# Run in read-only mode (no private key needed)
# Simply don't set PRIVATE_KEY in .env
npm run gas-optimizer
```

---

## 📁 Project Structure

```
duckmon-agents-ai/
├── 📂 trading-oracle/          # AI-enhanced technical analysis
│   ├── index.js
│   └── config.js
├── 📂 prediction-bot/          # Price prediction engine
│   ├── index.js
│   └── config.js
├── 📂 market-analyzer/         # Market health monitoring
│   ├── index.js
│   └── config.js
├── 📂 whale-observer/          # AI-powered whale tracking
│   ├── index.js
│   └── config.js
├── 📂 mev-bot/                 # MEV opportunity hunter
│   ├── index.js
│   └── config.js
├── 📂 token-launch-detector/   # New token discovery
│   ├── index.js
│   └── config.js
├── 📂 gas-optimizer/           # Gas price intelligence
│   ├── index.js
│   └── config.js
├── 📂 shared/                  # Shared utilities
│   ├── aiModule.js            # AI integration
│   └── security.js            # Security utilities
├── 📂 contracts/               # Smart contract ABIs
├── index.mjs                  # Main orchestrator
├── package.json
└── README.md
```

---

## 🔐 Security Features

### Input Validation
- Ethereum address validation
- Private key format checking
- Input sanitization

### Rate Limiting
- API rate limiting (100 req/min)
- Transaction rate limiting (10 tx/min)
- Prevents abuse and spam

### Risk Management
- Position size limits
- Slippage protection
- Stop-loss mechanisms
- Multi-factor risk scoring

### Transaction Security
- Gas limit buffering
- Transaction simulation
- Nonce management
- Revert protection

### Honeypot Detection
- Contract analysis
- Ownership checks
- Liquidity verification
- Function analysis

---

## 🌐 Monad Network Advantages

### Why Monad?

| Feature | Monad | Ethereum | Advantage |
|---------|-------|----------|-----------|
| **Throughput** | 10,000 TPS | ~15 TPS | 666x faster |
| **Block Time** | 400ms | 12s | 30x faster |
| **Finality** | 800ms | 12-15 min | 900x faster |
| **Parallel Execution** | ✅ Yes | ❌ No | Multi-strategy execution |

### How We Leverage Monad

1. **Real-time Whale Tracking**: 400ms blocks enable near-instant whale detection
2. **High-frequency MEV**: Execute multiple strategies per second
3. **Parallel Agent Execution**: Run multiple agents simultaneously
4. **Instant Arbitrage**: Capitalize on price discrepancies in <1 second
5. **Gas Optimization**: Monitor and predict gas with 10-second granularity

---

## 📊 Performance & Metrics

Each agent tracks and displays:
- **Total Signals/Trades**: Number of signals generated
- **Success Rate**: Percentage of profitable trades
- **Confidence Scores**: Average confidence of signals
- **Uptime**: Continuous operation time
- **Profitability**: Net profit/loss (for trading agents)

Example output:
```
╔══════════════════════════════════════════════════════════════════╗
║                    ⚡ MEV BOT STATUS                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Opportunities:    247                                           ║
║  Executed Trades:  32                                            ║
║  Success Rate:     87.5%                                         ║
║  Net Profit:       $1,247.50                                     ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 🔗 Integration

### On-chain Signal Posting

All agents can post signals to the **DuckSignals** smart contract:

```javascript
Agent → Analysis → Generate Signal → Post to DuckSignals → Frontend Display
```

### Frontend Integration

Signals are readable via standard wagmi hooks:

```typescript
const { data: signals } = useReadContract({
  address: DUCK_SIGNALS_ADDRESS,
  abi: DuckSignalsABI,
  functionName: 'getLatestSignals',
});
```

---

## ⚠️ Disclaimer & Risk Warning

### Important Notices

⚠️ **This software is provided "AS IS" for educational and research purposes.**

- **Financial Risk**: Trading cryptocurrencies involves substantial risk of loss
- **No Guarantees**: Past performance does not guarantee future results
- **MEV Risk**: MEV strategies can fail and result in losses
- **Smart Contract Risk**: Blockchain transactions are irreversible
- **Security**: Always use a dedicated wallet, never your main wallet
- **Testing**: Test thoroughly on testnet before mainnet use

### Best Practices

✅ **DO**:
- Start with small amounts
- Test on testnet first
- Monitor agents regularly
- Use stop-losses
- Keep private keys secure
- Update dependencies regularly

❌ **DON'T**:
- Invest more than you can afford to lose
- Share your private keys
- Run untested code in production
- Ignore risk warnings
- Use your main wallet

---

## 🛠️ Development

### Adding Custom Agents

1. Create agent directory: `mkdir my-agent`
2. Add `config.js` and `index.js`
3. Import shared utilities:
```javascript
import AI from '../shared/aiModule.js';
import Security from '../shared/security.js';
```
4. Add to `package.json` scripts
5. Update orchestrator if needed

### Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

**Use at your own risk. No warranties provided.**

---

## 🔗 Links

- **Monad Network**: [https://monad.xyz](https://monad.xyz)
- **Monad Docs**: [https://docs.monad.xyz](https://docs.monad.xyz)
- **MonadVision Explorer**: [https://monadvision.com](https://monadvision.com)
- **Duck on Monad**: [https://duck-on-monad.vercel.app](https://duck-on-monad.vercel.app)

---

## 💬 Support

For questions and support:
- Open an issue on GitHub
- Join Monad Discord
- Check documentation

---

## 🎉 Acknowledgments

- **Monad Team** - For building the fastest EVM blockchain
- **Google Gemini** - For AI capabilities
- **Viem** - For excellent blockchain utilities
- **DuckMon Community** - For testing and feedback

---

**Built with ❤️ for the Monad ecosystem**

*Leveraging 10,000 TPS • 400ms Blocks • Parallel Execution*
