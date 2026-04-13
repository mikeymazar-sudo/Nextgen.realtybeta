'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api/client'
import type { Property } from '@/types/schema'
import type { LeadsFilters } from '@/components/leads/leads-filter-panel'
import { format } from 'date-fns'

const COLUMNS = ['new', 'unanswered', 'contacted', 'warm', 'follow_up', 'closed'] as const
type ColumnId = (typeof COLUMNS)[number]

const PAGE_SIZE = 50

export interface ColumnState {
  leads: Property[]
  total: number
  offset: number
  hasMore: boolean
  isLoadingMore: boolean
}

export interface KanbanData {
  columns: Record<ColumnId, ColumnState>
  isInitialLoading: boolean
  error: string | null
  fetchMore: (columnId: string) => void
  refreshAll: () => void
  optimisticMove: (leadId: string, fromCol: string, toCol: string) => void
  revertMove: (leadId: string, toCol: string, fromCol: string) => void
}

function emptyColumn(): ColumnState {
  return { leads: [], total: 0, offset: 0, hasMore: false, isLoadingMore: false }
}

function initColumns(): Record<ColumnId, ColumnState> {
  const cols = {} as Record<ColumnId, ColumnState>
  for (const c of COLUMNS) {
    cols[c] = emptyColumn()
  }
  return cols
}

export function useKanbanData(
  filters: LeadsFilters,
  userId: string | undefined
): KanbanData {
  const [columns, setColumns] = useState<Record<ColumnId, ColumnState>>(initColumns)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const serializeFilters = useCallback(() => {
    return JSON.stringify({
      search: filters.search,
      priority: filters.priority,
      listId: filters.listId,
      followUpFrom: filters.followUpFrom ? format(filters.followUpFrom, 'yyyy-MM-dd') : '',
      followUpTo: filters.followUpTo ? format(filters.followUpTo, 'yyyy-MM-dd') : '',
    })
  }, [filters.search, filters.priority, filters.listId, filters.followUpFrom, filters.followUpTo])

  const buildFilterParams = useCallback(() => {
    const params: Record<string, string | undefined> = {}
    if (filters.search) params.search = filters.search
    if (filters.priority && filters.priority !== 'all') params.priority = filters.priority
    if (filters.listId && filters.listId !== 'all') params.listId = filters.listId
    if (filters.followUpFrom) params.followUpFrom = format(filters.followUpFrom, 'yyyy-MM-dd')
    if (filters.followUpTo) params.followUpTo = format(filters.followUpTo, 'yyyy-MM-dd')
    return params
  }, [filters])

  const fetchInitial = useCallback(async () => {
    if (!userId) {
      setIsInitialLoading(false)
      setColumns(initColumns())
      return
    }

    const currentFetchId = ++fetchIdRef.current
    setIsInitialLoading(true)
    setError(null)

    const result = await api.getKanbanData({
      view: 'mine',
      limit: PAGE_SIZE,
      ...buildFilterParams(),
    })

    // Stale response guard
    if (currentFetchId !== fetchIdRef.current) return

    if (result.error || !result.data) {
      setError(result.error || 'Failed to load leads.')
      setIsInitialLoading(false)
      return
    }

    const newColumns = initColumns()
    for (const col of COLUMNS) {
      const colData = result.data.columns[col]
      if (colData) {
        newColumns[col] = {
          leads: colData.leads as Property[],
          total: colData.total,
          offset: colData.leads.length,
          hasMore: colData.leads.length < colData.total,
          isLoadingMore: false,
        }
      }
    }

    setColumns(newColumns)
    setIsInitialLoading(false)
  }, [userId, buildFilterParams])

  const fetchMore = useCallback(
    async (columnId: string) => {
      if (!userId) return

      const col = columnId as ColumnId
      setColumns((prev) => {
        if (prev[col].isLoadingMore || !prev[col].hasMore) return prev
        return { ...prev, [col]: { ...prev[col], isLoadingMore: true } }
      })

      const currentOffset = columns[col]?.offset || 0
      if (!columns[col]?.hasMore || columns[col]?.isLoadingMore) return

      const result = await api.getKanbanData({
        view: 'mine',
        limit: PAGE_SIZE,
        column: columnId,
        offsets: { [columnId]: currentOffset },
        ...buildFilterParams(),
      })

      if (result.error || !result.data) {
        setColumns((prev) => ({
          ...prev,
          [col]: { ...prev[col], isLoadingMore: false },
        }))
        return
      }

      const colData = result.data.columns[col]
      if (!colData) {
        setColumns((prev) => ({
          ...prev,
          [col]: { ...prev[col], isLoadingMore: false },
        }))
        return
      }

      setColumns((prev) => {
        const newLeads = colData.leads as Property[]
        const existingIds = new Set(prev[col].leads.map((l) => l.id))
        const deduped = newLeads.filter((l) => !existingIds.has(l.id))
        const allLeads = [...prev[col].leads, ...deduped]

        return {
          ...prev,
          [col]: {
            leads: allLeads,
            total: colData.total,
            offset: allLeads.length,
            hasMore: allLeads.length < colData.total,
            isLoadingMore: false,
          },
        }
      })
    },
    [userId, columns, buildFilterParams]
  )

  const optimisticMove = useCallback(
    (leadId: string, fromCol: string, toCol: string) => {
      setColumns((prev) => {
        const from = fromCol as ColumnId
        const to = toCol as ColumnId
        const lead = prev[from].leads.find((l) => l.id === leadId)
        if (!lead) return prev

        const updatedLead = { ...lead, status: toCol as Property['status'] }
        // If moving out of follow_up, clear follow_up_date
        if (fromCol === 'follow_up' && toCol !== 'follow_up') {
          updatedLead.follow_up_date = null
        }

        return {
          ...prev,
          [from]: {
            ...prev[from],
            leads: prev[from].leads.filter((l) => l.id !== leadId),
            total: prev[from].total - 1,
          },
          [to]: {
            ...prev[to],
            leads: [updatedLead, ...prev[to].leads],
            total: prev[to].total + 1,
          },
        }
      })
    },
    []
  )

  const revertMove = useCallback(
    (leadId: string, toCol: string, fromCol: string) => {
      // Revert by moving back
      optimisticMove(leadId, toCol, fromCol)
    },
    [optimisticMove]
  )

  const refreshAll = useCallback(() => {
    void fetchInitial()
  }, [fetchInitial])

  // Fetch on mount and when filters change
  const filterKey = serializeFilters()
  useEffect(() => {
    if (!userId) return

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Debounce search, immediate for other filters
    const delay = filters.search ? 300 : 0
    debounceRef.current = setTimeout(() => {
      void fetchInitial()
    }, delay)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, userId])

  return {
    columns,
    isInitialLoading,
    error,
    fetchMore,
    refreshAll,
    optimisticMove,
    revertMove,
  }
}
