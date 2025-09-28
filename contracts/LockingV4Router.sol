// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "hardhat/console.sol";

/// ===== Interfaces v4 (World Chain) =====
interface IERC20 {
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IHooks { } // placeholder

// v4 usa un tipo compacto para las dos deltas
type BalanceDelta is int256;

library BalanceDeltaLib {
    // amount0 = (delta >> 128), con signo
    function amount0(BalanceDelta d) internal pure returns (int256 _a0) {
        assembly {
            _a0 := sar(128, d)
        }
    }
    // amount1 = parte baja de 128 bits, con sign-extend
    function amount1(BalanceDelta d) internal pure returns (int256 _a1) {
        assembly {
            _a1 := signextend(15, d)
        }
    }
}

interface IPoolManager {
    struct PoolKey {
        IERC20 token0;        // ¡IERC20, no address!
        IERC20 token1;
        uint24  fee;
        int24   tickSpacing;
        IHooks  hooks;
    }
    struct SwapParams {
        bool     zeroForOne;
        int256   amountSpecified;     // exactIn si negativo
        uint160  sqrtPriceLimitX96;   // 0 => sin límite
    }

    // v4 estable
    function unlock(bytes calldata data) external returns (bytes memory);           // → llama unlockCallback en msg.sender
    function swap(PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        returns (BalanceDelta);                                                     // devuelve BalanceDelta
    function settle() external payable returns (uint256 paid);
    function take(IERC20 token, address to, uint256 amount) external;               // cobra output
    function sync(address currency) external;
}

/// Callback correcta en v4 estable
interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

contract LockingV4Router is IUnlockCallback {
    using BalanceDeltaLib for BalanceDelta;

    address public immutable poolManager;
    IERC20  public immutable WARS;
    IERC20  public immutable USDCE;

    uint24  public constant FEE = 3000;
    int24   public constant TICK_SPACING = 60;
    IHooks  public constant HOOKS = IHooks(address(0));

    // Constantes v3/v4 (Q64.96) — límites válidos
    uint160 constant MIN_SQRT_RATIO = 4295128739;
    uint160 constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    // Contexto para el lock
    address private _caller;
    uint256 private _amountIn;
    bool    private _zeroForOne;

    // --- Debug events (si querés ver el flujo en el nodo) ---
    event Log(string tag);
    event Log2(string tag, int256 d0, int256 d1);
    event LogPay(string tag, address token, uint256 amount);

    constructor(address _pm, address _wars, address _usdce) {
        poolManager = _pm;
        WARS = IERC20(_wars);
        USDCE = IERC20(_usdce);
    }

    /// Usuario vende WARS por USDC.e (exact in)
    function swapExactInWARSForUSDCe(uint256 amountIn) external returns (int256 d0, int256 d1) {
        emit Log("swap.start");
        console.log("swap.start");
        console.logUint(amountIn);
        console.log("before.unlock");


        // Traemos WARS del usuario al router (el PM nos los va a “tirar” vía settle())
        require(WARS.transferFrom(msg.sender, address(this), amountIn), "transferFrom WARS failed");
        emit Log("after.transferFrom");

        // Ordenamos tokens y definimos dirección de swap
        (IERC20 t0, IERC20 t1) = _sort(WARS, USDCE);
        _zeroForOne = (address(WARS) == address(t0));
        _caller = msg.sender;
        _amountIn = amountIn;

        IPoolManager.PoolKey memory key = IPoolManager.PoolKey({
            token0: t0,
            token1: t1,
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: HOOKS
        });

        IPoolManager.SwapParams memory sp = IPoolManager.SwapParams({
            zeroForOne: _zeroForOne,
            // exactIn => NEGATIVO en v4 estable
            amountSpecified: -int256(_amountIn),
            sqrtPriceLimitX96: _zeroForOne ? (MIN_SQRT_RATIO + 1) : (MAX_SQRT_RATIO - 1)
        });

        emit Log("before.unlock");
        console.log("before.unlock, zeroForOne:", _zeroForOne);
        bytes memory ret = IPoolManager(poolManager).unlock(abi.encode(key, sp));
        (d0, d1) = abi.decode(ret, (int256, int256)); // deltas finales informativos
        emit Log2("after.unlock", d0, d1);
        console.log("after.unlock d0,d1");
        console.logInt(d0);
        console.logInt(d1);

        // En este punto, si hubo output, ya lo “tomamos” al router en la callback.
        // Lo pasamos al usuario.
        IERC20 out = _zeroForOne ? t1 : t0;
        int256 outDelta = _zeroForOne ? d1 : d0; // para WARS->USDC.e esto es POSITIVO
        if (outDelta > 0) {
            uint256 amountOut = uint256(outDelta);
            emit LogPay("send.out", address(out), amountOut);
            require(out.transfer(_caller, amountOut), "transfer out failed");
        }

        // limpiar
        _caller = address(0);
        _amountIn = 0;
        _zeroForOne = false;
    }

    /// === Callback que exige el PoolManager ===
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == poolManager, "only PM");

        (IPoolManager.PoolKey memory key, IPoolManager.SwapParams memory sp) =
            abi.decode(data, (IPoolManager.PoolKey, IPoolManager.SwapParams));

        console.log("unlock.enter");

        // 1) Ejecutar swap → BalanceDelta (d0,d1)
        BalanceDelta bd = IPoolManager(poolManager).swap(key, sp, "");
        int256 d0 = bd.amount0();
        int256 d1 = bd.amount1();
        console.log("after.swap d0,d1");
        console.logInt(d0);
        console.logInt(d1);

        // 2) Pagar lo adeudado al PM: delta < 0  =>  approve + settle
        uint256 pay0 = d0 < 0 ? uint256(-d0) : 0;
        uint256 pay1 = d1 < 0 ? uint256(-d1) : 0;

        // ✅ Pagar token0 (si corresponde): sync -> transfer -> settle()
        if (pay0 > 0) {
            console.log("pay token0");
            console.logUint(pay0);
            IPoolManager(poolManager).sync(address(key.token0));   // 1) marcar moneda
            require(key.token0.transfer(poolManager, pay0), "t0 transfer->PM failed"); // 2) push
            IPoolManager(poolManager).settle();                    // 3) sin argumentos
        }

        // ✅ Pagar token1 (si corresponde): sync -> transfer -> settle()
        if (pay1 > 0) {
            console.log("pay token1");
            console.logUint(pay1);
            IPoolManager(poolManager).sync(address(key.token1));
            require(key.token1.transfer(poolManager, pay1), "t1 transfer->PM failed");
            IPoolManager(poolManager).settle();
        }

        // 3) Cobrar lo que el PM nos debe: delta > 0  =>  take
        uint256 take0 = d0 > 0 ? uint256(d0) : 0;
        uint256 take1 = d1 > 0 ? uint256(d1) : 0;

        if (take0 > 0) {
            console.log("take token0");
            console.logUint(take0);
            IPoolManager(poolManager).take(key.token0, address(this), take0);
        }
        if (take1 > 0) {
            console.log("take token1");
            console.logUint(take1);
            IPoolManager(poolManager).take(key.token1, address(this), take1);
        }

        console.log("lock.exit");
        return abi.encode(d0, d1);
    }

    function _sort(IERC20 a, IERC20 b) internal pure returns (IERC20 t0, IERC20 t1) {
        (t0, t1) = (uint160(address(a)) < uint160(address(b))) ? (a, b) : (b, a);
    }
}
