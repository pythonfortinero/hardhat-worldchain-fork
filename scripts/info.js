const { ethers } = require("hardhat");

async function main() {
  const bn = await ethers.provider.getBlockNumber();
  const net = await ethers.provider.getNetwork();
  console.log("ChainId:", net.chainId.toString());
  console.log("Block:", bn);
}
main().catch(console.error);