const { ethers } = require("hardhat");

const TX = "0x2dd0ee7524fbaf6f8a60c4d4086a994a06411aba464cbbd86cefae52499d1797";

const ABI = [
  "event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)"
];

async function main() {
  const receipt = await ethers.provider.getTransactionReceipt(TX);
  if (!receipt) {
    console.log("No encontré el receipt. ¿El fork está en/tras ese bloque?");
    return;
  }
  const iface = new ethers.Interface(ABI);
  const topic = iface.getEvent("Initialize").topicHash;

  const matches = receipt.logs.filter((l) => l.topics[0] === topic);
  console.log("Logs totales:", receipt.logs.length, " | Initialize:", matches.length);

  for (const l of matches) {
    const ev = iface.decodeEventLog("Initialize", l.data, l.topics);
    console.log("Emisor:", l.address);
    console.log({
      id: ev.id,
      currency0: ev.currency0,
      currency1: ev.currency1,
      fee: Number(ev.fee),
      tickSpacing: Number(ev.tickSpacing),
      hooks: ev.hooks,
      sqrtPriceX96: ev.sqrtPriceX96.toString(),
      tick: Number(ev.tick),
    });
  }
}
main().catch(console.error);
