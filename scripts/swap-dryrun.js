const { ethers } = require("hardhat");
const PM_ABI = require("../abis/PoolManager.json");

// Direcciones World Chain
const POOLMANAGER = "0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33";
const WARS  = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const USDCe = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";

// Parámetros del pool (del Initialize que viste)
const FEE = 3000;
const TICK_SPACING = 60;
const HOOKS = "0x0000000000000000000000000000000000000000";

async function main() {
  const [me] = await ethers.getSigners();
  const pm = new ethers.Contract(POOLMANAGER, PM_ABI, me);

  const [a, b] = [WARS.toLowerCase(), USDCe.toLowerCase()].sort();
  const poolKey = { currency0: a, currency1: b, fee: FEE, tickSpacing: TICK_SPACING, hooks: HOOKS };
  const zeroForOne = (a === WARS.toLowerCase()); // vender WARS -> USDC.e
  const amountIn = ethers.parseUnits("0.1", 18); // 0.1 WARS para probar
  const params = { zeroForOne, amountSpecified: amountIn, sqrtPriceLimitX96: 0n };

  try {
    // Dry-run: esperamos que en v4 falle si falta callback/router, pero nos sirve para confirmar
    const [delta0, delta1] = await pm.swap.staticCall(me.address, poolKey, params, "0x");
    console.log("staticCall OK. delta0, delta1:", delta0.toString(), delta1.toString());
  } catch (e) {
    console.log("Static swap revert (esperable si falta callback en v4):");
    console.log((e?.shortMessage || e?.message || e).toString());
  }
}

main().catch(console.error);
