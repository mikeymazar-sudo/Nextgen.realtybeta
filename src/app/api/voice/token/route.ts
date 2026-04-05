import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'
import {
  findSignalWireOutboundAddressId,
  type SignalWireAddress,
} from '@/lib/signalwire/shared'
import { getSignalWireEnv } from '@/lib/signalwire/config'

export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const { spaceHost, projectId, apiToken, phoneNumber } = getSignalWireEnv()

    if (!spaceHost || !projectId || !apiToken || !phoneNumber) {
      return apiError(
        'Voice calling is not configured for this environment.',
        'VOICE_NOT_CONFIGURED',
        503
      )
    }

    const credentials = Buffer.from(`${projectId}:${apiToken}`).toString('base64')

    const response = await fetch(
      `https://${spaceHost}/api/fabric/subscribers/tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference: user.id,
        }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.error('SignalWire token error:', response.status, text)

      if (response.status === 401) {
        return apiError(
          'SignalWire authentication failed. Check SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, and SIGNALWIRE_SPACE_URL.',
          'VOICE_AUTH_FAILED',
          502,
          { status: response.status }
        )
      }

      return Errors.externalApi('SignalWire', { status: response.status })
    }

    const data = await response.json()
    const addressResponse = await fetch(
      'https://fabric.signalwire.com/api/fabric/addresses?page_size=100',
      {
        headers: {
          'Authorization': `Bearer ${data.token}`,
        },
      }
    )

    if (!addressResponse.ok) {
      const text = await addressResponse.text()
      console.error('SignalWire address lookup error:', addressResponse.status, text)
      return Errors.externalApi('SignalWire', { status: addressResponse.status })
    }

    const addressData = (await addressResponse.json()) as {
      data?: SignalWireAddress[]
    }

    const outboundAddressId = findSignalWireOutboundAddressId(
      addressData.data || [],
      phoneNumber
    )

    if (!outboundAddressId) {
      return apiError(
        'SignalWire outbound audio address not found for SIGNALWIRE_PHONE_NUMBER.',
        'VOICE_OUTBOUND_NOT_CONFIGURED',
        503
      )
    }

    return apiSuccess({
      token: data.token,
      identity: user.id,
      outboundAddressId,
    })
  } catch (error) {
    console.error('Voice token error:', error)
    return Errors.internal()
  }
})
