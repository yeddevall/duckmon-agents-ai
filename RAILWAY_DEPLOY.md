# 🚂 Railway Deployment Guide

## Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/duckmon-agents)

## Manual Deployment

### 1. Create New Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `duckmon-agents-ai` repository

### 2. Configure Environment Variables

Add these in Railway dashboard → Variables:

```env
# Required - Your wallet private key
PRIVATE_KEY=your_private_key_here

# Required - Gemini API for AI features
VITE_API_KEY=your_gemini_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Optional - Contract addresses (defaults provided)
DUCK_SIGNALS_ADDRESS=0x...
DUCK_TOKEN_ADDRESS=0x0862F464c8457266b66c58F1D7C1137B72647777
WMON_ADDRESS=0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701

# Optional - RPC (uses Monad public RPC by default)
RPC_URL=https://rpc.monad.xyz

# Optional - Agent intervals (in milliseconds)
ANALYSIS_INTERVAL=900000
WHALE_CHECK_INTERVAL=300000
MEV_SCAN_INTERVAL=1000
GAS_UPDATE_INTERVAL=10000
```

### 3. Deploy Settings

Railway will automatically:
- ✅ Detect Node.js
- ✅ Run `npm install`
- ✅ Execute `npm start` (runs all core agents)

### 4. Monitor Logs

Click "View Logs" to see:
- Agent startup messages
- Signal generations
- On-chain transactions
- Performance metrics

## Running Specific Agents

Edit `Procfile` to run specific agents:

```procfile
# Run only trading agents
web: npm run start:all

# Run only MEV suite
web: npm run mev-suite

# Run single agent
web: npm run whale-observer
```

## Resource Requirements

- **Memory**: 512MB minimum (recommended: 1GB)
- **CPU**: Shared OK (dedicated better for MEV bot)
- **Cost**: ~$5-10/month on Hobby plan

## Troubleshooting

### Build Fails

```bash
# Locally test the build
npm install
npm start
```

### Missing Dependencies

```bash
# Update lock file
npm install
git add package-lock.json
git commit -m "chore: update dependencies"
git push
```

### Environment Variables Not Set

Check Railway dashboard → Variables → Make sure all required vars are set

### Private Key Issues

- Never commit `.env` file
- Use Railway's secret variables
- Format: `0x...` (with 0x prefix)

## Health Checks

Railway will monitor:
- Process uptime
- Memory usage
- CPU usage
- Automatic restarts on failure

## Scaling

To run multiple agents separately:

1. Create separate Railway services
2. Each service runs one agent
3. Set different `Procfile` for each

Example multi-service setup:
- Service 1: Trading Oracle (`npm run trading-oracle`)
- Service 2: Whale Observer (`npm run whale-observer`)
- Service 3: MEV Suite (`npm run mev-suite`)

## Cost Optimization

**Free Tier** (500 hours/month):
- Run 1 service continuously
- Perfect for testing

**Hobby Plan** ($5/month):
- Unlimited services
- Better for production

## Support

- Railway Docs: https://docs.railway.app
- Discord: https://discord.gg/railway
- GitHub Issues: https://github.com/yeddevall/duckmon-agents-ai/issues

---

**⚡ Powered by Monad • 🚂 Deployed on Railway**
