import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SignalWire's compatibility SDK ships an ESM entry that dynamically requires
  // lodash. Keeping both packages external ensures Next traces them into the
  // server deployment instead of emitting a partial bundle.
  serverExternalPackages: ['@signalwire/compatibility-api', 'lodash'],
};

export default nextConfig;
