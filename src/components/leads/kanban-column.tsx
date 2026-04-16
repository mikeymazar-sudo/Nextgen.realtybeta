'use client'

import { useRef, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge } from '@/components/ui/badge'
import { LeadCard } from './lead-card'
import { Loader2 } from 'lucide-react'
import type { Property } from '@/types/schema'

interface KanbanColumnProps {
    id: string
    title: string
    color: string
    leads: Property[]
    total: number
    hasMore: boolean
    isLoadingMore: boolean
    onLoadMore: () => void
    selectedIds: Set<string>
    isSelectionMode: boolean
    onSelect: (id: string, selected: boolean) => void
    onUpdate: () => void
}

const columnColors: Record<string, string> = {
    new: 'bg-blue-500',
    warm: 'bg-orange-500',
    follow_up: 'bg-purple-500',
    closed: 'bg-green-500',
}

export function KanbanColumn({
    id,
    title,
    color,
    leads,
    total,
    hasMore,
    isLoadingMore,
    onLoadMore,
    selectedIds,
    isSelectionMode,
    onSelect,
    onUpdate,
}: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id })
    const sentinelRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Infinite scroll via IntersectionObserver
    useEffect(() => {
        const sentinel = sentinelRef.current
        const scrollContainer = scrollContainerRef.current
        if (!sentinel || !scrollContainer) return

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && hasMore && !isLoadingMore) {
                    onLoadMore()
                }
            },
            {
                root: scrollContainer,
                threshold: 0.1,
            }
        )

        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, isLoadingMore, onLoadMore])

    return (
        <div className="flex-shrink-0 w-80">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${columnColors[id] || color}`} />
                    <h3 className="font-semibold text-sm">{title}</h3>
                </div>
                <Badge variant="secondary" className="text-xs">
                    {total}
                </Badge>
            </div>

            {/* Column Content — scrollable */}
            <div
                ref={(node) => {
                    setNodeRef(node)
                    ;(scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
                }}
                className={`max-h-[calc(100vh-280px)] overflow-y-auto min-h-[200px] p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border-2 border-dashed transition-colors ${isOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-transparent'
                    }`}
            >
                <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {leads.length === 0 ? (
                        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                            No leads
                        </div>
                    ) : (
                        leads.map((lead) => (
                            <LeadCard
                                key={lead.id}
                                property={lead}
                                isSelected={selectedIds.has(lead.id)}
                                isSelectionMode={isSelectionMode}
                                onSelect={onSelect}
                                onUpdate={onUpdate}
                            />
                        ))
                    )}
                </SortableContext>

                {/* Infinite scroll sentinel */}
                <div ref={sentinelRef} className="h-1" />

                {/* Loading indicator */}
                {isLoadingMore && (
                    <div className="flex items-center justify-center py-3">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>
        </div>
    )
}
