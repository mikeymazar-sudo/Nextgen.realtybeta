'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Phone, PhoneMissed } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api/client'
import { DealAnalysisCard } from '@/components/leads/deal-analysis'
import { RentalComps } from '@/components/leads/rental-comps'
import { SkipTrace } from '@/components/leads/skip-trace'
import { PropertyNotes } from '@/components/leads/property-notes'
import { ActivityTimeline } from '@/components/leads/activity-timeline'
import { PhotoGallery } from '@/components/leads/photo-gallery'
import type { Property, Contact, RentalEstimate, SoldEstimate } from '@/types/schema'

export default function PropertyDetailPage() {
    const params = useParams()
    const id = params.id as string

    const [property, setProperty] = useState<Property | null>(null)
    const [contacts, setContacts] = useState<Contact[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            const supabase = createClient()

            const [propRes, contactsRes] = await Promise.all([
                supabase.from('properties').select('*').eq('id', id).single(),
                api.getContacts(id),
            ])

            if (propRes.data) {
                const propertyData = propRes.data as Property & { raw_attom_data?: Record<string, unknown> | null }
                setProperty({
                    ...propertyData,
                    raw_realestate_data: propertyData.raw_realestate_data ?? propertyData.raw_attom_data ?? null,
                } as Property)
            }
            if (contactsRes.data) {
                setContacts(contactsRes.data as Contact[])
            } else if (contactsRes.error) {
                console.error('Failed to load contacts for property:', contactsRes.error)
            }
            setLoading(false)
        }
        fetchData()
    }, [id])

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-48 w-full" />
                <div className="grid lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-3 space-y-4">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                    <div className="lg:col-span-2 space-y-4">
                        <Skeleton className="h-64 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                </div>
            </div>
        )
    }

    if (!property) {
        return (
            <div className="text-center py-16">
                <h2 className="text-lg font-medium">Property not found</h2>
                <Link href="/leads" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                    Back to Leads
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Back button + contact status */}
            <div className="flex items-center justify-between">
                <Link
                    href="/leads"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Leads
                </Link>

                {/* Contact status badge */}
                {property.has_been_answered ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                        <Phone className="h-3 w-3 mr-1" />
                        Contacted
                    </Badge>
                ) : property.unanswered_count > 0 ? (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
                        <PhoneMissed className="h-3 w-3 mr-1" />
                        Unanswered ×{property.unanswered_count}
                    </Badge>
                ) : null}
            </div>

            {/* Two column layout for owner/comps/analysis */}
            <div className="grid lg:grid-cols-5 gap-6">
                {/* Left Column - 60% */}
                <div className="lg:col-span-3 space-y-6">
                    {/* Owner Info / Skip Trace */}
                    <SkipTrace
                        propertyId={property.id}
                        ownerName={property.owner_name}
                        address={property.address}
                        city={property.city}
                        state={property.state}
                        zip={property.zip}
                        existingContacts={contacts}
                        status={property.status}
                        sqft={property.sqft}
                        yearBuilt={property.year_built}
                        bedrooms={property.bedrooms}
                        bathrooms={property.bathrooms}
                        lotSize={property.lot_size}
                        propertyType={property.property_type}
                        listPrice={property.list_price}
                        realEstateData={property.raw_realestate_data}
                        onPropertyDataFetched={(data) => {
                            setProperty((prev) => prev ? { ...prev, raw_realestate_data: data } : prev)
                        }}
                    />

                    {/* Property Photos */}
                    <PhotoGallery propertyId={property.id} />

                    {/* Notes */}
                    <PropertyNotes propertyId={property.id} />
                </div>

                {/* Right Column - 40% */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Rental Comps */}
                    <RentalComps
                        propertyId={property.id}
                        address={property.address}
                        bedrooms={property.bedrooms}
                        bathrooms={property.bathrooms}
                        sqft={property.sqft}
                        existingRentalData={property.rental_data}
                        existingSoldData={property.sold_data}
                        onRentalDataFetched={(data: RentalEstimate) => {
                            setProperty((prev) => prev ? { ...prev, rental_data: data } : prev)
                        }}
                        onSoldDataFetched={(data: SoldEstimate) => {
                            setProperty((prev) => prev ? { ...prev, sold_data: data } : prev)
                        }}
                    />

                    {/* AI Analysis */}
                    <DealAnalysisCard
                        propertyId={property.id}
                        property={property}
                        existingAnalysis={property.ai_analysis}
                        analyzedAt={property.ai_analyzed_at}
                        hasRentalData={!!property.rental_data}
                        hasSoldData={!!property.sold_data}
                        photoCount={0}
                        transcriptCount={0}
                        messageCount={0}
                        onPropertyUpdate={(updates) => {
                            setProperty((prev) => prev ? { ...prev, ...updates } : prev)
                        }}
                    />

                    {/* Activity Timeline */}
                    <ActivityTimeline propertyId={property.id} />
                </div>
            </div>
        </div>
    )
}
