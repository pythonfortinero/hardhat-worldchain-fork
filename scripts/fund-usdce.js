const { ethers, network } = require("hardhat");

const USDCe = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Escaneamos una ventana razonable y en bloques chicos para no pasarnos del límite de logs
const WINDOW_BLOCKS = 40_000; // ~ muchas horas en L2, ajustable
const CHUNK = 2_000;          // <= 10k recomendado; usamos 2k para ir tranquilos
const MIN_BAL = 100n * 10n ** 6n; // 100 USDC.e (6 dec)

async function findRichHolderChunked(token, min = MIN_BAL) {
  const iface = new ethers.Interface(ERC20_ABI);
  const topic = ethers.id("Transfer(address,address,uint256)");
  const latest = await ethers.provider.getBlockNumber();
  const fromStart = Math.max(1, latest - WINDOW_BLOCKS);

  // mapa heurístico de balances por logs (entradas - salidas)
  const score = {};

  for (let from = fromStart; from <= latest; from += CHUNK) {
    const to = Math.min(latest, from + CHUNK);
    // console.log(`Scanning blocks [${from}..${to}]`);
    const logs = await ethers.provider.getLogs({
      address: token,
      topics: [topic],
      fromBlock: from,
      toBlock: to,
    });

    for (const l of logs) {
      const { args } = iface.parseLog(l);
      const fromAddr = args.from.toLowerCase();
      const toAddr   = args.to.toLowerCase();
      const val      = args.value; // USDC.e tiene 6 dec
      score[fromAddr] = (score[fromAddr] ?? 0n) - val;
      score[toAddr]   = (score[toAddr]   ?? 0n) + val;
    }
  }

  // Ordenamos candidatos por "score" y validamos on-chain el balance real
  const erc20 = new ethers.Contract(token, ERC20_ABI, ethers.provider);
  const candidates = Object.entries(score)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .map(([addr]) => addr);

  for (const addr of candidates.slice(0, 80)) {
    const bal = await erc20.balanceOf(addr);
    if (bal >= min) return addr;
  }
  return null;
}

async function main() {
  const [me] = await ethers.getSigners();
  const usdceReader = new ethers.Contract(USDCe, ERC20_ABI, ethers.provider);

  const before = await usdceReader.balanceOf(me.address);
  console.log("Me:", me.address);
  console.log("USDC.e before:", before.toString());

  const holder = await findRichHolderChunked(USDCe);
  if (!holder) throw new Error("No se encontró holder grande de USDC.e en la ventana/chunks elegidos");
  console.log("Impersonando:", holder);

  await network.provider.request({ method: "hardhat_impersonateAccount", params: [holder] });
  await network.provider.send("hardhat_setBalance", [holder, "0x56BC75E2D63100000"]); // 100 ETH

  const whale = await ethers.getSigner(holder);
  const usdce = new ethers.Contract(USDCe, ERC20_ABI, whale);

  const amount = 10_000_000n; // 10 USDC.e (6 dec). Cambiá si querés más.
  const tx = await usdce.transfer(me.address, amount);
  const rc = await tx.wait();
  console.log("tx:", rc.hash);

  const after = await usdceReader.balanceOf(me.address);
  console.log("USDC.e after:", after.toString());
}

main().catch(console.error);
