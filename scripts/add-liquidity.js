// scripts/add-liquidity.js
require("dotenv/config");
const { ethers } = require("hardhat");

// === Direcciones ===
const PM   = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33";               // PoolManager (World Chain)
const MGR  = "0xBEc49fA140aCaA83533fB00A2BB19bDdd0290f25";               // <- tu LiquidityManagerV4
const WARS = process.env.WARS;                                           // 0x0dc4...
const USDCE= process.env.USDCE;                                          // 0x79a0...

// === ABI mínimos ===
const PM_ABI = [
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int256 amount0, int256 amount1, uint160 sqrtPriceX96, int24 tick)"
];
const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// === Helpers ===
function alignTicks(tick, spacing, width = 600) {
  // width = +-600 ticks (con tickSpacing=60 => ~10 “pasos” a cada lado)
  const lo = Math.floor((tick - width) / spacing) * spacing;
  const hi = Math.ceil((tick + width) / spacing) * spacing;
  return [lo, hi];
}

async function currentPoolTickAndId(provider) {
  const pm = new ethers.Contract(PM, PM_ABI, provider);
  const a0 = ethers.getAddress(WARS);
  const a1 = ethers.getAddress(USDCE);
  const [currency0, currency1] =
    a0.toLowerCase() < a1.toLowerCase() ? [a0, a1] : [a1, a0];

  const topicInit = pm.interface.getEvent("Initialize").topicHash;
  const topicSwap = pm.interface.getEvent("Swap").topicHash;
  const latest = await provider.getBlockNumber();

  // Buscar Initialize del par
  const inits = await provider.getLogs({ address: PM, fromBlock: Math.max(0, latest - 100_000), toBlock: "latest", topics: [topicInit] });
  let poolId = null, tick = null;
  for (const lg of inits.reverse()) {
    const dec = pm.interface.decodeEventLog("Initialize", lg.data, lg.topics);
    if (dec.currency0.toLowerCase() === currency0.toLowerCase() && dec.currency1.toLowerCase() === currency1.toLowerCase()) {
      poolId = dec.id;
      tick = Number(dec.tick);
      break;
    }
  }
  if (!poolId) throw new Error("No encontré Initialize del pool WARS/USDC.e");

  // Buscar el último Swap de ese pool (para tick más reciente)
  const swaps = await provider.getLogs({ address: PM, fromBlock: Math.max(0, latest - 100_000), toBlock: "latest", topics: [topicSwap, poolId] });
  if (swaps.length > 0) {
    const dec = pm.interface.decodeEventLog("Swap", swaps[swaps.length - 1].data, swaps[swaps.length - 1].topics);
    tick = Number(dec.tick);
  }
  return { poolId, tick };
}

async function main() {
  const [me] = await ethers.getSigners();
  const provider = ethers.provider;

  // 1) Tick actual y rango
  const { tick } = await currentPoolTickAndId(provider);
  const TICK_SPACING = 60; // el del pool
  const [tickLower, tickUpper] = alignTicks(tick, TICK_SPACING, 600);
  console.log("tick now:", tick, "| range:", tickLower, "→", tickUpper);

  // 2) Presupuestos (máximo a usar) y liquidez a añadir
  const wars = new ethers.Contract(WARS, ERC20_ABI, me);
  const usdce= new ethers.Contract(USDCE, ERC20_ABI, me);
  const warsMax  = ethers.parseUnits("0.001", 18); // 0.001 WARS
  const usdceMax = ethers.parseUnits("0.010", 6);  // 0.01  USDC.e
  const liqDelta = 100n;                            // int128 > 0
  const salt     = ethers.ZeroHash;                 // podés cambiarlo si querés varias posiciones

  // 3) Aprobar al manager para pull de fondos
  await (await wars.approve(MGR, warsMax)).wait();
  await (await usdce.approve(MGR, usdceMax)).wait();

  // 4) Llamar al manager
  const mgr = await ethers.getContractAt("LiquidityManagerV4", MGR, me);
  const beforeW = await wars.balanceOf(me.address);
  const beforeU = await usdce.balanceOf(me.address);
  console.log("Before  WARS:", beforeW.toString(), " USDC.e:", beforeU.toString());

  const tx = await mgr.addLiquidity(tickLower, tickUpper, liqDelta, warsMax, usdceMax, salt);
  const rc = await tx.wait();
  console.log("addLiquidity tx:", rc.hash);

  const afterW = await wars.balanceOf(me.address);
  const afterU = await usdce.balanceOf(me.address);
  console.log("After   WARS:", afterW.toString(), " USDC.e:", afterU.toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
