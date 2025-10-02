const { ethers } = require("hardhat");

// Direcciones
const POOLMANAGER = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33";
const WARS  = process.env.WARS;
const USDCE = process.env.USDCE;

// ABI mínimo de eventos del PoolManager v4
const PM_ABI = [
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int256 amount0, int256 amount1, uint160 sqrtPriceX96, int24 tick)"
];

// Q96 / Q192
const Q96  = 2n ** 96n;
const Q192 = Q96 * Q96;

// Devuelve: precio 1 WARS -> USDC.e (formateado con 6 dec), y su inverso
function priceStringsFromSqrt(sqrtPriceX96, dec0 = 18, dec1 = 6) {
  // Queremos 6 decimales en el resultado final:
  // p6 = (sqrt^2 / Q192) * 10^(dec0 - dec1 + 6)
  const scale = 10n ** BigInt(dec0 - dec1 + 6);
  const num = sqrtPriceX96 * sqrtPriceX96;
  const p6 = (num * scale) / Q192;            // entero con 6 decimales “embedidos”
  const price = Number(p6) / 1e6;              // 1 WARS -> USDC.e

  // inverso (1 USDC.e -> WARS)
  // inv = 1 / price
  const inv = price > 0 ? (1 / price) : Infinity;
  return { price, inv, p6 };
}

async function main() {
  const provider = ethers.provider;
  const pm = new ethers.Contract(POOLMANAGER, PM_ABI, provider);

  // Ordenar monedas para saber currency0/currency1 como las ve el pool
  const a0 = ethers.getAddress(WARS);
  const a1 = ethers.getAddress(USDCE);
  const [currency0, currency1] =
    a0.toLowerCase() < a1.toLowerCase() ? [a0, a1] : [a1, a0];

  // --- 1) hallamos el poolId desde Initialize más reciente de ese par ---
  const topicInit = pm.interface.getEvent("Initialize").topicHash;
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 100_000);

  const initLogs = await provider.getLogs({
    address: POOLMANAGER,
    fromBlock,
    toBlock: "latest",
    topics: [topicInit] // filtramos por evento
  });

  let poolId = null;
  let lastSqrt = null;
  let lastTick = null;

  // Buscamos el Initialize cuyo currency0/currency1 coincidan
  for (const lg of initLogs.reverse()) {
    const dec = pm.interface.decodeEventLog("Initialize", lg.data, lg.topics);
    if (
      dec.currency0.toLowerCase() === currency0.toLowerCase() &&
      dec.currency1.toLowerCase() === currency1.toLowerCase()
    ) {
      poolId = dec.id;
      lastSqrt = BigInt(dec.sqrtPriceX96);
      lastTick = Number(dec.tick);
      break;
    }
  }

  if (!poolId) {
    console.log("No encontré Initialize del pool WARS/USDC.e en los últimos bloques.");
    return;
  }

  // --- 2) leemos el Swap más reciente de ese pool (para capturar el precio actual) ---
  const topicSwap = pm.interface.getEvent("Swap").topicHash;
  const swapLogs = await provider.getLogs({
    address: POOLMANAGER,
    fromBlock,
    toBlock: "latest",
    topics: [topicSwap, poolId] // topic0 = Swap, topic1 = id del pool
  });

  if (swapLogs.length > 0) {
    const dec = pm.interface.decodeEventLog("Swap", swapLogs[swapLogs.length - 1].data, swapLogs[swapLogs.length - 1].topics);
    lastSqrt = BigInt(dec.sqrtPriceX96);
    lastTick = Number(dec.tick);
  }

  // --- 3) calcular y mostrar precios ---
  const { price, inv, p6 } = priceStringsFromSqrt(lastSqrt, 18, 6);

  console.log(`poolId: ${poolId}`);
  console.log(`sqrtPriceX96 actual: ${lastSqrt.toString()}`);
  console.log(`tick actual: ${lastTick}`);
  console.log(`Precio (1 WARS -> USDC.e): ${price}  (p6=${p6})`);
  console.log(`Precio inverso (1 USDC.e -> WARS): ${inv}`);
}

main().catch(console.error);
