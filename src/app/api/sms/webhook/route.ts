import { NextRequest, NextResponse } from 'next/server';
import { RestClient } from '@signalwire/compatibility-api';
import { createServerClient as createClient } from '@/lib/supabase/server';

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

    // Extract message details from SignalWire webhook
    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      NumSegments,
      SmsStatus
    } = params;

    // Collect media URLs if present
    const mediaUrls: string[] = [];
    const numMedia = parseInt(NumMedia || '0');
    for (let i = 0; i < numMedia && i < 5; i++) {
      const mediaUrl = params[`MediaUrl${i}`];
      if (mediaUrl) mediaUrls.push(mediaUrl);
    }

    // Try to find associated contact by phone number
    const supabase = await createClient();
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone', From)
      .single();

    // Store incoming message in database
    const { error } = await supabase
      .from('messages')
      .insert({
        body: Body || '',
        direction: 'inbound',
        status: 'received',
        from_number: From,
        to_number: To,
        twilio_sid: MessageSid,
        twilio_status: SmsStatus,
        contact_id: contact?.id || null,
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        num_segments: parseInt(NumSegments || '1')
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing incoming message:', error);
    }

    // Respond with empty cXML (no auto-reply)
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;

    return new NextResponse(cxml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    });

  } catch (error: any) {
    console.error('Error in SMS webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
