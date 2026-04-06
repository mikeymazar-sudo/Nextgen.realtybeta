import 'server-only'

import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const compatibilityApi = require('@signalwire/compatibility-api') as {
  RestClient: typeof import('@signalwire/compatibility-api')['RestClient']
}

export const { RestClient } = compatibilityApi
