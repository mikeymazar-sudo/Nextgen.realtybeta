'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { AddPropertyModal } from '@/components/leads/add-property-modal'
import { CsvUploadModal } from '@/components/leads/csv-upload-modal'
import { KanbanBoard } from '@/components/leads/kanban-board'
import { LeadsFilterPanel, type LeadsFilters } from '@/components/leads/leads-filter-panel'
import { BulkActionsBar } from '@/components/leads/bulk-actions-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api/client'
import { useAuth } from '@/providers/auth-provider'
import type { Property } from '@/types/schema'

export default function LeadsPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const saved = sessionStorage.getItem('leads-selected-ids')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [filters, setFilters] = useState<LeadsFilters>({
    search: '',
    priority: 'all',
    listId: 'all',
    followUpFrom: undefined,
    followUpTo: undefined,
  })
  const { user } = useAuth()

  const fetchProperties = useCallback(async () => {
    if (!user) {
      setLoading(false)
      setProperties([])
      return
    }

    setLoading(true)
    setError(null)

    const PAGE_SIZE = 100
    let allData: Property[] = []
    let offset = 0
    let total = Infinity

    while (allData.length < total) {
      const result = await api.getProperties({
        view: 'mine',
        limit: PAGE_SIZE,
        offset,
        sortBy: 'created_at',
        sortOrder: 'desc',
      })

      if (result.error || !result.data) {
        setProperties([])
        setError(result.error || 'Failed to load leads.')
        setLoading(false)
        return
      }

      const pageData = result.data.properties || []
      total = result.data.total
      allData = allData.concat(pageData as Property[])

      if (pageData.length === 0) {
        break
      }

      offset += pageData.length
    }

    setProperties(allData)
    setLoading(false)
  }, [user])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchProperties()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fetchProperties])

  useEffect(() => {
    try {
      sessionStorage.setItem('leads-selected-ids', JSON.stringify(Array.from(selectedIds)))
    } catch {}
  }, [selectedIds])

  // Filter properties locally
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      // Search filter (address, city, owner, list name)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const matchesSearch =
          p.address?.toLowerCase().includes(searchLower) ||
          p.city?.toLowerCase().includes(searchLower) ||
          p.state?.toLowerCase().includes(searchLower) ||
          p.owner_name?.toLowerCase().includes(searchLower) ||
          p.list?.name?.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Priority filter
      if (filters.priority !== 'all' && p.priority !== filters.priority) {
        return false
      }

      // List filter
      if (filters.listId !== 'all' && p.list_id !== filters.listId) {
        return false
      }

      // Follow-up date range
      if (filters.followUpFrom && p.follow_up_date) {
        const followUp = new Date(p.follow_up_date)
        if (followUp < filters.followUpFrom) return false
      }
      if (filters.followUpTo && p.follow_up_date) {
        const followUp = new Date(p.follow_up_date)
        if (followUp > filters.followUpTo) return false
      }

      return true
    })
  }, [properties, filters])

  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const totalCount = filteredProperties.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalCount} {totalCount === 1 ? 'lead' : 'leads'}
            {filters.search || filters.priority !== 'all' || filters.listId !== 'all'
              ? ' (filtered)'
              : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <AddPropertyModal onPropertyAdded={fetchProperties} />
          <CsvUploadModal onImportComplete={fetchProperties} />
        </div>
      </div>

      {/* Filters */}
      <LeadsFilterPanel filters={filters} onFiltersChange={setFilters} />

      {/* Kanban Board */}
      {loading ? (
        <div className="flex gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-80 flex-shrink-0">
              <Skeleton className="h-8 w-24 mb-3" />
              <Skeleton className="h-[500px] rounded-lg" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 mx-auto text-red-500/40 mb-4" />
          <h3 className="text-lg font-medium">Couldn&apos;t load leads</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {error}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              void fetchProperties()
            }}
          >
            Try Again
          </Button>
        </div>
      ) : filteredProperties.length === 0 && !filters.search && filters.priority === 'all' && filters.listId === 'all' ? (
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No leads yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Import a CSV or add a property manually to get started.
          </p>
        </div>
      ) : (
        <KanbanBoard
          leads={filteredProperties}
          selectedIds={selectedIds}
          isSelectionMode={selectedIds.size > 0}
          onSelect={handleSelect}
          onUpdate={fetchProperties}
        />
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        selectedIds={selectedIds}
        onClear={handleClearSelection}
        onUpdate={fetchProperties}
      />
    </div>
  )
}
