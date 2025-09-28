const { ethers } = require("hardhat");

// Direcciones World Chain
const POOLMANAGER = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33";
const WARS  = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const USDCe = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const F = await ethers.getContractFactory("LockingV4Router");
  const r = await F.deploy(POOLMANAGER, WARS, USDCe);
  await r.waitForDeployment();

  console.log("LockingV4Router:", await r.getAddress());
}

main().catch(console.error);
