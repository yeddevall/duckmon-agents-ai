require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        monad: {
            url: process.env.RPC_URL || "https://rpc.monad.xyz",
            chainId: 143,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`] : [],
        },
    },
    paths: {
        sources: "./",
        cache: "./cache",
        artifacts: "./artifacts"
    },
};
