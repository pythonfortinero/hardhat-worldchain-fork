const { ethers } = require("hardhat");

// sqrtPriceX96 del Initialize
const SQRT_PRICE_X96 = 2309335707220535788459n; // sqrt(priceRaw) en Q96
const FEE_PPM = 3000n; // 0.3%

const Q96  = 2n ** 96n;
const Q192 = Q96 * Q96;

// rawOut1 = (rawIn0 * sqrt^2) / Q192
function quoteRawUSDCeFromRawWARS(rawInWARS) {
  const sqrt2 = SQRT_PRICE_X96 * SQRT_PRICE_X96;
  const gross = (rawInWARS * sqrt2) / Q192; // USDC.e en "raw" (6 dec)
  const net   = (gross * (1_000_000n - FEE_PPM)) / 1_000_000n;
  return { gross, net };
}

async function main() {
  const rawIn = ethers.parseUnits("1.0", 18); // 1 WARS (raw)
  const { gross, net } = quoteRawUSDCeFromRawWARS(rawIn);

  console.log("gross raw (USDC.e, 6 dec):", gross.toString());
  console.log("net   raw (USDC.e, 6 dec):", net.toString());

  // Mostrar también en unidades humanas:
  console.log("gross human (USDC.e):", (Number(gross) / 1e6).toFixed(6));
  console.log("net   human (USDC.e):", (Number(net)   / 1e6).toFixed(6));
}

main().catch(console.error);
