import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "ws",
    "@orca-so/whirlpools-sdk",
    "@orca-so/common-sdk",
    "@coral-xyz/anchor",
    "decimal.js",
    "@triton-one/yellowstone-grpc",
  ],
};

export default nextConfig;
