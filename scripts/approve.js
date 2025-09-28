const { ethers } = require("hardhat");

// Direcciones en World Chain
const WARS = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const POOLMANAGER = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33"; // PoolManager v4

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
];

async function main() {
  const [me] = await ethers.getSigners();
  const token = new ethers.Contract(WARS, ERC20_ABI, me);

  const sym = await token.symbol();
  const before = await token.allowance(me.address, POOLMANAGER);
  console.log(`Allowance antes (${sym} -> PoolManager):`, before.toString());

  const tx = await token.approve(POOLMANAGER, ethers.MaxUint256);
  await tx.wait();
  console.log("Approve tx:", tx.hash);

  const after = await token.allowance(me.address, POOLMANAGER);
  console.log(`Allowance después (${sym} -> PoolManager):`, after.toString());
}

main().catch(console.error);
