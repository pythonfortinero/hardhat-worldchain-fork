// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "hardhat/console.sol";

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function lock(bytes calldata data) external returns (bytes memory);
}

interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

contract PMProbe is IUnlockCallback {
    address public immutable pm;

    event Tag(string t);

    constructor(address _pm) {
        pm = _pm;
    }

    // Llama PM.unlock(...)
    function goUnlock() external {
        console.log("probe.before unlock");
        emit Tag("before.unlock");
        IPoolManager(pm).unlock(hex"");
        emit Tag("after.unlock");
        console.log("probe.after unlock");
    }

    // Llama PM.lock(...)
    function goLock() external {
        console.log("probe.before lock");
        emit Tag("before.lock");
        IPoolManager(pm).lock(hex"");
        emit Tag("after.lock");
        console.log("probe.after lock");
    }

    // Callback “nuevo”
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == pm, "only PM");
        console.log("probe.unlockCallback hit");
        emit Tag("cb.unlockCallback");
        return data;
    }

    // Callback “legacy”
    function lockAcquired(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == pm, "only PM");
        console.log("probe.lockAcquired hit");
        emit Tag("cb.lockAcquired");
        return data;
    }

    fallback() external payable { console.log("probe.fallback"); }
    receive() external payable { console.log("probe.receive"); }
}
