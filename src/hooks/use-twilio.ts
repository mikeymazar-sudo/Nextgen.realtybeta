'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SignalWire } from '@signalwire/js'
import { api } from '@/lib/api/client'

export type TwilioCallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

type SignalWireClient = Awaited<ReturnType<typeof SignalWire>>

interface UseTwilioReturn {
  callState: TwilioCallState
  device: SignalWireClient | null
  deviceReady: boolean
  makeCall: (toNumber: string) => Promise<string | null>
  hangUp: () => void
  toggleMute: () => void
  isMuted: boolean
  duration: number
  error: string | null
  currentCallSid: string | null
  retry: () => void
  initializing: boolean
}

interface UseTwilioOptions {
  suppressConfigurationErrors?: boolean
}

export function useTwilio({
  suppressConfigurationErrors = false,
}: UseTwilioOptions = {}): UseTwilioReturn {
  const [callState, setCallState] = useState<TwilioCallState>('idle')
  const [deviceReady, setDeviceReady] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)

  const clientRef = useRef<SignalWireClient | null>(null)
  const activeCallRef = useRef<any>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // Timer helpers
  const startTimer = useCallback(() => {
    setDuration(0)
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Set up event handlers on a SignalWire call object (FabricRoomSession)
  const setupCallHandlers = useCallback((call: any) => {
    activeCallRef.current = call
    setCurrentCallSid(call.id || null)

    call.on('trying', () => {
      console.log('[SignalWire] Call trying')
      if (mountedRef.current) setCallState('connecting')
    })

    call.on('ringing', () => {
      console.log('[SignalWire] Call ringing')
      if (mountedRef.current) setCallState('ringing')
    })

    call.on('active', () => {
      console.log('[SignalWire] Call active/connected')
      if (mountedRef.current) {
        setCallState('live')
        startTimer()
      }
    })

    call.on('destroy', () => {
      console.log('[SignalWire] Call destroyed/ended')
      stopTimer()
      if (mountedRef.current) {
        setCallState('ended')
        setIsMuted(false)
      }
      activeCallRef.current = null
    })

    call.on('hangup', () => {
      console.log('[SignalWire] Call hung up')
      stopTimer()
      if (mountedRef.current) {
        setCallState('ended')
        setIsMuted(false)
      }
      activeCallRef.current = null
    })
  }, [startTimer, stopTimer])

  // Initialize SignalWire client
  const initDevice = useCallback(async () => {
    try {
      setError(null)
      setInitializing(true)

      console.log('[SignalWire] Fetching voice token...')
      const result = await api.getVoiceToken()

      if (!mountedRef.current) return

      if (result.error || !result.data) {
        const isConfigurationError = result.code === 'VOICE_NOT_CONFIGURED'
        const errorMsg = isConfigurationError
          ? 'Voice calling is not configured for this environment.'
          : result.error || 'Failed to get voice token'

        setError(
          isConfigurationError && suppressConfigurationErrors
            ? null
            : `Voice setup failed: ${errorMsg}`
        )
        setDeviceReady(false)
        setInitializing(false)
        return
      }

      const token = result.data.token
      console.log('[SignalWire] Token received, initializing client...')

      // Disconnect existing client if any
      if (clientRef.current) {
        try { await clientRef.current.offline() } catch {}
        clientRef.current = null
      }

      // Clear any existing token refresh interval
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current)
        tokenRefreshRef.current = null
      }

      const sw = await SignalWire({ token })

      if (!mountedRef.current) {
        try { await sw.offline() } catch {}
        return
      }

      await sw.online({
        incomingCallHandlers: {
          all: async (notification: any) => {
            console.log('[SignalWire] Incoming call')
            if (!mountedRef.current) return
            const call = await notification.invite.accept({ audio: true, video: false })
            setupCallHandlers(call)
          }
        }
      })

      if (!mountedRef.current) {
        try { await sw.offline() } catch {}
        return
      }

      clientRef.current = sw
      setDeviceReady(true)
      setError(null)
      setInitializing(false)
      console.log('[SignalWire] Client online and ready')

      // Proactively refresh token every 50 minutes (tokens last 2 hours)
      tokenRefreshRef.current = setInterval(async () => {
        try {
          console.log('[SignalWire] Refreshing token...')
          const refreshResult = await api.getVoiceToken()
          if (refreshResult.data?.token && clientRef.current) {
            await clientRef.current.updateToken(refreshResult.data.token)
          }
        } catch (e) {
          console.error('[SignalWire] Token refresh failed:', e)
        }
      }, 50 * 60 * 1000)

    } catch (err: unknown) {
      if (!mountedRef.current) return
      const message = err instanceof Error ? err.message : 'Failed to initialize SignalWire'
      console.error('[SignalWire] Init error:', err)
      setError(`Voice setup failed: ${message}`)
      setInitializing(false)
    }
  }, [setupCallHandlers, suppressConfigurationErrors])

  // Make a call
  const makeCall = useCallback(async (toNumber: string): Promise<string | null> => {
    if (!clientRef.current || !deviceReady) {
      setError('SignalWire device not ready. Click retry to reconnect.')
      return null
    }

    try {
      setError(null)
      setCallState('connecting')
      setDuration(0)

      const call = await clientRef.current.dial({
        to: toNumber,
        audio: true,
        video: false,
      })

      setupCallHandlers(call)

      if (typeof call.start === 'function') {
        await call.start()
      }

      return call.id || null
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to make call'
      console.error('[SignalWire] makeCall error:', err)
      setError(message)
      setCallState('idle')
      return null
    }
  }, [deviceReady, setupCallHandlers])

  // Hang up
  const hangUp = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.hangup().catch(console.error)
    }
    stopTimer()
  }, [stopTimer])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCallRef.current) {
      const newMuted = !isMuted
      if (newMuted) {
        activeCallRef.current.audioMute().catch(console.error)
      } else {
        activeCallRef.current.audioUnmute().catch(console.error)
      }
      setIsMuted(newMuted)
    }
  }, [isMuted])

  // Retry connection
  const retry = useCallback(() => {
    console.log('[SignalWire] Retrying initialization...')
    setDeviceReady(false)
    if (tokenRefreshRef.current) {
      clearInterval(tokenRefreshRef.current)
      tokenRefreshRef.current = null
    }
    if (clientRef.current) {
      clientRef.current.offline().catch(() => {})
      clientRef.current = null
    }
    initDevice()
  }, [initDevice])

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true
    initDevice()

    return () => {
      mountedRef.current = false
      if (clientRef.current) {
        clientRef.current.offline().catch(() => {})
        clientRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current)
      }
    }
  }, [initDevice])

  return {
    callState,
    device: clientRef.current,
    deviceReady,
    makeCall,
    hangUp,
    toggleMute,
    isMuted,
    duration,
    error,
    currentCallSid,
    retry,
    initializing,
  }
}
