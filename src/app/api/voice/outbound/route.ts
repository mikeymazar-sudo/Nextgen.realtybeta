import { NextRequest, NextResponse } from 'next/server'
import { RestClient } from '@/lib/signalwire/compatibility-api'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const to = formData.get('To')?.toString()

    const twiml = new RestClient.LaML.VoiceResponse()

    if (to) {
      const dial = twiml.dial({
        callerId: process.env.SIGNALWIRE_PHONE_NUMBER!,
        answerOnBridge: true,
        record: 'record-from-answer',
      })
      dial.number(to)
    } else {
      twiml.say('No number provided.')
    }

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('Outbound cXML error:', error)
    const twiml = new RestClient.LaML.VoiceResponse()
    twiml.say('An error occurred placing your call.')
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
