'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { api } from '@/lib/api-client'

export type TwilioCallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

interface UseTwilioReturn {
  callState: TwilioCallState
  device: Device | null
  deviceReady: boolean
  makeCall: (toNumber: string) => Promise<string | null>
  hangUp: () => void
  toggleMute: () => void
  isMuted: boolean
  duration: number
  error: string | null
  currentCallSid: string | null
}

export function useTwilio(): UseTwilioReturn {
  const [callState, setCallState] = useState<TwilioCallState>('idle')
  const [deviceReady, setDeviceReady] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null)

  const deviceRef = useRef<Device | null>(null)
  const activeCallRef = useRef<Call | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const tokenRefreshRef = useRef<NodeJS.Timeout | null>(null)

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

  // Initialize Device
  const initDevice = useCallback(async () => {
    try {
      setError(null)
      const result = await api.getVoiceToken()

      if (result.error || !result.data) {
        setError(result.error || 'Failed to get voice token')
        return
      }

      const token = result.data.token

      // Destroy existing device if any
      if (deviceRef.current) {
        deviceRef.current.destroy()
      }

      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        logLevel: 1,
      })

      device.on('registered', () => {
        console.log('[Twilio] Device registered')
        setDeviceReady(true)
        setError(null)
      })

      device.on('unregistered', () => {
        console.log('[Twilio] Device unregistered')
        setDeviceReady(false)
      })

      device.on('error', (err) => {
        console.error('[Twilio] Device error:', err)
        setError(err.message || 'Twilio device error')
      })

      device.on('tokenWillExpire', async () => {
        console.log('[Twilio] Token expiring, refreshing...')
        try {
          const refreshResult = await api.getVoiceToken()
          if (refreshResult.data?.token) {
            device.updateToken(refreshResult.data.token)
          }
        } catch (e) {
          console.error('[Twilio] Token refresh failed:', e)
        }
      })

      device.on('incoming', (call: Call) => {
        console.log('[Twilio] Incoming call from:', call.parameters.From)
        // Auto-accept incoming calls for now
        call.accept()
        setupCallHandlers(call)
      })

      await device.register()
      deviceRef.current = device

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Twilio'
      console.error('[Twilio] Init error:', err)
      setError(message)
    }
  }, [])

  // Set up event handlers on a Call object
  const setupCallHandlers = useCallback((call: Call) => {
    activeCallRef.current = call
    setCurrentCallSid(call.parameters.CallSid || null)

    call.on('ringing', () => {
      console.log('[Twilio] Call ringing')
      setCallState('ringing')
    })

    call.on('accept', () => {
      console.log('[Twilio] Call accepted/connected')
      setCallState('live')
      startTimer()
    })

    call.on('disconnect', () => {
      console.log('[Twilio] Call disconnected')
      stopTimer()
      setCallState('ended')
      activeCallRef.current = null
      setIsMuted(false)
    })

    call.on('cancel', () => {
      console.log('[Twilio] Call cancelled')
      stopTimer()
      setCallState('ended')
      activeCallRef.current = null
      setIsMuted(false)
    })

    call.on('error', (err) => {
      console.error('[Twilio] Call error:', err)
      stopTimer()
      setError(err.message || 'Call error')
      setCallState('ended')
      activeCallRef.current = null
      setIsMuted(false)
    })
  }, [startTimer, stopTimer])

  // Make a call
  const makeCall = useCallback(async (toNumber: string): Promise<string | null> => {
    if (!deviceRef.current) {
      setError('Twilio device not ready. Please wait...')
      // Try to reinitialize
      await initDevice()
      if (!deviceRef.current) {
        return null
      }
    }

    try {
      setError(null)
      setCallState('connecting')
      setDuration(0)

      const call = await deviceRef.current.connect({
        params: {
          To: toNumber,
        },
      })

      setupCallHandlers(call)
      return call.parameters.CallSid || null
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to make call'
      console.error('[Twilio] makeCall error:', err)
      setError(message)
      setCallState('idle')
      return null
    }
  }, [initDevice, setupCallHandlers])

  // Hang up
  const hangUp = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect()
    }
    stopTimer()
  }, [stopTimer])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCallRef.current) {
      const newMuted = !isMuted
      activeCallRef.current.mute(newMuted)
      setIsMuted(newMuted)
    }
  }, [isMuted])

  // Initialize on mount
  useEffect(() => {
    initDevice()

    return () => {
      // Cleanup
      if (deviceRef.current) {
        deviceRef.current.destroy()
        deviceRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (tokenRefreshRef.current) {
        clearTimeout(tokenRefreshRef.current)
      }
    }
  }, [initDevice])

  return {
    callState,
    device: deviceRef.current,
    deviceReady,
    makeCall,
    hangUp,
    toggleMute,
    isMuted,
    duration,
    error,
    currentCallSid,
  }
}
