const { ethers } = require("hardhat");

const WARS   = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const USDCe  = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";
const ROUTER = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // <- tu router desplegado

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

  // 1) Approve al ROUTER (ojo: antes aprobaste al PoolManager; ahora hace falta al Router)
  const need = ethers.parseUnits("1.0", 18); // vamos a intentar 1 WARS
  const beforeAlw = await wars.allowance(me.address, ROUTER);
  if (beforeAlw < need) {
    const txA = await wars.approve(ROUTER, ethers.MaxUint256);
    await txA.wait();
  }

  // 2) Balances antes
  const [bw0, bu0] = await Promise.all([
    wars.balanceOf(me.address),
    usdce.balanceOf(me.address),
  ]);
  console.log("Before  WARS:", bw0.toString(), " USDC.e:", bu0.toString());

  // 3) Llamar al router
  const router = await ethers.getContractAt("SimpleV4Router", ROUTER);
  try {
    const tx = await router.swapExactInWARSForUSDCe(need);
    const rc = await tx.wait();
    console.log("Swap tx:", rc.hash);
  } catch (e) {
    console.log("Swap revert (posible falta de settlement v4):");
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
