import { createBrowserClient } from '@supabase/ssr'
import { parse, serialize } from 'cookie'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        encode: 'tokens-only',
        getAll() {
          if (typeof document === 'undefined') {
            return []
          }

          const cookies = parse(document.cookie)

          return Object.entries(cookies).map(([name, value]) => ({
            name,
            value,
          }))
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') {
            return
          }

          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serialize(name, value, options)
          })
        },
      },
    }
  )
}
