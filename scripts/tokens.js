const { ethers } = require("hardhat");

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

const WARS  = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const USDCe = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";

async function main() {
  const wars  = new ethers.Contract(WARS,  ERC20_ABI, ethers.provider);
  const usdce = new ethers.Contract(USDCe, ERC20_ABI, ethers.provider);
  const [me]  = await ethers.getSigners();

  const [nW, sW, dW] = await Promise.all([wars.name(), wars.symbol(), wars.decimals()]);
  const [nU, sU, dU] = await Promise.all([usdce.name(), usdce.symbol(), usdce.decimals()]);
  const [bW, bU]     = await Promise.all([wars.balanceOf(me.address), usdce.balanceOf(me.address)]);

  console.log("WARS:", nW, sW, "dec:", dW);
  console.log("USDC.e:", nU, sU, "dec:", dU);
  console.log("Signer:", me.address);
  console.log("Balance WARS:", bW.toString());
  console.log("Balance USDC.e:", bU.toString());
}

main().catch(console.error);