import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "ws",
    "@orca-so/whirlpools-sdk",
    "@orca-so/common-sdk",
    "@coral-xyz/anchor",
    "decimal.js",
  ],
};

export default nextConfig;
