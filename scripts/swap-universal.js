// scripts/swap-universal.js
require("dotenv/config");
const { ethers } = require("hardhat");

const UNIVERSAL_ROUTER = "0x8ac7bee993bb44dab564ea4bc9ea67bf9eb5e743"; // Worldchain
const PERMIT2          = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // shared across chains

// Toma direcciones desde tu .env (ya las tienes cargadas antes)
const WARS  = process.env.WARS;    // 0x0dc4... (wARS)
const USDCE = process.env.USDCE;   // 0x79a0... (USDC.e)
const FEE = 3000;
const TICK_SPACING = 60;
const HOOKS = "0x0000000000000000000000000000000000000000";

// Helpers
const erc20Abi = [
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const urAbi = [
  // execute(bytes commands, bytes[] inputs, uint256 deadline)
  "function execute(bytes,bytes[],uint256) external payable"
];

async function main() {
  const [me] = await ethers.getSigners();
  const wars  = new ethers.Contract(WARS, erc20Abi, me);
  const usdce = new ethers.Contract(USDCE, erc20Abi, me);
  const ur    = new ethers.Contract(UNIVERSAL_ROUTER, urAbi, me);

  // Ordena el PoolKey (currency0 < currency1)
  const addr0 = ethers.getAddress(WARS);
  const addr1 = ethers.getAddress(USDCE);
  const [currency0, currency1] =
    addr0.toLowerCase() < addr1.toLowerCase() ? [addr0, addr1] : [addr1, addr0];
  const zeroForOne = (addr0.toLowerCase() === currency0.toLowerCase()); // true si WARS es currency0

  // Cantidades: 1 WARS
  const warsDec = await wars.decimals();
  const amountIn = ethers.parseUnits("1", warsDec); // 1.0 WARS
  const minOut = 0n; // para test, sin slippage check

  // 1) Aprobar PERMIT2 para que el Universal Router pueda mover WARS
  const Max = ethers.MaxUint256;
  const txA = await wars.approve(PERMIT2, Max);
  await txA.wait();

  // 2) Armar commands/actions/params para Universal Router (V4_SWAP)
  const commands = "0x10";              // Commands.V4_SWAP
  const actions  = "0x060c0f";          // [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]

  // Structs de IV4Router.ExactInputSingleParams y PoolKey codificados a mano
  const coder = ethers.AbiCoder.defaultAbiCoder();

  // param[0]: ExactInputSingleParams
  const poolKeyTuple = [currency0, currency1, FEE, TICK_SPACING, HOOKS];
  const params0 = coder.encode(
    ["tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes)"],
    [[poolKeyTuple, zeroForOne, amountIn, minOut, "0x"]]
  );

  // param[1]: SETTLE_ALL (currencyIn, amountIn)
  const currencyIn = zeroForOne ? currency0 : currency1; // si zeroForOne, input es currency0
  const params1 = coder.encode(["address","uint256"], [currencyIn, amountIn]);

  // param[2]: TAKE_ALL (currencyOut, minOut)
  const currencyOut = zeroForOne ? currency1 : currency0;
  const params2 = coder.encode(["address","uint256"], [currencyOut, minOut]);

  // inputs[0] = abi.encode(actions, params[])
  const inputs0 = coder.encode(["bytes","bytes[]"], [actions, [params0, params1, params2]]);

  const beforeWars  = await wars.balanceOf(me.address);
  const beforeUsdce = await usdce.balanceOf(me.address);
  console.log("Before  WARS:", beforeWars.toString(), " USDC.e:", beforeUsdce.toString());

  const deadline = Math.floor(Date.now()/1000) + 300;
  const tx = await ur.execute(commands, [inputs0], deadline);
  const rcpt = await tx.wait();
  console.log("Swap tx:", rcpt.hash);

  const afterWars  = await wars.balanceOf(me.address);
  const afterUsdce = await usdce.balanceOf(me.address);
  console.log("After   WARS:", afterWars.toString(), " USDC.e:", afterUsdce.toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
