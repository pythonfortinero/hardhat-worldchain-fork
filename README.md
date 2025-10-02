README — Fork de World Chain con Hardhat: WARS ↔ USDC.e

Este repo te deja forkear World Chain, fondearte con WARS/USDC.e del estado real, cotar el precio, y hacer swaps en el pool WARS/USDC.e (v4). También documenta qué faltaría para probar cambios de liquidez.

0) Requisitos

Node 18+ y Hardhat v2 (estás usándolo)

RPC de World Chain Mainnet (WORLDCHAIN_RPC, por ej. de tu proveedor)

Direcciones on-chain del pool:

PoolManager (PM): 0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33

WARS: 0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D (18 dec)

USDC.e: 0x79A02482A880bCE3F13e09Da970dC34db4CD24d1 (6 dec)

Bloque de fork recomendado: 14256000 (mismo snapshot que usamos)

1) Configuración rápida
.env
WORLDCHAIN_RPC=<tu_rpc_worldchain>
POOLMANAGER=0xb1860D529182ac3BC1F51Fa2ABd56662b7D13f33
WARS=0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D
USDCE=0x79A02482A880bCE3F13e09Da970dC34db4CD24d1

# (opcional) holders ricos usados para fondear en el fork
RICH_WARS=0x5ca3f8eeba12d83408fc097c2dad79212456f20f
RICH_USDCE=0xe741bc7c34758b4cae05062794e8ae24978af432


Si ya desplegaste el LockingV4Router, agregá:

LOCK_ROUTER=<address_del_router_deployado>

hardhat.config.js (fragmento)
require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");

module.exports = {
  solidity: { version: "0.8.24", settings: { viaIR: false } },
  networks: {
    hardhat: {
      chainId: 480,
      forking: {
        url: process.env.WORLDCHAIN_RPC,
        blockNumber: 14256000
      }
    },
    localhost: { chainId: 480 }, // para conectarte al node que corre en 8545
  },
};

Levantar el nodo forkeado
npx hardhat node
# verás: Started JSON-RPC at http://127.0.0.1:8545 + 20 cuentas locales


Importante: ejecutá scripts con --network localhost (no hardhat) para pegarle a ese nodo.

2) Ver que el fork quedó bien
scripts/info.js

Imprime chainId y bloque actual:

npx hardhat run scripts/info.js --network localhost
# ChainId: 480  | Block: 14256000 (o > si ya minaste algo)

scripts/tokens.js

Confirma nombres/decimales y tus balances:

npx hardhat run scripts/tokens.js --network localhost
# WARS: Peso Argentino wARS dec: 18
# USDC.e: Bridged USDC (...) dec: 6
# Signer: 0xf39F...
# Balance WARS: 0
# Balance USDC.e: 0

3) Cómo fondear

La idea: impersonar cuentas ricas del estado real y transferirte tokens en el fork.

3.1 Fondear WARS
npx hardhat run scripts/fund-wars.js --network localhost
# Me: 0xf39F...
# Block before: 14256000
# WARS before: 0
# Impersonando: 0x5ca3f8... (holder real)
# tx: 0x...
# WARS after: 1000000000000000000 (1.0 WARS)


Si ves balance 0, revisá que estés usando --network localhost.

3.2 Fondear USDC.e

Este script busca logs por tramos (eth_getLogs en WC limita el rango) y elige un holder; si falla, usa RICH_USDCE.

npx hardhat run scripts/fund-usdce.js --network localhost
# Me: 0xf39F...
# USDC.e before: 0
# Impersonando: 0xe741bc...
# tx: 0x...
# USDC.e after: 10000000  (10 USDC.e con 6 dec)

3.3 (Recomendado) Approve WARS al PoolManager

El router v4 cobra/paga vía PM, así que aprobá WARS hacia el PoolManager:

npx hardhat run scripts/approve.js --network localhost
# Allowance antes: 0
# Approve tx: 0x...
# Allowance después: MaxUint256

4) Deploy del Router para swap (v4 lock pattern)
4.1 Compilar y deploy
npx hardhat compile
npx hardhat run scripts/deploy-locking-router.js --network localhost
# Deployer: 0xf39F...
# LockingV4Router: 0xCf7E...


Guardá la address en .env:

LOCK_ROUTER=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

5) Cómo hacer un swap
5.1 Swap WARS → USDC.e
npx hardhat run scripts/swap-via-lock-router.js --network localhost
# Before  WARS: 1000000000000000000  USDC.e: 10000000
# Swap tx: 0x...
# After   WARS: 900000000000000000  USDC.e: 10000085   (0.1 WARS → ~85 “micro” USDC.e)


Nota: montos muy chicos (ej. 0.01 WARS) pueden revertir si el output redondea a 0 después de la fee. Usá ≥ 0.1 WARS para asegurar ejecución en este pool.

6) Cómo ver el precio actual y cómo cambia
6.1 Precio al instante

scripts/price-now.js lee el sqrtPriceX96 del último Swap (o del Initialize) y lo convierte a precio humano.

npx hardhat run scripts/price-now.js --network localhost
# poolId: 0x...
# sqrtPriceX96 actual: 2309335707220535788459
# tick actual: -347035
# Precio (1 WARS -> USDC.e): 0.000849
# Precio inverso (1 USDC.e -> WARS): 1177.7...

6.2 Ver impacto de precio (slippage) con trades sucesivos

scripts/price-and-impact.js hace una escalera de swaps y muestra tick/precio tras cada uno.
Acordate de setear LOCK_ROUTER en .env.

npx hardhat run scripts/price-and-impact.js --network localhost
# Before ... | Price ... | tick ...
# -- swap 0.10 WARS --
# After 0.10 ... | Price ... | tick ...
# -- swap 0.20 WARS --
# After 0.20 ... | Price ... | tick ...
# ...

7) Troubleshooting rápido

“Transaction reverted without a reason string” al hacer un swap muy chico
→ Aumentá amountIn (p.ej. 0.1 WARS). Con el precio del snapshot, 0.01 WARS * fee ≈ output ~0.

Balances siguen en 0
→ Estabas corriendo contra --network hardhat. Usá --network localhost (el node forkeado).

eth_getLogs “response size exceeded” al buscar holders
→ Usamos búsquedas por tramos (el script de USDC.e ya lo hace). Si usás otros scripts, pedí rangos de ~10k bloques.

“No known hardfork for execution on historical block 14256000”
→ Miná al menos 1 bloque (ejecutá cualquier tx) para pasar a 14256001. Ya lo disparan los scripts de funding.

8) ¿Qué falta para probar cambios de liquidez?

Intentamos un wrapper propio (LiquidityManagerV4) que llama modifyPosition dentro del lock. En este fork, el PoolManager rechaza el modifyPosition desde un contrato genérico (no llega a nuestro callback), muy probablemente porque espera la periphery oficial de posiciones (el “Position Manager”).

Opciones para tener un entorno de cambios de liquidez:

Usar la periphery oficial de posiciones de World Chain v4

Conseguir address + ABI del PositionManager real en WC.

Agregar scripts increaseLiquidity / decreaseLiquidity usando ese contrato.

Flujo: aprobar tokens → increaseLiquidity con rango alrededor del tick actual → medir price impact de swaps (debería bajar slippage si añadís liquidez).

Impersonar al LP real

Forkear un bloque donde veas un IncreaseLiquidity de la posición WARS/USDC.e.

Impersonar al owner de esa posición y llamar decrease/increase en el PositionManager real.

Requiere conocer tokenId (ERC-721 o id/salt, según periphery).

Periphery “minimal” propia (más trabajo)

Reusar exactamente las firmas y checks del PositionManager real (incluyendo permisos y callbacks esperados por el PM de WC).

Poco recomendable si el objetivo es test funcional, no ingeniería de periphery.

Qué te entrego si avanzamos con (1):

Scripts:

deploy-position-helper.js (si hace falta helper)

add-liquidity-v4.js (increase)

remove-liquidity-v4.js (decrease/collect)

Cálculo de ticks: centrado en tick actual; rangos [tick-600, tick+600] con TICK_SPACING=60.

Verificación: price-now.js no cambia (precio de spot no cambia por añadir liquidez), pero price-and-impact.js mostrará menos drift tras trades del mismo tamaño.

Si me pasás address/ABI del PositionManager de World Chain, te dejo los scripts listos para usar.

9) Resumen de comandos (orden de ejecución)
# 0) Node
npx hardhat node

# 1) Info & tokens
npx hardhat run scripts/info.js --network localhost
npx hardhat run scripts/tokens.js --network localhost

# 2) Fondeo
npx hardhat run scripts/fund-wars.js   --network localhost
npx hardhat run scripts/fund-usdce.js  --network localhost
npx hardhat run scripts/approve.js     --network localhost   # approve WARS -> PM

# 3) Deploy router & swap
npx hardhat run scripts/deploy-locking-router.js --network localhost
# (agregar LOCK_ROUTER al .env)
npx hardhat run scripts/swap-via-lock-router.js   --network localhost

# 4) Precio & slippage
npx hardhat run scripts/price-now.js            --network localhost
npx hardhat run scripts/price-and-impact.js     --network localhost


Cualquier cosa que te aparezca rara en los outputs, pegámelos y te lo ajusto. Y si te pasan el PositionManager de World Chain, te preparo de una los scripts para añadir/quitar liquidez “de verdad”.