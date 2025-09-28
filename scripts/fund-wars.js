const { ethers, network } = require("hardhat");

const WARS = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

async function findRichHolder(token) {
  const iface = new ethers.Interface(ERC20_ABI);
  const topic = ethers.id("Transfer(address,address,uint256)");
  const latest = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(1, latest - 400_000);

  const logs = await ethers.provider.getLogs({
    address: token,
    topics: [topic],
    fromBlock,
    toBlock: latest,
  });

  const score = {};
  for (const l of logs) {
    const { args } = iface.parseLog(l);
    const from = args.from.toLowerCase();
    const to   = args.to.toLowerCase();
    const val  = args.value;
    score[from] = (score[from] ?? 0n) - val;
    score[to]   = (score[to]   ?? 0n) + val;
  }

  const candidates = Object.entries(score)
    .sort((a,b) => (b[1] > a[1] ? 1 : -1))
    .map(([addr]) => addr);

  const erc20 = new ethers.Contract(token, ERC20_ABI, ethers.provider);
  for (const addr of candidates.slice(0, 50)) {
    const bal = await erc20.balanceOf(addr);
    if (bal >= ethers.parseUnits("100", 18)) return addr;
  }
  return null;
}

async function main() {
  const [me] = await ethers.getSigners();
  const warsReader = new ethers.Contract(WARS, ERC20_ABI, ethers.provider);

  const bnBefore = await ethers.provider.getBlockNumber();
  const balBefore = await warsReader.balanceOf(me.address);
  console.log("Me:", me.address);
  console.log("Block before:", bnBefore);
  console.log("WARS before:", balBefore.toString());

  const holder = await findRichHolder(WARS);
  if (!holder) throw new Error("No se encontró holder grande de WARS");
  console.log("Impersonando:", holder);

  await network.provider.request({ method: "hardhat_impersonateAccount", params: [holder] });
  await network.provider.send("hardhat_setBalance", [holder, "0x56BC75E2D63100000"]); // 100 ETH

  const whale = await ethers.getSigner(holder);
  const warsWhale = new ethers.Contract(WARS, ERC20_ABI, whale);

  const amount = ethers.parseUnits("1", 18); // 1 WARS para test
  const tx = await warsWhale.transfer(me.address, amount);
  const rc = await tx.wait();
  console.log("tx:", rc.hash);

  // ¿hubo evento Transfer hacia mí?
  const iface = new ethers.Interface(ERC20_ABI);
  const transfersToMe = rc.logs.filter(
    (l) =>
      l.address.toLowerCase() === WARS.toLowerCase() &&
      l.topics[0] === ethers.id("Transfer(address,address,uint256)") &&
      iface.parseLog(l).args.to.toLowerCase() === me.address.toLowerCase()
  );
  console.log("Transfer events to me:", transfersToMe.length);

  const bnAfter = await ethers.provider.getBlockNumber();
  const balAfter = await warsReader.balanceOf(me.address);
  console.log("Block after:", bnAfter);
  console.log("WARS after:", balAfter.toString());
}

main().catch(console.error);
