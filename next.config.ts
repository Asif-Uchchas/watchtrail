import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL ships native bindings; load it from node_modules instead of bundling.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Lets you open the dev server from your phone on the same Wi-Fi (http://<pc-ip>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  poweredByHeader: false,
};

export default nextConfig;
