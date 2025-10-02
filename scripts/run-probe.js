const { ethers } = require("hardhat");

// poné acá la address que te imprimió el deploy:
const PROBE = "0x46b142DD1E924FAb83eCc3c08e4D46E82f005e0E";

async function main() {
  const [me] = await ethers.getSigners();
  const probe = await ethers.getContractAt("PMProbe", PROBE, me);

  console.log("== goUnlock ==");
  try {
    const tx1 = await probe.goUnlock();
    await tx1.wait();
  } catch (e) {
    console.log("goUnlock reverted");
  }

  console.log("== goLock ==");
  try {
    const tx2 = await probe.goLock();
    await tx2.wait();
  } catch (e) {
    console.log("goLock reverted");
  }
}

main().catch(console.error);
