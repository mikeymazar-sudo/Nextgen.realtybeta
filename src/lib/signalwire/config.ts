export interface SignalWireEnv {
  apiToken: string | null
  phoneNumber: string | null
  projectId: string | null
  spaceHost: string | null
}

function cleanSignalWireEnvValue(value: string | undefined) {
  if (!value) return null

  let cleaned = value.trim()

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim()
  }

  return cleaned || null
}

export function getSignalWireEnv(): SignalWireEnv {
  const apiToken = cleanSignalWireEnvValue(process.env.SIGNALWIRE_API_TOKEN)
  const phoneNumber = cleanSignalWireEnvValue(
    process.env.SIGNALWIRE_PHONE_NUMBER
  )
  const projectId = cleanSignalWireEnvValue(process.env.SIGNALWIRE_PROJECT_ID)
  const rawSpaceHost = cleanSignalWireEnvValue(process.env.SIGNALWIRE_SPACE_URL)

  const spaceHost = rawSpaceHost
    ? rawSpaceHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    : null

  return {
    apiToken,
    phoneNumber,
    projectId,
    spaceHost,
  }
}
