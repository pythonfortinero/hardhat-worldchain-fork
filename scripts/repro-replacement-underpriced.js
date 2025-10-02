// scripts/repro-replacement-underpriced.js
const { ethers } = require("hardhat");

async function main() {
  const [me] = await ethers.getSigners();
  const provider = me.provider;

  // 1) Tomamos el nonce actual
  const nonce = await provider.getTransactionCount(me.address, "pending");

  // 2) Armamos una tx simple (value 0) a nosotros mismos
  //    con EIP-1559 (maxFee y maxPriority)
  const baseMaxPriority = ethers.parseUnits("1.5", "gwei");
  const baseMaxFee      = ethers.parseUnits("30", "gwei");

  console.log("Sender:", me.address);
  console.log("Nonce :", nonce);

  // 3) Enviamos la primera tx (quedará PENDIENTE porque automine=false)
  const tx1 = await me.sendTransaction({
    to: me.address,
    value: 0n,
    nonce,
    maxPriorityFeePerGas: baseMaxPriority,
    maxFeePerGas: baseMaxFee,
    // gasLimit bajo porque es una tx vacía:
    gasLimit: 21000
  });
  console.log("tx1 sent:", tx1.hash);

  // 4) Intentamos reemplazar con el MISMO nonce y un bump INSUFICIENTE (+5%)
  const bump = 1.05; // 5%, menor al ~10% típico
  const tx2MaxPriority = BigInt(Math.floor(Number(baseMaxPriority) * bump));
  const tx2MaxFee      = BigInt(Math.floor(Number(baseMaxFee) * bump));

  try {
    const tx2 = await me.sendTransaction({
      to: me.address,
      value: 0n,
      nonce, // mismo nonce para forzar reemplazo
      maxPriorityFeePerGas: tx2MaxPriority,
      maxFeePerGas: tx2MaxFee,
      gasLimit: 21000
    });
    console.log("tx2 sent (unexpected):", tx2.hash);
  } catch (err) {
    console.log("EXPECTED ERROR on replacement:", err.code || err.message);
    // En ethers v6, err.info?.error?.message puede traer el texto del nodo:
    console.log("Details:", (err.info && err.info.error && err.info.error.message) || err.message);
  }

  // 5) (Opcional) probá con legacy gasPrice para ver el mismo error:
  try {
    const tx3 = await me.sendTransaction({
      to: me.address,
      value: 0n,
      nonce,
      // Legacy replacement (gasPrice < 10% bump)
      gasPrice: BigInt(Math.floor(Number(ethers.parseUnits("30", "gwei")) * 1.05)),
      gasLimit: 21000
    });
    console.log("tx3 sent (unexpected):", tx3.hash);
  } catch (err) {
    console.log("EXPECTED LEGACY ERROR:", err.code || err.message);
    console.log("Details:", (err.info && err.info.error && err.info.error.message) || err.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
