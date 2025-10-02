// scripts/price-and-impact.js
require("dotenv/config");
const { ethers } = require("hardhat");

const ROUTER = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // poné acá tu LockingV4Router (último deploy)
const WARS   = process.env.WARS;
const USDCE  = process.env.USDCE;

// ===== Helpers para leer precio desde logs (Initialize/Swap) =====
const PM = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33";
const PM_ABI = [
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int256 amount0, int256 amount1, uint160 sqrtPriceX96, int24 tick)"
];
const Q96  = 2n ** 96n;
const Q192 = Q96 * Q96;

function priceFromSqrt(sqrt, dec0=18, dec1=6) {
  const scale = 10n ** BigInt(dec0 - dec1 + 6); // 6 dec en salida
  const p6 = (sqrt*sqrt*scale)/Q192;
  return Number(p6)/1e6;
}

async function getCurrentPrice(provider) {
  const pm = new ethers.Contract(PM, PM_ABI, provider);
  const a0 = ethers.getAddress(WARS);
  const a1 = ethers.getAddress(USDCE);
  const [c0, c1] = a0.toLowerCase() < a1.toLowerCase() ? [a0,a1] : [a1,a0];

  const topicInit = pm.interface.getEvent("Initialize").topicHash;
  const topicSwap = pm.interface.getEvent("Swap").topicHash;
  const latest = await provider.getBlockNumber();

  const inits = await provider.getLogs({address: PM, fromBlock: Math.max(0, latest-100_000), toBlock: "latest", topics: [topicInit]});
  let poolId=null, sqrt=null, tick=null;
  for (const lg of inits.reverse()) {
    const dec = pm.interface.decodeEventLog("Initialize", lg.data, lg.topics);
    if (dec.currency0.toLowerCase()===c0.toLowerCase() && dec.currency1.toLowerCase()===c1.toLowerCase()){
      poolId = dec.id; sqrt = BigInt(dec.sqrtPriceX96); tick = Number(dec.tick); break;
    }
  }
  if (!poolId) throw new Error("No poolId");

  const swaps = await provider.getLogs({address: PM, fromBlock: Math.max(0, latest-100_000), toBlock: "latest", topics: [topicSwap, poolId]});
  if (swaps.length>0){
    const dec = pm.interface.decodeEventLog("Swap", swaps[swaps.length-1].data, swaps[swaps.length-1].topics);
    sqrt = BigInt(dec.sqrtPriceX96);
    tick = Number(dec.tick);
  }
  return { price: priceFromSqrt(sqrt,18,6), tick, sqrt };
}

async function main(){
  const [me] = await ethers.getSigners();
  const wars  = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)"], WARS, me);
  const usdce = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], USDCE, me);
  const router= await ethers.getContractAt("LockingV4Router", ROUTER, me);

  const show = async (label="")=>{
    const [bw,bu] = await Promise.all([wars.balanceOf(me.address), usdce.balanceOf(me.address)]);
    const {price,tick} = await getCurrentPrice(ethers.provider);
    console.log(`${label} Bal WARS:${bw} USDC.e:${bu} | Price WARS->USDC.e=${price} | tick=${tick}`);
  };

  // aprobar una vez por las dudas
  await (await wars.approve(ROUTER, ethers.MaxUint256)).wait();

  console.log("== estado inicial ==");
  await show("Before");

  // escalera de trades: sube gradualmente el tamaño para ver impacto
  const sizes = ["0.10", "0.20", "0.50"];
  for (const s of sizes){
    const amtIn = ethers.parseUnits(s,18);
    console.log(`-- swap ${s} WARS -> USDC.e --`);
    const tx = await router.swapExactInWARSForUSDCe(amtIn);
    await tx.wait();
    await show(`After ${s}`);
  }
}

main().catch(console.error);
