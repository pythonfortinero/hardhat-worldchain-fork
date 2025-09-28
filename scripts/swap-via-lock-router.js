const { ethers } = require("hardhat");

const WARS   = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const USDCe  = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";
const ROUTER = "0xB0D4afd8879eD9F52b28595d31B441D079B2Ca07"; // LockingV4Router desplegado

const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)"
];

async function main() {
  const [me] = await ethers.getSigners();
  const wars  = new ethers.Contract(WARS,  ERC20_ABI, me);
  const usdce = new ethers.Contract(USDCe, ERC20_ABI, ethers.provider);

  // Cantidad a vender
  const amountIn = ethers.parseUnits("0.1", 18); // 0.1 WARS

  // 1) Approve al ROUTER (este es distinto al approve que hiciste al PoolManager)
  const alw = await wars.allowance(me.address, ROUTER);
  if (alw < amountIn) {
    const txA = await wars.approve(ROUTER, ethers.MaxUint256);
    await txA.wait();
  }

  // 2) Balances antes
  const [bw0, bu0] = await Promise.all([
    wars.balanceOf(me.address),
    usdce.balanceOf(me.address),
  ]);
  console.log("Before  WARS:", bw0.toString(), " USDC.e:", bu0.toString());

  // 3) Llamar al router con lock
  const router = await ethers.getContractAt("LockingV4Router", ROUTER);
  try {
    const tx = await router.swapExactInWARSForUSDCe(amountIn);
    const rc = await tx.wait();
    console.log("Swap tx:", rc.hash);
  } catch (e) {
    console.log("Swap revert (si pasa, te digo cómo ajustar):");
    console.log((e?.shortMessage || e?.message || e).toString());
  }

  // 4) Balances después
  const [bw1, bu1] = await Promise.all([
    wars.balanceOf(me.address),
    usdce.balanceOf(me.address),
  ]);
  console.log("After   WARS:", bw1.toString(), " USDC.e:", bu1.toString());
}

main().catch(console.error);
