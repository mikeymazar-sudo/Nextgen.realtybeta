import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'

export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const spaceUrl = process.env.SIGNALWIRE_SPACE_URL
    const projectId = process.env.SIGNALWIRE_PROJECT_ID
    const apiToken = process.env.SIGNALWIRE_API_TOKEN

    if (!spaceUrl || !projectId || !apiToken) {
      return apiError(
        'Voice calling is not configured for this environment.',
        'VOICE_NOT_CONFIGURED',
        503
      )
    }

    const credentials = Buffer.from(`${projectId}:${apiToken}`).toString('base64')

    const response = await fetch(
      `https://${spaceUrl}/api/fabric/subscribers/tokens`,
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
      return Errors.externalApi('SignalWire', { status: response.status })
    }

    const data = await response.json()

    return apiSuccess({ token: data.token, identity: user.id })
  } catch (error) {
    console.error('Voice token error:', error)
    return Errors.internal()
  }
})
