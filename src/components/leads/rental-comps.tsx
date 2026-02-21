'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Home, DollarSign, TrendingUp, ExternalLink, Bed, Bath, Ruler, Calendar, MapPin, Map } from 'lucide-react'
import { api, type CompFilterOptions } from '@/lib/api/client'
import { toast } from 'sonner'
import { CompsMap } from './comps-map'
import { CompsFilters, type CompDisplayFilters } from './comps-filters'
import type { RentalEstimate, SoldEstimate, RentalComp, SoldComp } from '@/types/schema'

interface CompsProps {
  propertyId: string
  address: string
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  existingRentalData: RentalEstimate | null
  existingSoldData: SoldEstimate | null
  onRentalDataFetched: (data: RentalEstimate) => void
  onSoldDataFetched: (data: SoldEstimate) => void
}

type CompType = 'rental' | 'sold'

function generateZillowLink(address: string, type: 'rental' | 'sold', status?: string): string {
  const encoded = encodeURIComponent(address.replace(/,/g, ''))
  if (type === 'rental') {
    const isActive = status?.toLowerCase() === 'active'
    return isActive
      ? `https://www.zillow.com/homes/for_rent/${encoded}_rb/`
      : `https://www.zillow.com/homes/${encoded}_rb/`
  }
  return `https://www.zillow.com/homes/recently_sold/${encoded}_rb/`
}

export function RentalComps({
  propertyId, address, bedrooms, bathrooms, sqft,
  existingRentalData, existingSoldData,
  onRentalDataFetched, onSoldDataFetched,
}: CompsProps) {
  const [compType, setCompType] = useState<CompType>('rental')
  const [rentalData, setRentalData] = useState<RentalEstimate | null>(existingRentalData)
  const [soldData, setSoldData] = useState<SoldEstimate | null>(existingSoldData)
  const [loading, setLoading] = useState(false)
  const [selectedComp, setSelectedComp] = useState<RentalComp | SoldComp | null>(null)
  const [showMap, setShowMap] = useState(false)

  // Client-side display filters — applied instantly, no API calls
  const [displayFilters, setDisplayFilters] = useState<CompDisplayFilters>({
    beds: 'any',
    baths: 'any',
    sqftMin: '',
    sqftMax: '',
    radius: '1',
    listingStatus: 'all',
  })

  const fetchRentalComps = async (params: { radius: number; compCount: number; daysOld: number; beds?: number; baths?: number; sqftMin?: number; sqftMax?: number }) => {
    setLoading(true)
    const result = await api.getRentalComps(
      propertyId, address,
      bedrooms || undefined, bathrooms || undefined, sqft || undefined,
      params as CompFilterOptions
    )
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setRentalData(result.data)
      onRentalDataFetched(result.data)
      toast.success(result.cached ? 'Loaded cached rental data' : 'Rental estimate retrieved!')
    }
  }

  const fetchSoldComps = async (params: { radius: number; compCount: number; daysOld: number; beds?: number; baths?: number; sqftMin?: number; sqftMax?: number }) => {
    setLoading(true)
    const result = await api.getSoldComps(
      propertyId, address,
      bedrooms || undefined, bathrooms || undefined, sqft || undefined,
      params as CompFilterOptions
    )
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setSoldData(result.data)
      onSoldDataFetched(result.data)
      toast.success(result.cached ? 'Loaded cached sold data' : 'Property value retrieved!')
    }
  }

  // Only called when user clicks "Fetch Comps" button
  const handleFetchComps = (params: { radius: number; compCount: number; daysOld: number; beds?: number; baths?: number; sqftMin?: number; sqftMax?: number }) => {
    if (compType === 'rental') {
      fetchRentalComps(params)
    } else {
      fetchSoldComps(params)
    }
  }

  // Called instantly on every filter change — pure client-side, no API calls
  const handleDisplayFiltersChange = (filters: CompDisplayFilters) => {
    setDisplayFilters(filters)
  }

  const handleToggle = (type: CompType) => {
    setCompType(type)
  }

  const currentData = compType === 'rental' ? rentalData : soldData
  const hasData = !!currentData

  // Client-side filtering of already-fetched comps using display filters
  const filteredComps = (() => {
    const comps = compType === 'rental' ? rentalData?.comparables : soldData?.comparables
    if (!comps) return []

    return comps.filter((comp) => {
      // Listing status filter
      if (displayFilters.listingStatus !== 'all') {
        const s = (comp.status || '').toLowerCase()
        if (s) {
          if (displayFilters.listingStatus === 'active' && s !== 'active') return false
          if (displayFilters.listingStatus === 'closed' && s === 'active') return false
        }
      }

      // Bedrooms filter
      if (displayFilters.beds !== 'any') {
        const filterBeds = parseInt(displayFilters.beds)
        if (filterBeds === 5) {
          if (comp.bedrooms < 5) return false
        } else {
          if (comp.bedrooms !== filterBeds) return false
        }
      }

      // Bathrooms filter
      if (displayFilters.baths !== 'any') {
        const filterBaths = parseInt(displayFilters.baths)
        if (filterBaths === 4) {
          if (comp.bathrooms < 4) return false
        } else {
          if (comp.bathrooms !== filterBaths) return false
        }
      }

      // Sqft min filter
      if (displayFilters.sqftMin) {
        const min = parseInt(displayFilters.sqftMin)
        if (!isNaN(min) && comp.sqft && comp.sqft < min) return false
      }

      // Sqft max filter
      if (displayFilters.sqftMax) {
        const max = parseInt(displayFilters.sqftMax)
        if (!isNaN(max) && comp.sqft && comp.sqft > max) return false
      }

      // Distance/radius filter
      if (displayFilters.radius) {
        const maxRadius = parseFloat(displayFilters.radius)
        if (!isNaN(maxRadius) && comp.distance && comp.distance > maxRadius) return false
      }

      return true
    })
  })()

  // Count active display filters for badge
  const activeFilterCount = [
    displayFilters.beds !== 'any',
    displayFilters.baths !== 'any',
    displayFilters.sqftMin !== '',
    displayFilters.sqftMax !== '',
    displayFilters.listingStatus !== 'all',
    displayFilters.radius !== '1', // non-default radius
  ].filter(Boolean).length

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {compType === 'rental' ? (
                <Home className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-blue-600" />
              )}
              {compType === 'rental' ? 'Rental Comps' : 'Sold Comps'}
            </CardTitle>
            {/* Toggle */}
            <div className="flex rounded-lg border p-0.5 bg-zinc-100 dark:bg-zinc-800">
              <button
                onClick={() => handleToggle('rental')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compType === 'rental'
                  ? 'bg-white dark:bg-zinc-700 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Rental
              </button>
              <button
                onClick={() => handleToggle('sold')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compType === 'sold'
                  ? 'bg-white dark:bg-zinc-700 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Sold
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters — always visible */}
          <CompsFilters
            subjectBedrooms={bedrooms}
            subjectBathrooms={bathrooms}
            subjectSqft={sqft}
            compType={compType}
            onDisplayFiltersChange={handleDisplayFiltersChange}
            onFetchComps={handleFetchComps}
            loading={loading}
            defaultExpanded={!hasData}
          />

          {/* Inline loading state */}
          {loading && (
            <div className="space-y-2 py-2">
              <Skeleton className="h-8 w-32 mx-auto" />
              <Skeleton className="h-4 w-48 mx-auto" />
              <Skeleton className="h-4 w-40 mx-auto" />
            </div>
          )}

          {!loading && hasData && (
            <>
              {/* Estimate Display */}
              <div className={`text-center rounded-lg p-4 ${compType === 'rental'
                ? 'bg-green-50 dark:bg-green-900/20'
                : 'bg-blue-50 dark:bg-blue-900/20'
                }`}>
                <p className="text-sm text-muted-foreground">
                  {compType === 'rental' ? 'Estimated Monthly Rent' : 'Estimated Value'}
                </p>
                <p className={`text-3xl font-bold ${compType === 'rental' ? 'text-green-600' : 'text-blue-600'
                  }`}>
                  ${compType === 'rental'
                    ? (rentalData?.rent || 0).toLocaleString()
                    : (soldData?.price || 0).toLocaleString()
                  }
                  {compType === 'rental' && <span className="text-lg font-normal">/mo</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Range: ${compType === 'rental'
                    ? `${rentalData?.rentRangeLow?.toLocaleString()} - ${rentalData?.rentRangeHigh?.toLocaleString()}`
                    : `${soldData?.priceRangeLow?.toLocaleString()} - ${soldData?.priceRangeHigh?.toLocaleString()}`
                  }
                </p>
              </div>

              {/* Comparables List */}
              {filteredComps.length > 0 ? (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Comparable {compType === 'rental' ? 'Rentals' : 'Sales'}
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      ({filteredComps.length}
                      {activeFilterCount > 0 && ` filtered`})
                    </span>
                  </p>
                  <div className="space-y-2">
                    {filteredComps.map((comp, i) => (
                      <div
                        key={i}
                        onClick={() => setSelectedComp(comp)}
                        className="flex items-center justify-between text-sm bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs truncate font-medium">{comp.address}</p>
                            {comp.status && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${comp.status.toLowerCase() === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                                }`}>
                                {comp.status.toLowerCase() === 'active' ? 'Active' : 'Closed'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {comp.bedrooms}bd / {comp.bathrooms}ba · {comp.sqft?.toLocaleString()} sqft
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="font-semibold">
                            ${compType === 'rental'
                              ? (comp as RentalComp).rent?.toLocaleString()
                              : (comp as SoldComp).price?.toLocaleString()
                            }
                            {compType === 'rental' && <span className="font-normal text-xs">/mo</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {comp.distance?.toFixed(1)} mi
                            {compType === 'sold' && (comp as SoldComp).soldDate && (
                              <> · {new Date((comp as SoldComp).soldDate).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No comps match the current filters. Try adjusting your criteria.
                </p>
              )}

              {/* Map Section */}
              {filteredComps.length > 0 && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowMap(!showMap)}
                  >
                    <Map className="mr-2 h-4 w-4" />
                    {showMap ? 'Hide Map' : 'Show Map'}
                  </Button>
                  {showMap && (
                    <CompsMap
                      subjectAddress={address}
                      comps={filteredComps}
                      compType={compType}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Comp Detail Dialog */}
      <Dialog open={!!selectedComp} onOpenChange={() => setSelectedComp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Comparable Property
            </DialogTitle>
          </DialogHeader>
          {selectedComp && (
            <div className="space-y-4">
              {/* Address */}
              <p className="font-medium">{selectedComp.address}</p>

              {/* Price/Rent Badge */}
              <Badge
                variant="secondary"
                className={`text-lg px-3 py-1 ${compType === 'rental'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}
              >
                ${compType === 'rental'
                  ? (selectedComp as RentalComp).rent?.toLocaleString()
                  : (selectedComp as SoldComp).price?.toLocaleString()
                }
                {compType === 'rental' ? '/mo' : ''}
              </Badge>

              {/* Property Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Bed className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.bedrooms} Bedrooms</span>
                </div>
                <div className="flex items-center gap-2">
                  <Bath className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.bathrooms} Bathrooms</span>
                </div>
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.sqft?.toLocaleString()} sqft</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.distance?.toFixed(2)} miles</span>
                </div>
                {(selectedComp as RentalComp).yearBuilt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Built {(selectedComp as RentalComp).yearBuilt}</span>
                  </div>
                )}
                {compType === 'sold' && (selectedComp as SoldComp).soldDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Sold {new Date((selectedComp as SoldComp).soldDate).toLocaleDateString()}</span>
                  </div>
                )}
                {(selectedComp as RentalComp).propertyType && (
                  <div className="col-span-2 flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span>{(selectedComp as RentalComp).propertyType}</span>
                  </div>
                )}
              </div>

              {/* Zillow Link */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(generateZillowLink(selectedComp.address, compType, selectedComp.status), '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on Zillow
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
