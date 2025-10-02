// scripts/deploy-liquidity-manager.js
require("dotenv/config");
const { ethers } = require("hardhat");

// PoolManager (World Chain, mismo que usamos antes)
const PM = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33";

// Tokens desde tu .env (ya los tenés definidos)
const WARS  = process.env.WARS;
const USDCE = process.env.USDCE;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("PM:", PM);
  console.log("WARS:", WARS);
  console.log("USDC.e:", USDCE);

  const Factory = await ethers.getContractFactory("LiquidityManagerV4");
  const mgr = await Factory.deploy(PM, WARS, USDCE);
  await mgr.waitForDeployment();
  console.log("LiquidityManagerV4:", await mgr.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
