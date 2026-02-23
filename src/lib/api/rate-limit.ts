import { createAdminClient } from '@/lib/supabase/server'

interface RateLimitConfig {
  maxCalls: number
  windowMinutes: number
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'property-lookup': { maxCalls: 50, windowMinutes: 60 },
  'ai-analyze': { maxCalls: 20, windowMinutes: 60 },
  'skip-trace': { maxCalls: 30, windowMinutes: 60 },
  'rental-comps': { maxCalls: 50, windowMinutes: 60 },
  'sold-comps': { maxCalls: 30, windowMinutes: 60 },
  'send-email': { maxCalls: 100, windowMinutes: 60 },
  'ai-vision': { maxCalls: 15, windowMinutes: 60 },
  'comp-images': { maxCalls: 20, windowMinutes: 60 },
  'photo-upload': { maxCalls: 100, windowMinutes: 60 },
}

export async function checkRateLimit(
  userId: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining?: number }> {
  const config = RATE_LIMITS[endpoint]
  if (!config) return { allowed: true }

  try {
    const supabase = createAdminClient()

    // Count recent usage within the time window
    const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000).toISOString()

    const { count, error } = await supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart)

    // If the table doesn't exist or query fails, allow the request (fail open)
    if (error) {
      console.warn('Rate limit check failed, allowing request:', error.message)
      return { allowed: true }
    }

    const used = count || 0
    if (used >= config.maxCalls) {
      return { allowed: false, remaining: 0 }
    }

    // Log this usage
    await supabase.from('api_usage').insert({
      user_id: userId,
      endpoint,
    })

    return { allowed: true, remaining: config.maxCalls - used - 1 }
  } catch (error) {
    // If anything throws, fail open rather than blocking the user
    console.warn('Rate limit error, allowing request:', error)
    return { allowed: true }
  }
}
