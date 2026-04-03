// Type shim for @signalwire/compatibility-api
// The package has types but doesn't expose them in its "exports" field,
// which is required for moduleResolution: "bundler".
declare module '@signalwire/compatibility-api' {
  export { RestClient } from '@signalwire/compatibility-api/compatibility-api'
}
