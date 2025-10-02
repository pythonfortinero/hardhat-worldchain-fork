// scripts/cancel-pending.cjs  (CommonJS)
const { ethers, network } = require("hardhat");
require("dotenv").config();
const { Wallet, utils } = require("ethers");

async function main() {
  const wallet = new Wallet(process.env.PRIVATE_KEY, ethers.provider);
  const addr = await wallet.getAddress();

  const latest  = await ethers.provider.getTransactionCount(addr, "latest");
  const pending = await ethers.provider.getTransactionCount(addr, "pending");
  console.log({ latest, pending, toCancel: pending - latest });

  if (pending === latest) {
    console.log("No hay pendientes. Nada que cancelar.");
    return;
  }

  const fee = await ethers.provider.getFeeData();
  const minGwei = utils.parseUnits("2", "gwei");
  const bump = (x) => (x == null ? null : (x * 12n) / 10n);

  const is1559 = fee.maxFeePerGas != null && fee.maxPriorityFeePerGas != null;
  const maxFee  = is1559 ? (bump(fee.maxFeePerGas)        > minGwei ? bump(fee.maxFeePerGas)        : minGwei) : null;
  const maxPrio = is1559 ? (bump(fee.maxPriorityFeePerGas) > minGwei ? bump(fee.maxPriorityFeePerGas) : minGwei) : null;
  const gasPrice = !is1559 ? ((bump(fee.gasPrice ?? minGwei) > minGwei) ? bump(fee.gasPrice ?? minGwei) : minGwei) : null;

  console.log({ is1559, maxFee: String(maxFee), maxPrio: String(maxPrio), gasPrice: String(gasPrice) });

  for (let nonce = latest; nonce < pending; nonce++) {
    const req = { to: addr, value: 0, nonce, gasLimit: 21_000 };
    if (is1559) {
      req.type = 2;
      req.maxFeePerGas = maxFee;
      req.maxPriorityFeePerGas = maxPrio;
    } else {
      req.gasPrice = gasPrice;
    }
    const tx = await wallet.sendTransaction(req);
    console.log(`cancel sent nonce=${nonce} hash=${tx.hash}`);
  }

  // await network.provider.send("evm_mine");

  const pendingAfter = await ethers.provider.getTransactionCount(addr, "pending");
  console.log({ pendingAfter });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
