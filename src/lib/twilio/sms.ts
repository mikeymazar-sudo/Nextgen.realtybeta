import { RestClient } from '@signalwire/compatibility-api';
import { createServerClient as createClient } from '@/lib/supabase/server';

function getSignalWireClient() {
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const apiToken = process.env.SIGNALWIRE_API_TOKEN;
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL;
  if (!projectId || !apiToken || !spaceUrl) {
    throw new Error('Missing SignalWire credentials in environment variables');
  }
  return RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

function getSignalWirePhoneNumber() {
  const phoneNumber = process.env.SIGNALWIRE_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error('Missing SIGNALWIRE_PHONE_NUMBER environment variable');
  }
  return phoneNumber;
}

export interface SendSMSParams {
  to: string;
  body: string;
  contactId?: string;
  propertyId?: string;
  mediaUrls?: string[];
}

export interface SMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  messageId?: string;
}

/**
 * Send an SMS message via Twilio and store it in the database
 */
export async function sendSMS(params: SendSMSParams): Promise<SMSResult> {
  const { to, body, contactId, propertyId, mediaUrls } = params;
  const phoneNumber = getSignalWirePhoneNumber();

  try {
    // Validate phone number format
    if (!to.startsWith('+')) {
      throw new Error('Phone number must be in E.164 format (e.g., +1234567890)');
    }

    // Send SMS via SignalWire
    const message = await getSignalWireClient().messages.create({
      body,
      from: phoneNumber,
      to,
      ...(mediaUrls && mediaUrls.length > 0 ? { mediaUrl: mediaUrls } : {})
    });

    // Store message in database
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('messages')
      .insert({
        body,
        direction: 'outbound',
        status: message.status,
        from_number: phoneNumber,
        to_number: to,
        twilio_sid: message.sid,
        twilio_status: message.status,
        contact_id: contactId || null,
        property_id: propertyId || null,
        media_urls: mediaUrls || null,
        num_segments: message.numSegments ? parseInt(message.numSegments) : 1,
        price: message.price ? parseFloat(message.price) : null,
        price_unit: message.priceUnit || 'USD'
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing message in database:', error);
      // Still return success since SignalWire sent the message
      return {
        success: true,
        messageSid: message.sid,
        error: `Message sent but not stored: ${error.message}`
      };
    }

    return {
      success: true,
      messageSid: message.sid,
      messageId: data.id
    };

  } catch (error: any) {
    console.error('Error sending SMS via SignalWire:', error);

    // Store failed message in database
    try {
      const supabase = await createClient();
      await supabase
        .from('messages')
        .insert({
          body,
          direction: 'outbound',
          status: 'failed',
          from_number: phoneNumber,
          to_number: to,
          error_code: error.code?.toString() || null,
          error_message: error.message || 'Unknown error',
          contact_id: contactId || null,
          property_id: propertyId || null,
          media_urls: mediaUrls || null
        });
    } catch (dbError) {
      console.error('Error storing failed message:', dbError);
    }

    return {
      success: false,
      error: error.message || 'Failed to send SMS'
    };
  }
}

/**
 * Get conversation history for a contact
 */
export async function getConversation(contactPhone: string, limit: number = 50) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`from_number.eq.${contactPhone},to_number.eq.${contactPhone}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  return data;
}

/**
 * Get recent messages
 */
export async function getRecentMessages(limit: number = 50) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      contact:contacts(id, name, email),
      property:properties(id, address, city, state)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch recent messages: ${error.message}`);
  }

  return data;
}

/**
 * Update message status from SignalWire webhook
 */
export async function updateMessageStatus(
  twilioSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('messages')
    .update({
      status,
      twilio_status: status,
      error_code: errorCode || null,
      error_message: errorMessage || null
    })
    .eq('twilio_sid', twilioSid);

  if (error) {
    throw new Error(`Failed to update message status: ${error.message}`);
  }
}
