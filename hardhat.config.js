require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 480, // World Chain
      hardfork: "cancun",
      forking: {
        url: process.env.WORLDCHAIN_RPC_URL,
        blockNumber: Number(process.env.FORK_BLOCK),
      },
      initialBaseFeePerGas: 0,
      // Decimos a Hardhat qué hardfork usar para TODO el historial de esta chain
      chains: {
        480: {
          hardforkHistory: {
            cancun: 0,
          },
        },
      },
    },
  },
};