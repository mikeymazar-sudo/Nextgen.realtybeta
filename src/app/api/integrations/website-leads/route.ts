import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

type ContactEntry = {
  value?: string | null
  label?: string | null
  is_primary?: boolean | null
}

type WebsiteLeadPayload = {
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  phone?: string
  location?: string
  notes?: string
  intent?: string
  intentLabel?: string
  ctaKey?: string
  ctaTitle?: string
  pageTitle?: string
  sourcePath?: string
  sourceUrl?: string
  referrer?: string
  siteContext?: string[]
  submittedAt?: string
}

type Lead = Required<
  Pick<WebsiteLeadPayload, 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'location' | 'notes' | 'intent' | 'intentLabel' | 'ctaKey' | 'ctaTitle' | 'pageTitle' | 'sourcePath' | 'sourceUrl' | 'referrer'>
> & {
  siteContext: string[]
  submittedAt: string
}

const DEFAULT_OWNER_EMAIL = 'michaelmazar.realtor@gmail.com'

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLead(payload: WebsiteLeadPayload): Lead {
  const firstName = stringValue(payload.firstName)
  const lastName = stringValue(payload.lastName)
  const fullName = stringValue(payload.fullName) || [firstName, lastName].filter(Boolean).join(' ')

  return {
    firstName,
    lastName,
    fullName: fullName.trim(),
    email: stringValue(payload.email).toLowerCase(),
    phone: stringValue(payload.phone),
    location: stringValue(payload.location),
    notes: stringValue(payload.notes),
    intent: stringValue(payload.intent),
    intentLabel: stringValue(payload.intentLabel),
    ctaKey: stringValue(payload.ctaKey),
    ctaTitle: stringValue(payload.ctaTitle),
    pageTitle: stringValue(payload.pageTitle),
    sourcePath: stringValue(payload.sourcePath),
    sourceUrl: stringValue(payload.sourceUrl),
    referrer: stringValue(payload.referrer),
    siteContext: Array.isArray(payload.siteContext) ? payload.siteContext.map(String).filter(Boolean) : [],
    submittedAt: stringValue(payload.submittedAt) || new Date().toISOString(),
  }
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  const [scheme, token] = header.split(/\s+/)
  return scheme?.toLowerCase() === 'bearer' ? token || '' : ''
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
}

function badRequest(message: string) {
  return NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 })
}

function serverError(message = 'Internal server error') {
  return NextResponse.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 })
}

function hasEntry(entries: unknown, value: string) {
  if (!Array.isArray(entries)) return false
  const normalized = value.toLowerCase()
  return entries.some((entry) => getEntryValue(entry).toLowerCase() === normalized)
}

function getEntryValue(entry: unknown) {
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as ContactEntry
        return String(parsed.value || '').trim()
      } catch {
        return trimmed
      }
    }

    return trimmed
  }

  if (entry && typeof entry === 'object') {
    const contact = entry as ContactEntry
    return String(contact.value || '').trim()
  }

  return ''
}

function buildContactEntry(value: string, label: string, isPrimary: boolean): ContactEntry {
  return { value, label, is_primary: isPrimary }
}

function buildMetadata(lead: Lead) {
  return {
    source: 'website',
    submittedAt: lead.submittedAt,
    intent: lead.intent,
    intentLabel: lead.intentLabel,
    areaOrAddress: lead.location,
    notes: lead.notes,
    sourceUrl: lead.sourceUrl,
    sourcePath: lead.sourcePath,
    pageTitle: lead.pageTitle,
    referrer: lead.referrer,
    ctaKey: lead.ctaKey,
    ctaTitle: lead.ctaTitle,
    siteContext: lead.siteContext,
    visitor: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
    },
  }
}

function buildNote(lead: Lead) {
  const lines = [
    'Website inquiry received',
    '',
    `Name: ${lead.fullName || lead.firstName}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || 'Not provided'}`,
    `Intent: ${lead.intentLabel || lead.intent || 'Not provided'}`,
    `Area / address: ${lead.location || 'Not provided'}`,
    `CTA clicked: ${lead.ctaTitle || lead.ctaKey || 'Not provided'}`,
    `Source page: ${lead.sourceUrl || lead.sourcePath || lead.pageTitle || 'Not provided'}`,
    `Referrer: ${lead.referrer || 'Not provided'}`,
    '',
    `Notes: ${lead.notes || 'Not provided'}`,
  ]

  if (lead.siteContext.length) {
    lines.push('', 'Tool context:')
    lead.siteContext.forEach((item) => lines.push(`- ${item}`))
  }

  return lines.join('\n')
}

function deriveAddress(lead: Lead) {
  if (lead.location) return lead.location
  if (lead.sourcePath) return `Website inquiry from ${lead.sourcePath}`
  return `Website inquiry - ${lead.fullName || lead.email}`
}

async function getOwnerProfile(supabase: ReturnType<typeof createAdminClient>) {
  const configuredEmail = process.env.NEXTGEN_LEAD_OWNER_EMAIL || DEFAULT_OWNER_EMAIL
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, team_id')
    .ilike('email', configuredEmail)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load lead owner profile: ${error.message}`)
  if (data) return data

  const fallback = await supabase
    .from('profiles')
    .select('id, email, role, team_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fallback.error) throw new Error(`Failed to load fallback lead owner profile: ${fallback.error.message}`)
  if (!fallback.data) throw new Error('No CRM profile exists to own website leads.')

  return fallback.data
}

async function findPropertyByContact(supabase: ReturnType<typeof createAdminClient>, lead: Lead) {
  if (!lead.email && !lead.phone) return null

  const pageSize = 1000
  const maxContactsToScan = 10000

  for (let from = 0; from < maxContactsToScan; from += pageSize) {
    const { data, error } = await supabase
      .from('contacts')
      .select('property_id, phone_numbers, emails')
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Failed to check duplicate contacts: ${error.message}`)

    for (const contact of data || []) {
      if (lead.email && hasEntry(contact.emails, lead.email)) return contact.property_id as string
      if (lead.phone && hasEntry(contact.phone_numbers, lead.phone)) return contact.property_id as string
    }

    if (!data || data.length < pageSize) return null
  }

  return null
}

async function findPropertyByOwnerPhone(supabase: ReturnType<typeof createAdminClient>, phone: string) {
  if (!phone) return null

  const { data, error } = await supabase
    .from('properties')
    .select('id')
    .contains('owner_phone', [phone])
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to check duplicate owner phone: ${error.message}`)
  return data?.id ? (data.id as string) : null
}

async function upsertProperty(supabase: ReturnType<typeof createAdminClient>, lead: Lead, owner: { id: string; team_id: string | null }) {
  const existingPropertyId =
    (await findPropertyByContact(supabase, lead)) ||
    (await findPropertyByOwnerPhone(supabase, lead.phone))

  const warmLeadFields = {
    status: 'warm',
    priority: 'high',
    status_changed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const newPropertyFields = {
    ...warmLeadFields,
    owner_name: lead.fullName || lead.firstName || null,
    owner_first_name: lead.firstName || null,
    owner_last_name: lead.lastName || null,
    owner_phone: lead.phone ? [lead.phone] : null,
    raw_realestate_data: buildMetadata(lead),
  }

  if (existingPropertyId) {
    const { data, error } = await supabase
      .from('properties')
      .update(warmLeadFields)
      .eq('id', existingPropertyId)
      .select('id')
      .single()

    if (error) throw new Error(`Failed to update website lead property: ${error.message}`)
    return { id: data.id as string, action: 'updated' as const }
  }

  const { data, error } = await supabase
    .from('properties')
    .insert({
      ...newPropertyFields,
      address: deriveAddress(lead),
      created_by: owner.id,
      team_id: owner.team_id,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create website lead property: ${error.message}`)
  return { id: data.id as string, action: 'created' as const }
}

async function upsertContact(supabase: ReturnType<typeof createAdminClient>, propertyId: string, lead: Lead) {
  const { data: existingContact, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('property_id', propertyId)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load website lead contact: ${error.message}`)

  const phoneNumbers = Array.isArray(existingContact?.phone_numbers) ? existingContact.phone_numbers : []
  const emails = Array.isArray(existingContact?.emails) ? existingContact.emails : []
  const nextPhoneNumbers = lead.phone && !hasEntry(phoneNumbers, lead.phone)
    ? [...phoneNumbers, buildContactEntry(lead.phone, 'website', phoneNumbers.length === 0)]
    : phoneNumbers
  const nextEmails = lead.email && !hasEntry(emails, lead.email)
    ? [...emails, buildContactEntry(lead.email, 'website', emails.length === 0)]
    : emails

  if (existingContact?.id) {
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        name: lead.fullName || lead.firstName || existingContact.name || null,
        phone_numbers: nextPhoneNumbers,
        emails: nextEmails,
      })
      .eq('id', existingContact.id)

    if (updateError) throw new Error(`Failed to update website lead contact: ${updateError.message}`)
    return
  }

  const { error: insertError } = await supabase
    .from('contacts')
    .insert({
      property_id: propertyId,
      name: lead.fullName || lead.firstName || null,
      phone_numbers: lead.phone ? [buildContactEntry(lead.phone, 'website', true)] : [],
      emails: lead.email ? [buildContactEntry(lead.email, 'website', true)] : [],
    })

  if (insertError) throw new Error(`Failed to create website lead contact: ${insertError.message}`)
}

async function recordActivity(supabase: ReturnType<typeof createAdminClient>, propertyId: string, ownerId: string, lead: Lead) {
  const metadata = buildMetadata(lead)
  const [noteResult, activityResult] = await Promise.all([
    supabase
      .from('notes')
      .insert({
        property_id: propertyId,
        user_id: ownerId,
        content: buildNote(lead),
      }),
    supabase
      .from('activity_log')
      .insert({
        property_id: propertyId,
        user_id: ownerId,
        action: 'website_inquiry_received',
        old_value: null,
        new_value: 'warm',
        metadata,
      }),
  ])

  if (noteResult.error) throw new Error(`Failed to create website lead note: ${noteResult.error.message}`)
  if (activityResult.error) throw new Error(`Failed to create website lead activity: ${activityResult.error.message}`)
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.NEXTGEN_LEAD_API_TOKEN
  if (!expectedToken) return serverError('Website lead integration is not configured.')
  if (getBearerToken(request) !== expectedToken) return unauthorized()

  let body: WebsiteLeadPayload
  try {
    body = await request.json()
  } catch {
    return badRequest('Invalid JSON payload.')
  }

  const lead = normalizeLead(body)
  if (!lead.firstName || !lead.email) {
    return badRequest('First name and email are required.')
  }

  try {
    const supabase = createAdminClient()
    const owner = await getOwnerProfile(supabase)
    const property = await upsertProperty(supabase, lead, owner)

    await upsertContact(supabase, property.id, lead)
    await recordActivity(supabase, property.id, owner.id, lead)

    return NextResponse.json({
      ok: true,
      propertyId: property.id,
      action: property.action,
      status: 'warm',
    })
  } catch (error) {
    console.error('Website lead integration error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return serverError(message)
  }
}

export function GET() {
  return NextResponse.json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { Allow: 'POST' } })
}
