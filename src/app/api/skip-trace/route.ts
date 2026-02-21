import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  isTitanSkipCompatible,
  submitAndPollSingleTrace,
} from '@/lib/integrations/titanskip'

const SkipTraceSchema = z.object({
  propertyId: z.string().uuid(),
  ownerName: z.string().optional(), // Now optional for address-only search
  address: z.string().min(3),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  force: z.boolean().optional(), // Bypass cache and re-fetch
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = SkipTraceSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid input. Provide propertyId and address.')
    }

    const { propertyId, ownerName, address, city, state, zip, force } = parsed.data

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, 'skip-trace')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // If force is true, delete existing contacts to re-fetch
    if (force) {
      await supabase.from('contacts').delete().eq('property_id', propertyId)
    } else {
      // Check cache: return if contacts already exist for this property
      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('property_id', propertyId)

      if (existingContacts && existingContacts.length > 0) {
        return apiSuccess(existingContacts, true)
      }
    }

    // Get property data from database — this has all the info we need for skip trace
    const { data: property } = await supabase
      .from('properties')
      .select('owner_name, owner_first_name, owner_last_name, city, state, zip, mailing_address, mailing_city, mailing_state, raw_realestate_data')
      .eq('id', propertyId)
      .single()

    // Determine the best values to use, merging request data with DB data
    const searchName = ownerName && ownerName.length >= 2
      ? ownerName
      : property?.owner_name || null

    const searchCity = city || property?.city || ''
    const searchState = state || property?.state || ''
    const searchZip = zip || property?.zip || ''

    console.log('Skip trace request:', { searchName, address, searchCity, searchState, searchZip })

    // ─── Waterfall Strategy ────────────────────────────────────────────────
    // 1. Check if we have enough data for TitanSkip (owner name + address + city + state)
    // 2. If yes → submit to TitanSkip API (CSV upload + poll for results)
    // 3. If no (or TitanSkip fails) → fall back to BatchData API
    // ────────────────────────────────────────────────────────────────────────

    const leadForTitanSkip = {
      owner_name: searchName,
      owner_first_name: property?.owner_first_name || null,
      owner_last_name: property?.owner_last_name || null,
      address,
      city: searchCity || null,
      state: searchState || null,
      mailing_address: property?.mailing_address || null,
      mailing_city: property?.mailing_city || null,
      mailing_state: property?.mailing_state || null,
      raw_realestate_data: property?.raw_realestate_data || null,
    }

    let contacts: Array<{
      property_id: string
      name: string
      phone_numbers: string[]
      emails: string[]
      raw_batchdata_response: Record<string, unknown>
    }> = []

    // ─── Path 1: TitanSkip (preferred) ───────────────────────────────────
    if (isTitanSkipCompatible(leadForTitanSkip)) {
      console.log('Skip trace: Lead is TitanSkip-compatible, using TitanSkip...')

      const titanResult = await submitAndPollSingleTrace(leadForTitanSkip)

      if (titanResult) {
        // Set the propertyId (submitAndPollSingleTrace returns '' as placeholder)
        contacts = [{
          property_id: propertyId,
          name: titanResult.name,
          phone_numbers: titanResult.phone_numbers,
          emails: titanResult.emails,
          raw_batchdata_response: titanResult.raw_batchdata_response,
        }]

        console.log(`Skip trace: TitanSkip found ${titanResult.phone_numbers.length} phones, ${titanResult.emails.length} emails`)
      } else {
        console.log('Skip trace: TitanSkip returned no results, falling back to BatchData...')
      }
    } else {
      console.log('Skip trace: Lead not TitanSkip-compatible (missing name/city/state), using BatchData...')
    }

    // ─── Path 2: BatchData fallback ──────────────────────────────────────
    if (contacts.length === 0) {
      let persons: Record<string, unknown>[] = []

      // Build full address object for BatchData
      const addressObj: Record<string, string> = {
        street: address,
      }
      if (searchCity) addressObj.city = searchCity
      if (searchState) addressObj.state = searchState
      if (searchZip) addressObj.zip = searchZip

      if (searchName) {
        // Try with owner name first
        const batchRes = await fetch('https://api.batchdata.com/api/v1/person/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BATCH_DATA_API_TOKEN}`,
          },
          body: JSON.stringify({
            name: searchName,
            address: addressObj,
          }),
        })

        if (batchRes.ok) {
          const batchData = await batchRes.json()
          console.log('BatchData person search response:', JSON.stringify(batchData, null, 2))
          persons = batchData?.results?.persons || batchData?.persons || []
        } else {
          const errText = await batchRes.text()
          console.error('BatchData API error (name search):', batchRes.status, errText)
        }
      }

      // Fallback: Address-only search if no results yet
      if (persons.length === 0) {
        const addressRes = await fetch('https://api.batchdata.com/api/v1/property/skip-trace', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BATCH_DATA_API_TOKEN}`,
          },
          body: JSON.stringify({
            requests: [{ propertyAddress: addressObj }],
          }),
        })

        if (addressRes.ok) {
          const addressData = await addressRes.json()
          console.log('BatchData property skip-trace response:', JSON.stringify(addressData, null, 2))
          // BatchData returns results.persons directly, not results.results[0].persons
          if (addressData?.results?.persons) {
            persons = addressData.results.persons
          }
        } else {
          const errText = await addressRes.text()
          console.error('BatchData API error (address search):', addressRes.status, errText)
        }
      }

      // Map BatchData persons to contacts
      contacts = persons.map((person: Record<string, unknown>) => {
        // Handle phoneNumbers array (BatchData format)
        const phoneNumbers = person.phoneNumbers as Array<Record<string, unknown>> || []
        const phones = phoneNumbers
          .map((p) => p.number?.toString() || '')
          .filter((v) => v && /\d{7,}/.test(v.replace(/\D/g, '')))
          .slice(0, 3)

        // Handle emails array
        const emailList = person.emails as Array<Record<string, string>> || []
        const emails = emailList
          .map((e) => e.email || e.address || '')
          .filter((v) => v && v.includes('@'))
          .slice(0, 3)

        // Get name from nested object
        const nameObj = person.name as Record<string, string> | null
        const fullName = nameObj?.full || 'Unknown Owner'

        return {
          property_id: propertyId,
          name: fullName,
          phone_numbers: phones,
          emails: emails,
          raw_batchdata_response: person,
        }
      })
    }

    if (contacts.length === 0) {
      return apiSuccess([], false)
    }

    const { data: savedContacts, error: saveError } = await supabase
      .from('contacts')
      .insert(contacts)
      .select()

    if (saveError) {
      console.error('Failed to save contacts:', saveError)
      return Errors.internal(saveError.message)
    }

    // Update property owner_phone with first contact's phones
    if (savedContacts && savedContacts.length > 0 && savedContacts[0].phone_numbers?.length > 0) {
      await supabase
        .from('properties')
        .update({ owner_phone: savedContacts[0].phone_numbers })
        .eq('id', propertyId)
    }

    return apiSuccess(savedContacts, false)
  } catch (error) {
    console.error('Skip trace error:', error)
    return Errors.internal()
  }
})
