// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "hardhat/console.sol";

/// ====== Tipos y ABI mínimos de Uniswap v4 (World Chain) ======

interface IERC20 {
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IHooks { } // placeholder, sin uso

// BalanceDelta compacto (token0/token1) devuelto por v4
type BalanceDelta is int256;

library BalanceDeltaLib {
    function amount0(BalanceDelta d) internal pure returns (int256 _a0) {
        assembly { _a0 := sar(128, d) }
    }
    function amount1(BalanceDelta d) internal pure returns (int256 _a1) {
        assembly { _a1 := signextend(15, d) }
    }
}

interface IPoolManager {
    struct PoolKey {
        IERC20 token0;
        IERC20 token1;
        uint24  fee;
        int24   tickSpacing;
        IHooks  hooks;
    }
    struct SwapParams {
        bool     zeroForOne;
        int256   amountSpecified;     // exact in => NEGATIVO
        uint160  sqrtPriceLimitX96;   // límites válidos requeridos
    }
    struct ModifyPositionParams {
        int24   tickLower;
        int24   tickUpper;
        int128  liquidityDelta;       // >0 añade, <0 quita
        bytes32 salt;                 // identifica la posición
    }

    // lock pattern estable en World Chain
    function lock(bytes calldata data) external returns (bytes memory);
    function unlock(bytes calldata data) external returns (bytes memory);

    // operaciones dentro del lock
    function swap(PoolKey calldata, SwapParams calldata, bytes calldata) external returns (BalanceDelta);
    function modifyPosition(PoolKey calldata, ModifyPositionParams calldata, bytes calldata) external returns (BalanceDelta);

    // liquidación/toma de tokens
    function sync(address currency) external;
    function settle() external payable returns (uint256 paid);  // sin parámetro
    function take(IERC20 token, address to, uint256 amount) external;
}

interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

/// ====== Wrapper simple para añadir/quitar liquidez en un pool concreto (WARS/USDC.e) ======

contract LiquidityManagerV4 is IUnlockCallback {
    using BalanceDeltaLib for BalanceDelta;

    // Direcciones importantes
    address public immutable poolManager;
    IERC20  public immutable WARS;
    IERC20  public immutable USDCE;

    // Parámetros fijos del pool (los del Initialize que ya usás)
    uint24  public constant FEE = 3000;
    int24   public constant TICK_SPACING = 60;
    IHooks  public constant HOOKS = IHooks(address(0));

    // Estado temporal para el lock (evitamos storage innecesaria con un simple context)
    enum Op { NONE, ADD, REMOVE }
    struct Ctx {
        Op      op;
        address caller;
        IPoolManager.PoolKey key;
        IPoolManager.ModifyPositionParams mp;
    }
    Ctx private _ctx;

    // Debug
    event Log(string tag);
    event Log2(string tag, int256 d0, int256 d1);
    event Paid(string which, uint256 amount);
    event Taken(string which, uint256 amount);
    event Refunded(address to, uint256 wars, uint256 usdce);

    constructor(address _pm, address _wars, address _usdce) {
        poolManager = _pm;
        WARS = IERC20(_wars);
        USDCE = IERC20(_usdce);
    }

    // === Helpers ===
    function _sort(IERC20 a, IERC20 b) internal pure returns (IERC20 t0, IERC20 t1) {
        (t0, t1) = (uint160(address(a)) < uint160(address(b))) ? (a, b) : (b, a);
    }
    function _buildKey() internal view returns (IPoolManager.PoolKey memory k) {
        (IERC20 t0, IERC20 t1) = _sort(WARS, USDCE);
        k = IPoolManager.PoolKey({ token0: t0, token1: t1, fee: FEE, tickSpacing: TICK_SPACING, hooks: HOOKS });
    }
    function _isToken0(IERC20 tok) internal view returns (bool) {
        (IERC20 t0, ) = _sort(WARS, USDCE);
        return address(tok) == address(t0);
    }

    // ====== Añadir liquidez ======
    // Pre-condición: el caller nos da allowances y fondos máximos (warsMax/usdceMax).
    // Reintegramos cualquier sobrante al final.
    function addLiquidity(
        int24 tickLower,
        int24 tickUpper,
        int128 liquidityDelta,     // > 0
        uint256 warsMax,
        uint256 usdceMax,
        bytes32 salt               // p.ej. bytes32(uint256(uint160(msg.sender))) o 0x0
    ) external returns (int256 d0, int256 d1) {
        require(liquidityDelta > 0, "liquidityDelta must be > 0");
        require(tickLower < tickUpper, "bad ticks");
        require(tickLower % TICK_SPACING == 0 && tickUpper % TICK_SPACING == 0, "ticks not multiple");


        console.log("add.start");
        console.log("pull budgets");
        // Traemos fondos máximos del usuario al contrato
        if (warsMax > 0)  require(WARS.transferFrom(msg.sender, address(this), warsMax), "tf WARS");
        if (usdceMax > 0) require(USDCE.transferFrom(msg.sender, address(this), usdceMax), "tf USDCe");

        // Armamos key y params
        IPoolManager.PoolKey memory key = _buildKey();
        IPoolManager.ModifyPositionParams memory mp = IPoolManager.ModifyPositionParams({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidityDelta: liquidityDelta,
            salt: salt
        });

        // Guardamos contexto para el callback
        _ctx = Ctx({ op: Op.ADD, caller: msg.sender, key: key, mp: mp });

        // Ejecutamos modifyPosition dentro del lock
        console.log("before.unlock");
        bytes memory ret = IPoolManager(poolManager).lock(abi.encode(key, mp)); // 👈 cambiar a lock(...)
        (d0, d1) = abi.decode(ret, (int256, int256));

        // Reintegro de sobrantes al caller
        uint256 warsBal  = WARS.balanceOf(address(this));
        uint256 usdceBal = USDCE.balanceOf(address(this));
        if (warsBal > 0)  require(WARS.transfer(_ctx.caller, warsBal), "refund WARS");
        if (usdceBal > 0) require(USDCE.transfer(_ctx.caller, usdceBal), "refund USDCe");
        emit Refunded(_ctx.caller, warsBal, usdceBal);

        // limpiar
        delete _ctx;
    }

    // ====== Quitar liquidez ======
    // liquidityDelta debe ser NEGATIVO; retiramos tokens y se los mandamos al caller.
    function removeLiquidity(
        int24 tickLower,
        int24 tickUpper,
        int128 liquidityDelta,    // < 0
        bytes32 salt
    ) external returns (int256 d0, int256 d1) {
        require(liquidityDelta < 0, "liquidityDelta must be < 0");
        require(tickLower < tickUpper, "bad ticks");
        require(tickLower % TICK_SPACING == 0 && tickUpper % TICK_SPACING == 0, "ticks not multiple");

        IPoolManager.PoolKey memory key = _buildKey();
        IPoolManager.ModifyPositionParams memory mp = IPoolManager.ModifyPositionParams({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidityDelta: liquidityDelta,
            salt: salt
        });

        _ctx = Ctx({ op: Op.REMOVE, caller: msg.sender, key: key, mp: mp });

        bytes memory ret = IPoolManager(poolManager).lock(abi.encode(key, mp)); // 👈 cambiar a lock(...)
        (d0, d1) = abi.decode(ret, (int256, int256));

        // Enviar todo lo que haya en el contrato al caller (tokens retirados)
        uint256 warsBal  = WARS.balanceOf(address(this));
        uint256 usdceBal = USDCE.balanceOf(address(this));
        if (warsBal > 0)  require(WARS.transfer(_ctx.caller, warsBal), "send WARS");
        if (usdceBal > 0) require(USDCE.transfer(_ctx.caller, usdceBal), "send USDCe");
        emit Refunded(_ctx.caller, warsBal, usdceBal);

        delete _ctx;
    }

    /// ===== Callback del PoolManager: aquí hacemos modifyPosition y liquidamos =====
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == poolManager, "only PM");
        emit Log("unlock.enter");

        (IPoolManager.PoolKey memory key, IPoolManager.ModifyPositionParams memory mp) =
            abi.decode(data, (IPoolManager.PoolKey, IPoolManager.ModifyPositionParams));

        // Ejecutar modifyPosition
        BalanceDelta bd = IPoolManager(poolManager).modifyPosition(key, mp, "");
        int256 d0 = bd.amount0();
        int256 d1 = bd.amount1();
        emit Log2("after.modify", d0, d1);
        console.log("after.modify d0,d1");
        console.logInt(d0);
        console.logInt(d1);

        // Convención de signos en v4:
        //   delta < 0  => el usuario (router) LE DEBE ese token al PM  => pagar
        //   delta > 0  => el PM le debe ese token al usuario            => cobrar (take)

        // Pagar token0 si corresponde
        if (d0 < 0) {
            uint256 pay0 = uint256(-d0);
            emit Paid("token0", pay0);
            // patrón ERC20: sync -> transfer -> settle()
            IPoolManager(poolManager).sync(address(key.token0));
            require(key.token0.transfer(poolManager, pay0), "t0 transfer->PM failed");
            IPoolManager(poolManager).settle();
        }
        // Pagar token1 si corresponde
        if (d1 < 0) {
            uint256 pay1 = uint256(-d1);
            emit Paid("token1", pay1);
            IPoolManager(poolManager).sync(address(key.token1));
            require(key.token1.transfer(poolManager, pay1), "t1 transfer->PM failed");
            IPoolManager(poolManager).settle();
        }

        // Cobrar token0 si corresponde
        if (d0 > 0) {
            uint256 take0 = uint256(d0);
            emit Taken("token0", take0);
            IPoolManager(poolManager).take(key.token0, address(this), take0);
        }
        // Cobrar token1 si corresponde
        if (d1 > 0) {
            uint256 take1 = uint256(d1);
            emit Taken("token1", take1);
            IPoolManager(poolManager).take(key.token1, address(this), take1);
        }

        emit Log("unlock.exit");
        return abi.encode(d0, d1);
    }

    // Alias legacy: algunos PoolManager llaman lockAcquired en vez de unlockCallback
    function lockAcquired(bytes calldata data) external returns (bytes memory) {
        console.log("lockAcquired -> unlockCallback alias");
        // como unlockCallback es external, la invocamos vía this.
        return this.unlockCallback(data);
    }

    // Fallback para detectar si el PoolManager llamara otro selector inesperado
    fallback(bytes calldata) external returns (bytes memory) {
        console.log("fallback called");
        console.log(msg.sender);
        revert("no such function");
    }
}
