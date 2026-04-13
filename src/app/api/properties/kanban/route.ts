import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

const COLUMNS = ['new', 'unanswered', 'contacted', 'warm', 'follow_up', 'closed'] as const
type ColumnId = (typeof COLUMNS)[number]

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') || 'mine'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const column = searchParams.get('column') as ColumnId | null
    const search = searchParams.get('search') || ''
    const priority = searchParams.get('priority') || ''
    const listId = searchParams.get('listId') || ''
    const followUpFrom = searchParams.get('followUpFrom') || ''
    const followUpTo = searchParams.get('followUpTo') || ''
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    let offsets: Record<string, number> = {}
    try {
      const offsetsParam = searchParams.get('offsets')
      if (offsetsParam) {
        offsets = JSON.parse(offsetsParam)
      }
    } catch {
      // ignore parse errors, default to 0
    }

    const supabase = createAdminClient()

    // Get user profile for team access
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id, role')
      .eq('id', user.id)
      .single()

    const columnsToFetch = column ? [column] : [...COLUMNS]

    const allowedSorts = ['created_at', 'list_price', 'address', 'updated_at', 'follow_up_date']
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at'
    const ascending = sortOrder === 'asc'

    const results = await Promise.all(
      columnsToFetch.map(async (col) => {
        const offset = offsets[col] || 0

        let query = supabase
          .from('properties')
          .select('*, list:lead_lists!properties_list_id_fkey(id, name)', { count: 'exact' })

        // Access control
        if (view === 'team' && profile?.team_id && profile?.role === 'admin') {
          query = query.eq('team_id', profile.team_id)
        } else {
          query = query.eq('created_by', user.id)
        }

        // Column-specific status/follow_up_date filter
        if (col === 'follow_up') {
          query = query.not('follow_up_date', 'is', null)
        } else {
          query = query.eq('status', col).is('follow_up_date', null)
        }

        // Shared filters
        if (search) {
          const s = search.replace(/%/g, '')
          query = query.or(
            `address.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%,owner_name.ilike.%${s}%`
          )
        }

        if (priority && priority !== 'all') {
          query = query.eq('priority', priority)
        }

        if (listId && listId !== 'all') {
          query = query.eq('list_id', listId)
        }

        if (followUpFrom) {
          query = query.gte('follow_up_date', followUpFrom)
        }

        if (followUpTo) {
          query = query.lte('follow_up_date', followUpTo)
        }

        // Sort: follow_up column by follow_up_date asc, others by user sort
        if (col === 'follow_up') {
          query = query.order('follow_up_date', { ascending: true })
        } else {
          query = query.order(safeSort, { ascending })
        }

        // Pagination
        query = query.range(offset, offset + limit - 1)

        const { data, error, count } = await query

        if (error) {
          console.error(`Kanban column ${col} error:`, error)
          return { col, leads: [], total: 0, error: error.message }
        }

        return { col, leads: data || [], total: count || 0 }
      })
    )

    const columns: Record<string, { leads: unknown[]; total: number }> = {}
    for (const result of results) {
      if ('error' in result && result.error) {
        return Errors.internal(result.error)
      }
      columns[result.col] = { leads: result.leads, total: result.total }
    }

    return apiSuccess({ columns })
  } catch (error) {
    console.error('Kanban data error:', error)
    return Errors.internal()
  }
})
