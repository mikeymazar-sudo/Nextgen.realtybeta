'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Phone, PhoneOff, Mic, MicOff, Delete, Loader2, ChevronDown, ChevronUp, User } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTwilio } from '@/hooks/use-twilio'

const dialPad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
]

export function DialerSidebarWidget() {
    const [number, setNumber] = useState('')
    const [showNotesModal, setShowNotesModal] = useState(false)
    const [callNotes, setCallNotes] = useState('')
    const [currentCallId, setCurrentCallId] = useState<string | null>(null)
    const [savingNotes, setSavingNotes] = useState(false)
    const [isExpanded, setIsExpanded] = useState(true)
    const [contactName, setContactName] = useState<string | null>(null)
    const [propertyAddress, setPropertyAddress] = useState<string | null>(null)
    const [pendingAutoCall, setPendingAutoCall] = useState(false)
    const autoCallProcessedRef = useRef<string | null>(null)
    const { user } = useAuth()

    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const {
        callState,
        deviceReady,
        makeCall: twilioMakeCall,
        hangUp: twilioHangUp,
        toggleMute,
        isMuted,
        duration,
        error: twilioError,
        retry,
        initializing,
    } = useTwilio()

    // Show Twilio errors
    useEffect(() => {
        if (twilioError) {
            toast.error(twilioError)
        }
    }, [twilioError])

    // Clear URL params helper
    const clearDialParams = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('dial_number')
        params.delete('auto_call')
        params.delete('contact_name')
        params.delete('property_address')
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
        router.replace(newUrl, { scroll: false })
    }, [searchParams, pathname, router])

    // Check for number to dial from URL + auto_call support
    useEffect(() => {
        const dialNumber = searchParams.get('dial_number')
        const autoCall = searchParams.get('auto_call')
        const contactNameParam = searchParams.get('contact_name')
        const propertyAddressParam = searchParams.get('property_address')

        if (dialNumber) {
            // Prevent processing the same auto-call twice
            const callKey = `${dialNumber}-${autoCall}`
            if (autoCallProcessedRef.current === callKey) return

            setNumber(dialNumber)
            setIsExpanded(true)

            if (contactNameParam) setContactName(decodeURIComponent(contactNameParam))
            if (propertyAddressParam) setPropertyAddress(decodeURIComponent(propertyAddressParam))

            if (autoCall === 'true') {
                autoCallProcessedRef.current = callKey
                if (deviceReady && callState === 'idle') {
                    // Device is ready, call immediately
                    initiateAutoCall(dialNumber)
                } else {
                    // Device not ready yet, set pending flag
                    setPendingAutoCall(true)
                }
            }
        }
    }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

    // Handle pending auto-call when device becomes ready
    useEffect(() => {
        if (pendingAutoCall && deviceReady && callState === 'idle' && number) {
            setPendingAutoCall(false)
            initiateAutoCall(number)
        }
    }, [pendingAutoCall, deviceReady, callState, number]) // eslint-disable-line react-hooks/exhaustive-deps

    const initiateAutoCall = async (phoneNumber: string) => {
        // Clear URL params immediately to prevent re-triggers
        clearDialParams()

        // Small delay to let state settle
        await new Promise(r => setTimeout(r, 100))

        try {
            const supabase = createClient()
            const { data: callRecord } = await supabase
                .from('calls')
                .insert({
                    caller_id: user?.id,
                    to_number: phoneNumber,
                    status: 'initiated',
                    from_number: '',
                })
                .select()
                .single()

            if (callRecord) {
                setCurrentCallId(callRecord.id)
            }

            const callSid = await twilioMakeCall(phoneNumber)

            if (callSid && callRecord) {
                await supabase
                    .from('calls')
                    .update({ twilio_call_sid: callSid })
                    .eq('id', callRecord.id)
            }
        } catch {
            toast.error('Failed to connect call')
        }
    }

    // Open notes modal when call ends
    useEffect(() => {
        if (callState === 'ended' && currentCallId) {
            setShowNotesModal(true)
        }
    }, [callState, currentCallId])

    const makeCall = async () => {
        if (!number.trim()) return

        setIsExpanded(true)

        try {
            // Create a call record in the database
            const supabase = createClient()
            const { data: callRecord } = await supabase
                .from('calls')
                .insert({
                    caller_id: user?.id,
                    to_number: number,
                    status: 'initiated',
                    from_number: '',
                })
                .select()
                .single()

            if (callRecord) {
                setCurrentCallId(callRecord.id)
            }

            // Make the actual Twilio call
            const callSid = await twilioMakeCall(number)

            // Update the record with the Twilio Call SID
            if (callSid && callRecord) {
                await supabase
                    .from('calls')
                    .update({ twilio_call_sid: callSid })
                    .eq('id', callRecord.id)
            }
        } catch {
            toast.error('Failed to connect call')
        }
    }

    const hangUp = async () => {
        twilioHangUp()

        // Update call record
        if (currentCallId) {
            const supabase = createClient()
            await supabase
                .from('calls')
                .update({
                    status: 'completed',
                    duration,
                    ended_at: new Date().toISOString(),
                })
                .eq('id', currentCallId)
        }
    }

    const saveCallNotes = async () => {
        if (!currentCallId) {
            setShowNotesModal(false)
            resetCall()
            return
        }

        setSavingNotes(true)
        const result = await api.updateCallNotes(currentCallId, callNotes)
        setSavingNotes(false)

        if (result.error) {
            toast.error('Failed to save notes')
        } else {
            toast.success('Call notes saved')
        }

        setShowNotesModal(false)
        resetCall()
    }

    const resetCall = () => {
        setNumber('') // Clear number on reset
        setIsExpanded(false) // Collapse dialer
        setCallNotes('')
        setCurrentCallId(null)
        setContactName(null)
        setPropertyAddress(null)
        autoCallProcessedRef.current = null
    }

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    const addDigit = (digit: string) => {
        setNumber((n) => n + digit)
    }

    const deleteDigit = () => {
        setNumber((n) => n.slice(0, -1))
    }

    return (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
            {/* Header / Toggle */}
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "h-2 w-2 rounded-full",
                        callState === 'live' ? "bg-green-500 animate-pulse" :
                            callState === 'ringing' ? "bg-blue-500 animate-pulse" :
                                callState === 'connecting' ? "bg-yellow-500" :
                                    deviceReady ? "bg-green-500" :
                                        "bg-zinc-300 dark:bg-zinc-600"
                    )} />
                    <span className="text-sm font-medium">Dialer</span>
                    {callState !== 'idle' && (
                        <span className="text-xs text-muted-foreground ml-1">
                            {callState === 'live' ? formatDuration(duration) : callState}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                    {/* Contact Info (shown when calling from property) */}
                    {(contactName || propertyAddress) && callState !== 'idle' && (
                        <div className="mb-3 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                            <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                <div className="min-w-0">
                                    {contactName && (
                                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
                                            {contactName}
                                        </p>
                                    )}
                                    {propertyAddress && (
                                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">
                                            {propertyAddress}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Number Display */}
                    <div className="mb-4">
                        <Input
                            value={number}
                            onChange={(e) => setNumber(e.target.value)}
                            placeholder="Enter number..."
                            className="text-center text-lg font-mono h-10 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                            disabled={callState !== 'idle'}
                        />
                    </div>

                    {/* Pending auto-call indicator */}
                    {pendingAutoCall && !deviceReady && (
                        <div className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Connecting to phone service...</span>
                        </div>
                    )}

                    {/* Keypad */}
                    {callState === 'idle' && !pendingAutoCall && (
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {dialPad.flat().map((digit) => (
                                <Button
                                    key={digit}
                                    variant="outline"
                                    size="sm"
                                    className="h-10 text-sm font-medium bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    onClick={() => addDigit(digit)}
                                >
                                    {digit}
                                </Button>
                            ))}
                        </div>
                    )}

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-3">
                        {callState === 'idle' && !pendingAutoCall ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-muted-foreground hover:text-foreground"
                                    onClick={deleteDigit}
                                    disabled={!number}
                                >
                                    <Delete className="h-5 w-5" />
                                </Button>
                                <Button
                                    size="icon"
                                    className="h-12 w-12 rounded-full bg-green-600 hover:bg-green-700 shadow-sm"
                                    onClick={makeCall}
                                    disabled={!number.trim() || !deviceReady}
                                >
                                    <Phone className="h-5 w-5" />
                                </Button>
                            </>
                        ) : callState === 'connecting' || pendingAutoCall ? (
                            <Button
                                size="icon"
                                className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 shadow-sm"
                                onClick={hangUp}
                            >
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        "h-10 w-10 rounded-full transition-colors",
                                        isMuted
                                            ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400"
                                            : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    )}
                                    onClick={toggleMute}
                                    title={isMuted ? 'Unmute' : 'Mute'}
                                >
                                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                </Button>
                                <Button
                                    size="icon"
                                    className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 shadow-sm"
                                    onClick={hangUp}
                                >
                                    <PhoneOff className="h-5 w-5" />
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Mute label */}
                    {(callState === 'ringing' || callState === 'live') && (
                        <p className="text-center text-xs text-muted-foreground mt-2">
                            {isMuted ? 'Muted' : 'Tap mic to mute'}
                        </p>
                    )}

                    {/* Twilio error with retry */}
                    {twilioError && !initializing && (
                        <div className="mt-3 text-center">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={retry}
                            >
                                Retry Connection
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Call Notes Modal */}
            <Dialog open={showNotesModal} onOpenChange={(open) => {
                if (!open && !savingNotes) {
                    setShowNotesModal(false);
                    resetCall();
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Call Notes</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="text-sm text-muted-foreground">
                            <p>Called: {number}</p>
                            {contactName && <p>Contact: {contactName}</p>}
                            {propertyAddress && <p>Property: {propertyAddress}</p>}
                            <p>Duration: {formatDuration(duration)}</p>
                        </div>
                        <Textarea
                            placeholder="Add notes about this call..."
                            value={callNotes}
                            onChange={(e) => setCallNotes(e.target.value)}
                            className="min-h-[120px]"
                        />
                        <div className="flex flex-wrap gap-2">
                            {['No Answer', 'Left Voicemail', 'Interested', 'Not Interested', 'Wrong Number'].map((tag) => (
                                <Button
                                    key={tag}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setCallNotes((n) => (n ? `${n}\n${tag}` : tag))}
                                >
                                    {tag}
                                </Button>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowNotesModal(false); resetCall() }}>
                            Skip
                        </Button>
                        <Button onClick={saveCallNotes} disabled={savingNotes}>
                            {savingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save & Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
