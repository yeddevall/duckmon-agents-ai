const hre = require("hardhat");

async function main() {
    console.log("");
    console.log("╔═══════════════════════════════════════╗");
    console.log("║  🦆 DUCKMON Agent Contract Deployer    ║");
    console.log("║  Deploying to Monad Mainnet           ║");
    console.log("╚═══════════════════════════════════════╝");
    console.log("");

    const [deployer] = await hre.ethers.getSigners();
    console.log("📍 Deployer:", deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("💰 Balance:", hre.ethers.formatEther(balance), "MON");
    console.log("");

    console.log("🔨 Deploying DuckmonAgent ($DUCKA)...");

    const DuckmonAgent = await hre.ethers.getContractFactory("DuckmonAgent");
    const contract = await DuckmonAgent.deploy();

    await contract.waitForDeployment();

    const address = await contract.getAddress();

    console.log("");
    console.log("✅ DuckmonAgent deployed!");
    console.log("📋 Contract Address:", address);
    console.log("");
    console.log("Add this to your .env:");
    console.log(`VITE_DUCK_SIGNALS_ADDRESS=${address}`);
    console.log("");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
