require("dotenv/config");
const { ethers } = require("hardhat");

const PM = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33"; // tu PoolManager

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const F = await ethers.getContractFactory("PMProbe");
  const p = await F.deploy(PM);
  await p.waitForDeployment();
  console.log("PMProbe:", await p.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
