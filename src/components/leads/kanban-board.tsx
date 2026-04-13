'use client'

import { useState, useCallback, useMemo } from 'react'
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Property } from '@/types/schema'
import type { ColumnState } from '@/hooks/use-kanban-data'

interface KanbanBoardProps {
    columns: Record<string, ColumnState>
    onLoadMore: (columnId: string) => void
    optimisticMove: (leadId: string, fromCol: string, toCol: string) => void
    revertMove: (leadId: string, toCol: string, fromCol: string) => void
    refreshAll: () => void
    selectedIds: Set<string>
    isSelectionMode: boolean
    onSelect: (id: string, selected: boolean) => void
}

const COLUMNS = [
    { id: 'new', title: 'New', color: 'bg-blue-500' },
    { id: 'unanswered', title: 'Unanswered', color: 'bg-red-500' },
    { id: 'contacted', title: 'Contacted', color: 'bg-cyan-500' },
    { id: 'warm', title: 'Warm', color: 'bg-orange-500' },
    { id: 'follow_up', title: 'Follow Up', color: 'bg-purple-500' },
    { id: 'closed', title: 'Closed', color: 'bg-green-500' },
] as const

type ColumnId = typeof COLUMNS[number]['id']

export function KanbanBoard({
    columns,
    onLoadMore,
    optimisticMove,
    revertMove,
    refreshAll,
    selectedIds,
    isSelectionMode,
    onSelect,
}: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                delay: 150,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    // Flat lookup map for finding leads across all columns
    const allLeadsMap = useMemo(() => {
        const map = new Map<string, { lead: Property; columnId: string }>()
        for (const col of COLUMNS) {
            const colData = columns[col.id]
            if (colData) {
                for (const lead of colData.leads) {
                    map.set(lead.id, { lead, columnId: col.id })
                }
            }
        }
        return map
    }, [columns])

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const findLeadColumn = useCallback(
        (leadId: string): ColumnId | null => {
            const entry = allLeadsMap.get(leadId)
            return entry ? (entry.columnId as ColumnId) : null
        },
        [allLeadsMap]
    )

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const leadId = active.id as string
        const sourceColumn = findLeadColumn(leadId)
        if (!sourceColumn) return

        // Determine the target column
        let targetStatus: ColumnId | null = null

        if (COLUMNS.some((col) => col.id === over.id)) {
            targetStatus = over.id as ColumnId
        } else {
            // Dropped on another card - find which column that card is in
            const targetEntry = allLeadsMap.get(over.id as string)
            if (targetEntry) {
                targetStatus = targetEntry.columnId as ColumnId
            }
        }

        if (!targetStatus || targetStatus === sourceColumn) return

        // Optimistic update
        optimisticMove(leadId, sourceColumn, targetStatus)

        // Persist to Supabase
        const supabase = createClient()
        const updateData: Record<string, unknown> = {
            status: targetStatus,
            status_changed_at: new Date().toISOString(),
        }

        // Clear follow_up_date when dragging out of follow_up column
        if (sourceColumn === 'follow_up' && targetStatus !== 'follow_up') {
            updateData.follow_up_date = null
        }

        const { error } = await supabase
            .from('properties')
            .update(updateData)
            .eq('id', leadId)

        if (error) {
            toast.error('Failed to update status')
            revertMove(leadId, targetStatus, sourceColumn)
        } else {
            const columnName = COLUMNS.find((c) => c.id === targetStatus)?.title || targetStatus
            toast.success(`Moved to ${columnName}`)
        }
    }

    const activeLead = activeId ? allLeadsMap.get(activeId)?.lead : null

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex gap-4 overflow-x-auto pb-4">
                {COLUMNS.map((column) => {
                    const colData = columns[column.id] || {
                        leads: [],
                        total: 0,
                        hasMore: false,
                        isLoadingMore: false,
                    }
                    return (
                        <KanbanColumn
                            key={column.id}
                            id={column.id}
                            title={column.title}
                            color={column.color}
                            leads={colData.leads}
                            total={colData.total}
                            hasMore={colData.hasMore}
                            isLoadingMore={colData.isLoadingMore}
                            onLoadMore={() => onLoadMore(column.id)}
                            selectedIds={selectedIds}
                            isSelectionMode={isSelectionMode}
                            onSelect={onSelect}
                            onUpdate={refreshAll}
                        />
                    )
                })}
            </div>

            {/* Drag overlay for visual feedback */}
            <DragOverlay>
                {activeLead ? (
                    <div className="opacity-80">
                        <LeadCard
                            property={activeLead}
                            isSelected={false}
                            isSelectionMode={false}
                            onSelect={() => { }}
                            onUpdate={() => { }}
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    )
}
