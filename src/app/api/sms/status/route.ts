import { NextRequest, NextResponse } from 'next/server';
import { RestClient } from '@signalwire/compatibility-api';
import { updateMessageStatus } from '@/lib/twilio/sms';

const signingKey = process.env.SIGNALWIRE_SIGNING_KEY;

export async function POST(request: NextRequest) {
  try {
    // Get the SignalWire signature for validation
    const signature = request.headers.get('x-signalwire-signature') || '';
    const url = request.url;

    // Parse form data from SignalWire webhook
    const formData = await request.formData();
    const params: Record<string, any> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });

    // Validate webhook authenticity
    if (signingKey) {
      const isValid = RestClient.validateRequest(
        signingKey,
        signature,
        url,
        params
      );

      if (!isValid) {
        console.error('Invalid SignalWire signature');
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    // Extract status details
    const {
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage
    } = params;

    // Update message status in database
    await updateMessageStatus(
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage
    );

    return new NextResponse('OK', { status: 200 });

  } catch (error: any) {
    console.error('Error in SMS status webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
