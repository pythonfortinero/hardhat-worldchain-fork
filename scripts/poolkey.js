const { ethers } = require("hardhat");

// Direcciones
const WARS  = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const USDCe = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";

// Parámetros del pool que viste en el evento Initialize
const FEE = 3000;         // 0.3%
const TICK_SPACING = 60;  // del evento
const HOOKS = "0x0000000000000000000000000000000000000000"; // sin hooks

async function main() {
  // Uniswap v4 define currency0 < currency1 (orden lexicográfico por address)
  const [a, b] = [WARS.toLowerCase(), USDCe.toLowerCase()].sort();
  const poolKey = {
    currency0: a,
    currency1: b,
    fee: FEE,
    tickSpacing: TICK_SPACING,
    hooks: HOOKS,
  };

  // Si WARS es currency0, para vender WARS->USDC.e usamos zeroForOne = true
  const zeroForOne = (a === WARS.toLowerCase());

  console.log("poolKey:", poolKey);
  console.log("zeroForOne (WARS->USDC.e):", zeroForOne);
  console.log("currency0:", poolKey.currency0);
  console.log("currency1:", poolKey.currency1);
}

main().catch(console.error);
