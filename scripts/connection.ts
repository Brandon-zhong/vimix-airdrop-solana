import { Connection, clusterApiUrl } from "@solana/web3.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";

// set proxy url
const proxyUrl = "http://127.0.0.1:7890";

// create proxy agent
const agent = new HttpsProxyAgent(proxyUrl);

// create custom fetch function
const customFetch = (url: string, options: any) => {
  return fetch(url, { ...options, agent });
};

function getNetUrl(cluster: string): string {
  switch (cluster) {
    case "devnet":
      return "https://flashy-responsive-moon.solana-devnet.quiknode.pro/46b49f9ca91b8eb9bffb2c74bb10f8f6f3abd10f";
    case "testnet":
      return "https://distinguished-clean-asphalt.solana-testnet.quiknode.pro/8b0462ba51920fdcde7ce76fc363759fd3c6f534";
    case "mainnet-beta":
      return "https://distinguished-clean-asphalt.solana-mainnet.quiknode.pro/8b0462ba51920fdcde7ce76fc363759fd3c6f534";
    default:
      throw new Error(`Unsupported cluster: ${cluster}`);
  }
}

// create global connection
// clusterApiUrl("devnet")
export const globalConnection = new Connection(clusterApiUrl("devnet"), {
  fetch: customFetch,
});

// optional: create a function to get connection, for future dynamic configuration
export function getConnection(): Connection {
  return globalConnection;
}
