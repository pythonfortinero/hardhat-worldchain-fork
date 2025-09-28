// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Interfaz mínima igual a la que venís usando en JS
interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24  fee;
        int24   tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool     zeroForOne;
        int256   amountSpecified;       // >0 = exactIn ; <0 = exactOut
        uint160  sqrtPriceLimitX96;     // 0 para sin límite estricto
    }

    // devuelve deltas: positivos = PM te debe; negativos = vos le debés (convención típica)
    function swap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) external returns (int256 delta0, int256 delta1);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * Router mínimo para una sola ruta (WARS -> USDC.e) con exactIn.
 * NOTA: en algunas builds de v4, el PM puede requerir callbacks extra.
 * Si revierte, después ajustamos el flujo.
 */
contract SimpleV4Router {
    address public immutable poolManager;
    address public immutable WARS;
    address public immutable USDCe;

    uint24  public constant FEE = 3000;     // 0.3%
    int24   public constant TICK_SPACING = 60;
    address public constant HOOKS = address(0);

    constructor(address _pm, address _wars, address _usdce) {
        poolManager = _pm;
        WARS = _wars;
        USDCe = _usdce;
    }

    function swapExactInWARSForUSDCe(uint256 amountIn) external returns (int256 delta0, int256 delta1) {
        // Orden lexicográfico para currency0/currency1
        (address a, address b) = _sort(WARS, USDCe);
        bool zeroForOne = (a == WARS);

        // Traemos WARS del usuario a este router
        require(IERC20(WARS).transferFrom(msg.sender, address(this), amountIn), "transferFrom failed");
        // Aprobamos al PoolManager
        require(IERC20(zeroForOne ? WARS : USDCe).approve(poolManager, amountIn), "approve failed");

        IPoolManager.PoolKey memory key = IPoolManager.PoolKey({
            currency0: a,
            currency1: b,
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: HOOKS
        });

        IPoolManager.SwapParams memory sp = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: int256(amountIn), // exactIn
            sqrtPriceLimitX96: 0 // sin límite
        });

        // Llamamos a swap; si el PM requiere callback/settlement adicional, podría revertir.
        (delta0, delta1) = IPoolManager(poolManager).swap(address(this), key, sp, "");

        // Si llegamos acá, interpretamos deltas y *no* movemos nada más:
        // en varias implementaciones v4, el PM ajusta balances internos con approve/transferFrom.

        // Opcional: podrías enviar el output al msg.sender si tu PM ya acreditó tokens al router.
        // Lo dejamos mínimo para ver que pase el swap primero.
    }

    function _sort(address x, address y) internal pure returns (address a, address b) {
        (a, b) = (x < y) ? (x, y) : (y, x);
    }
}
