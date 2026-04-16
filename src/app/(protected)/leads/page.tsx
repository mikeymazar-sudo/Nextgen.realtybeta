'use client'

import { useState, useEffect, useMemo } from 'react'
import { AddPropertyModal } from '@/components/leads/add-property-modal'
import { CsvUploadModal } from '@/components/leads/csv-upload-modal'
import { KanbanBoard } from '@/components/leads/kanban-board'
import { LeadsFilterPanel, type LeadsFilters } from '@/components/leads/leads-filter-panel'
import { BulkActionsBar } from '@/components/leads/bulk-actions-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/auth-provider'
import { useKanbanData } from '@/hooks/use-kanban-data'

export default function LeadsPage() {
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

  const {
    columns,
    isInitialLoading,
    error,
    fetchMore,
    refreshAll,
    optimisticMove,
    revertMove,
  } = useKanbanData(filters, user?.id)

  useEffect(() => {
    try {
      sessionStorage.setItem('leads-selected-ids', JSON.stringify(Array.from(selectedIds)))
    } catch {}
  }, [selectedIds])

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

  const totalCount = useMemo(() => {
    return Object.values(columns).reduce((sum, col) => sum + col.total, 0)
  }, [columns])

  const hasFilters =
    filters.search || filters.priority !== 'all' || filters.listId !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalCount} {totalCount === 1 ? 'lead' : 'leads'}
            {hasFilters ? ' (filtered)' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <AddPropertyModal onPropertyAdded={refreshAll} />
          <CsvUploadModal onImportComplete={refreshAll} />
        </div>
      </div>

      {/* Filters */}
      <LeadsFilterPanel filters={filters} onFiltersChange={setFilters} />

      {/* Kanban Board */}
      {isInitialLoading ? (
        <div className="flex gap-4">
          {[...Array(6)].map((_, i) => (
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
            onClick={refreshAll}
          >
            Try Again
          </Button>
        </div>
      ) : totalCount === 0 && !hasFilters ? (
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No leads yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Import a CSV or add a property manually to get started.
          </p>
        </div>
      ) : (
        <KanbanBoard
          columns={columns}
          onLoadMore={fetchMore}
          optimisticMove={optimisticMove}
          revertMove={revertMove}
          refreshAll={refreshAll}
          selectedIds={selectedIds}
          isSelectionMode={selectedIds.size > 0}
          onSelect={handleSelect}
        />
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        selectedIds={selectedIds}
        onClear={handleClearSelection}
        onUpdate={refreshAll}
      />
    </div>
  )
}
