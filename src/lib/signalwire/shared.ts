export interface SignalWireAddress {
  id: string
  name: string
  display_name?: string | null
  locked?: boolean
  channels?: {
    audio?: string
    messaging?: string
    video?: string
  }
}

function normalizePhoneKey(value: string) {
  return value.replace(/\D/g, '')
}

function getAudioChannelKey(address: SignalWireAddress) {
  const audioChannel = address.channels?.audio
  if (!audioChannel) return ''

  const pathWithoutQuery = audioChannel.split('?')[0] || ''
  const pathSegments = pathWithoutQuery.split('/').filter(Boolean)
  return pathSegments[pathSegments.length - 1] || ''
}

export function isSignalWireExternalAudioAddress(address: SignalWireAddress) {
  return Boolean(address.channels?.audio?.startsWith('/external/'))
}

export function pickSignalWireExternalAudioAddressId(
  addresses: SignalWireAddress[]
) {
  return (
    addresses.find(
      (address) =>
        !address.locked &&
        isSignalWireExternalAudioAddress(address) &&
        address.channels?.audio
    )?.id ?? null
  )
}

export function findSignalWireOutboundAddressId(
  addresses: SignalWireAddress[],
  phoneNumber: string
) {
  const targetPhoneKey = normalizePhoneKey(phoneNumber)
  if (!targetPhoneKey) {
    return null
  }

  const exactMatch = addresses.find((address) => {
    if (address.locked || !isSignalWireExternalAudioAddress(address)) {
      return false
    }

    const candidates = [
      address.display_name || '',
      address.name,
      getAudioChannelKey(address),
    ]

    return candidates.some(
      (candidate) => normalizePhoneKey(candidate) === targetPhoneKey
    )
  })

  if (exactMatch) {
    return exactMatch.id
  }

  return pickSignalWireExternalAudioAddressId(addresses)
}
