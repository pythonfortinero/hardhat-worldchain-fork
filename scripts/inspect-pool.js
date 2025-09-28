const { ethers } = require("hardhat");

// Direcciones
const POOLMANAGER = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33";
const WARS  = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const USDCe = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";

// Parámetros del evento que compartiste
const FEE = 3000;         // 0.3%
const TICK_SPACING = 60;  // del evento
const HOOKS = "0x0000000000000000000000000000000000000000"; // sin hooks

function priceFromSqrtX96(sqrtPriceX96, dec0 = 18, dec1 = 6) {
  const Q96 = 2n ** 96n;
  const num = sqrtPriceX96 * sqrtPriceX96;
  const ratio = Number(num) / Number(Q96 * Q96);
  return ratio * Math.pow(10, dec0 - dec1); // aprox
}

async function main() {
  const iface = new ethers.Interface([
    "event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)"
  ]);
  const topic = iface.getEvent("Initialize").topicHash;

  // Buscamos alrededor del bloque que diste
  const fromBlock = 14254750;
  const toBlock   = 14256000;

  const logs = await ethers.provider.getLogs({
    address: POOLMANAGER,
    topics: [topic, null, null, null],
    fromBlock,
    toBlock,
  });

  for (const l of logs) {
    const ev = iface.decodeEventLog("Initialize", l.data, l.topics);
    const c0 = ev.currency0.toLowerCase();
    const c1 = ev.currency1.toLowerCase();

    if (
      c0 === WARS.toLowerCase() &&
      c1 === USDCe.toLowerCase() &&
      ev.fee === FEE &&
      Number(ev.tickSpacing) === TICK_SPACING &&
      ev.hooks.toLowerCase() === HOOKS.toLowerCase()
    ) {
      console.log("PoolId:", ev.id);
      console.log("sqrtPriceX96:", ev.sqrtPriceX96.toString());
      console.log("tick:", ev.tick.toString());
      console.log("Precio aprox (USDC.e por 1 WARS):", priceFromSqrtX96(ev.sqrtPriceX96));
    }
  }
}

main().catch(console.error);
