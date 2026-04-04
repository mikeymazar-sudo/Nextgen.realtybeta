'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
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
  const [loading, setLoading] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  const getSupabase = useCallback(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return null
    }

    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }

    return supabaseRef.current
  }, [])

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = getSupabase()

    if (!supabase) {
      return
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Profile fetch error:', error.message)
        return
      }

      if (data) {
        setProfile(data as UserProfile)
      }
    } catch (err) {
      console.error('Profile fetch exception:', err)
    }
  }, [getSupabase])

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }, [user, fetchProfile])

  useEffect(() => {
    const supabase = getSupabase()
    let mounted = true

    if (!supabase) {
      return () => {
        mounted = false
      }
    }

    const syncAuth = async () => {
      try {
        const {
          data: { user: currentUser },
          error,
        } = await supabase.auth.getUser()

        if (!mounted) {
          return
        }

        if (error && !/auth session missing/i.test(error.message)) {
          console.error('Auth sync error:', error.message)
        }

        setUser(currentUser ?? null)

        if (currentUser) {
          void fetchProfile(currentUser.id)
        } else {
          setSession(null)
          setProfile(null)
        }
      } catch (err) {
        console.error('Auth sync exception:', err)
      }
    }

    void syncAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted || event === 'INITIAL_SESSION') return

        setSession(newSession)
        setUser(newSession?.user ?? null)
        setLoading(false)

        if (newSession?.user) {
          // Don't await - fetch profile in background so loading clears immediately
          fetchProfile(newSession.user.id)
        } else {
          setProfile(null)
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, getSupabase])

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabase()

    if (!supabase) {
      return { error: 'Missing Supabase configuration.' }
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message || null }
  }

  const signUp = async (email: string, password: string, fullName?: string) => {
    const supabase = getSupabase()

    if (!supabase) {
      return { error: 'Missing Supabase configuration.' }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    return { error: error?.message || null }
  }

  const handleSignOut = async () => {
    const supabase = getSupabase()

    if (supabase) {
      await supabase.auth.signOut()
    }

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
