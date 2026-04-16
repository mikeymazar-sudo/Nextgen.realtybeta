'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/schema'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
  initialUser?: User | null
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  // Start true so the protected layout waits for auth to resolve before
  // deciding to redirect. Start false only if SSR already hydrated a user.
  const [loading, setLoading] = useState(!initialUser)
  const supabaseRef = useRef(createClient())
  const fetchedProfileUserIdRef = useRef<string | null>(null)
  const inFlightProfileUserIdRef = useRef<string | null>(null)
  const inFlightProfileRequestRef = useRef<Promise<void> | null>(null)

  const fetchProfile = useCallback(async (userId: string, { force = false }: { force?: boolean } = {}) => {
    const supabase = supabaseRef.current

    if (!force) {
      if (fetchedProfileUserIdRef.current === userId) return
      if (inFlightProfileRequestRef.current && inFlightProfileUserIdRef.current === userId) {
        await inFlightProfileRequestRef.current
        return
      }
    }

    let profileRequest: Promise<void> | null = null
    profileRequest = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          console.error('Profile fetch error:', error.message)
          return
        }

        setProfile((data as UserProfile | null) ?? null)
        fetchedProfileUserIdRef.current = userId
      } catch (err) {
        console.error('Profile fetch exception:', err)
      } finally {
        if (inFlightProfileRequestRef.current === profileRequest) {
          inFlightProfileRequestRef.current = null
          inFlightProfileUserIdRef.current = null
        }
      }
    })()

    inFlightProfileUserIdRef.current = userId
    inFlightProfileRequestRef.current = profileRequest
    await profileRequest
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id, { force: true })
  }, [user, fetchProfile])

  useEffect(() => {
    const supabase = supabaseRef.current
    let mounted = true

    const initAuth = async () => {
      try {
        // Use getSession (reads local cookie, no server call, no rate-limit risk).
        // Middleware validates the session server-side on every request.
        const { data: { session: currentSession } } = await supabase.auth.getSession()

        if (!mounted) return

        if (currentSession) {
          setSession(currentSession)
          setUser(currentSession.user)
          await fetchProfile(currentSession.user.id)
        }
        // If getSession() returns null, do NOT clear initialUser.
        // The middleware may have rotated the token in the same request, leaving
        // the client unable to read the new cookie momentarily. The actual
        // sign-out path goes through onAuthStateChange SIGNED_OUT.
      } catch (err) {
        console.error('Init auth error:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initAuth()

    // Handle all auth state changes — do NOT skip INITIAL_SESSION because
    // that is the event that fires on page refresh with the hydrated session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, newSession: Session | null) => {
        if (!mounted) return

        // Only clear state on an explicit sign-out — not on transient null sessions
        // during token rotation, which would wipe the UI mid-refresh.
        if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setProfile(null)
          setLoading(false)
          fetchedProfileUserIdRef.current = null
          inFlightProfileUserIdRef.current = null
          inFlightProfileRequestRef.current = null
          return
        }

        if (newSession) {
          setSession(newSession)
          setUser(newSession.user)
          void fetchProfile(newSession.user.id, { force: event === 'USER_UPDATED' })
        }

        setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabaseRef.current.auth.signInWithPassword({ email, password })

    if (!error) {
      setSession(data.session ?? null)
      setUser(data.user ?? null)
      if (data.user) void fetchProfile(data.user.id)
    }

    return { error: error?.message || null }
  }

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabaseRef.current.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { error: error?.message || null }
  }

  const handleSignOut = async () => {
    await supabaseRef.current.auth.signOut()
    fetchedProfileUserIdRef.current = null
    inFlightProfileUserIdRef.current = null
    inFlightProfileRequestRef.current = null
    setUser(null)
    setProfile(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut: handleSignOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
