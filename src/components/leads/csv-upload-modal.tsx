'use client'

import { useState, useRef, useMemo } from 'react'
import Papa from 'papaparse'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle, ArrowRight, ArrowLeft, ChevronDown, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api/client'

interface CsvUploadModalProps {
    onImportComplete: () => void
}

interface RawRow {
    [key: string]: string | undefined
}

interface ImportResult {
    imported: number
    skipped: number
    errors: number
    errorDetails?: string
}

// The target fields we support
const TARGET_FIELDS = [
    // Basic Info
    { key: 'address', label: 'Address', required: true, group: 'Basic' },
    { key: 'city', label: 'City', group: 'Basic' },
    { key: 'state', label: 'State', group: 'Basic' },
    { key: 'zip', label: 'Zip Code', group: 'Basic' },
    { key: 'property_type', label: 'Property Type', group: 'Basic' },
    { key: 'owner_name', label: 'Owner Name (Full)', group: 'Basic' },
    { key: 'owner_first_name', label: 'Owner First Name', group: 'Basic' },
    { key: 'owner_last_name', label: 'Owner Last Name', group: 'Basic' },
    { key: 'owner2_name', label: '2nd Owner Name', group: 'Basic' },
    { key: 'owner_phone', label: 'Owner Phone', group: 'Basic' },
    { key: 'owner_email', label: 'Owner Email', group: 'Basic' },
    { key: 'phone_1', label: 'Phone 1', group: 'Basic' },
    { key: 'phone_2', label: 'Phone 2', group: 'Basic' },
    { key: 'phone_3', label: 'Phone 3', group: 'Basic' },
    { key: 'email_1', label: 'Email 1', group: 'Basic' },
    { key: 'email_2', label: 'Email 2', group: 'Basic' },
    { key: 'email_3', label: 'Email 3', group: 'Basic' },

    // Mailing Address
    { key: 'mailing_address', label: 'Mailing Address (Full)', group: 'Mailing' },
    { key: 'mailing_street', label: 'Mailing Street', group: 'Mailing' },
    { key: 'mailing_city', label: 'Mailing City', group: 'Mailing' },
    { key: 'mailing_state', label: 'Mailing State', group: 'Mailing' },
    { key: 'mailing_zip', label: 'Mailing Zip', group: 'Mailing' },
    { key: 'absentee_owner', label: 'Absentee Owner (Yes/No)', group: 'Mailing' },
    { key: 'owner_occupied', label: 'Owner Occupied (Yes/No)', group: 'Mailing' },
    { key: 'corporate_owned', label: 'Corporate Owned (Yes/No)', group: 'Mailing' },

    // Building Details
    { key: 'bedrooms', label: 'Bedrooms', group: 'Building' },
    { key: 'bathrooms', label: 'Bathrooms', group: 'Building' },
    { key: 'sqft', label: 'Square Feet', group: 'Building' },
    { key: 'year_built', label: 'Year Built', group: 'Building' },
    { key: 'stories', label: 'Stories', group: 'Building' },
    { key: 'units_count', label: 'Units Count', group: 'Building' },
    { key: 'garage_type', label: 'Garage Type', group: 'Building' },
    { key: 'garage_sqft', label: 'Garage Sqft', group: 'Building' },
    { key: 'basement_type', label: 'Basement Type', group: 'Building' },
    { key: 'pool', label: 'Pool (Yes/No)', group: 'Building' },
    { key: 'condition', label: 'Condition', group: 'Building' },
    { key: 'construction_type', label: 'Construction', group: 'Building' },
    { key: 'roof_type', label: 'Roof Type', group: 'Building' },
    { key: 'heating_type', label: 'Heating', group: 'Building' },
    { key: 'cooling_type', label: 'Cooling', group: 'Building' },

    // Lot & Legal
    { key: 'lot_size', label: 'Lot Sqft', group: 'Lot' },
    { key: 'lot_acres', label: 'Lot Acres', group: 'Lot' },
    { key: 'apn', label: 'APN / Parcel ID', group: 'Lot' },
    { key: 'zoning', label: 'Zoning Code', group: 'Lot' },
    { key: 'land_use', label: 'Land Use', group: 'Lot' },
    { key: 'subdivision', label: 'Subdivision', group: 'Lot' },
    { key: 'legal_description', label: 'Legal Description', group: 'Lot' },

    // Financial & Tax
    { key: 'list_price', label: 'List Price', group: 'Financial' },
    { key: 'estimated_value', label: 'Est. Value', group: 'Financial' },
    { key: 'estimated_equity', label: 'Est. Equity', group: 'Financial' },
    { key: 'tax_amount', label: 'Tax Amount', group: 'Financial' },
    { key: 'tax_year', label: 'Tax Year', group: 'Financial' },
    { key: 'assessed_value', label: 'Assessed Value (Total)', group: 'Financial' },
    { key: 'assessed_land', label: 'Assessed Land', group: 'Financial' },
    { key: 'assessed_improvement', label: 'Assessed Improvement', group: 'Financial' },
    { key: 'market_value', label: 'Market Value (Total)', group: 'Financial' },
    { key: 'market_land', label: 'Market Land', group: 'Financial' },
    { key: 'market_improvement', label: 'Market Improvement', group: 'Financial' },
    { key: 'last_sale_date', label: 'Last Sale Date', group: 'Financial' },
    { key: 'last_sale_price', label: 'Last Sale Price', group: 'Financial' },

    // Mortgage
    { key: 'mortgage_amount', label: 'Mortgage Amount', group: 'Mortgage' },
    { key: 'mortgage_lender', label: 'Mortgage Lender', group: 'Mortgage' },
    { key: 'mortgage_date', label: 'Mortgage Date', group: 'Mortgage' },
    { key: 'mortgage_rate', label: 'Mortgage Rate', group: 'Mortgage' },
    { key: 'mortgage_term', label: 'Mortgage Term', group: 'Mortgage' },
    { key: 'mortgage_type', label: 'Mortgage Type', group: 'Mortgage' },

    // Demographics
    { key: 'suggested_rent', label: 'Suggested Rent', group: 'Demographics' },
] as const

type TargetFieldKey = (typeof TARGET_FIELDS)[number]['key']

// Phone & email target field keys — used to apply extra validation before auto-mapping.
const PHONE_FIELD_KEYS = new Set<TargetFieldKey>(['owner_phone', 'phone_1', 'phone_2', 'phone_3'])
const EMAIL_FIELD_KEYS = new Set<TargetFieldKey>(['owner_email', 'email_1', 'email_2', 'email_3'])
const CONTACT_FIELD_KEYS = new Set<TargetFieldKey>([...PHONE_FIELD_KEYS, ...EMAIL_FIELD_KEYS])

// Column name patterns that should NEVER be auto-mapped to phone/email fields.
// These typically hold carrier names, line types, DNC flags, or skip trace metadata
// rather than actual phone numbers or email addresses.
const CARRIER_COLUMN_BLOCKLIST = [
    'carrier', 'phone_type', 'phonetype', 'line_type', 'linetype',
    'phone_carrier', 'number_type', 'numbertype', 'dnc', 'do_not_call',
    'donotcall', 'type_of_phone', 'phone_line_type',
    // Skip trace metadata date fields
    'lastreporteddate', 'lastreported', 'firstreporteddate',
]

// Suffixes that indicate metadata columns when they appear as the last segment
// after a dot separator in structured column names (e.g., "Skiptrace:phoneNumbers.0.type").
// These are NOT safe to add to the flat blocklist because they'd match legitimate
// top-level fields (e.g., "property_type" contains "type").
const METADATA_SUFFIXES = ['type', 'carrier', 'linetype', 'line_type']

/**
 * Check if a normalized column name is skip trace metadata rather than an actual value.
 * e.g. "skiptrace:phonenumbers.0.type" → blocked (suffix "type")
 *      "skiptrace:phonenumbers.0.number" → allowed (suffix "number")
 *      "property_type" → not blocked (no dot separator)
 */
function isSkipTraceMetadataColumn(normalized: string): boolean {
    const lastDotIndex = normalized.lastIndexOf('.')
    if (lastDotIndex === -1) return false
    const suffix = normalized.slice(lastDotIndex + 1)
    return METADATA_SUFFIXES.includes(suffix)
}

// Keywords that suggest a CSV column should map to a target field.
const FIELD_KEYWORDS: Record<TargetFieldKey, string[]> = {
    // Basic
    address: ['address', 'street', 'addr', 'property_address', 'site_address', 'situs', 'location'],
    city: ['city', 'town', 'municipality'],
    state: ['state', 'province'],
    zip: ['zip', 'postal', 'postcode', 'zcode'],
    property_type: ['property_type', 'prop_type', 'type', 'use_code', 'land_use_desc', 'standardized_land_use'],
    owner_name: ['owner', 'name', 'seller', 'grantor', 'contact', 'owner_1_fullname', 'full_name', 'fullname'],
    owner_first_name: ['first_name', 'firstname', 'owner_first', 'owner_1_first', 'owner1firstname', 'owner_first_name'],
    owner_last_name: ['last_name', 'lastname', 'owner_last', 'owner_1_last', 'owner1lastname', 'surname', 'owner_last_name'],
    owner2_name: ['owner_2', 'owner_2_fullname', 'second_owner'],
    owner_phone: ['phone', 'mobile', 'cell', 'contact_phone', 'owner_phone', 'phonenumber', 'phone_number'],
    owner_email: ['email', 'mail', 'contact_email', 'owner_email', 'emailaddress', 'email_address'],
    phone_1: ['phone1', 'phone_1', 'phone 1', 'tel1', 'mobile1', 'cell1', 'phonenumber1', 'mobile_1', 'mobile-1', 'phone_number_1'],
    phone_2: ['phone2', 'phone_2', 'phone 2', 'tel2', 'mobile2', 'cell2', 'phonenumber2', 'mobile_2', 'mobile-2', 'phone_number_2'],
    phone_3: ['phone3', 'phone_3', 'phone 3', 'tel3', 'mobile3', 'cell3', 'phonenumber3', 'mobile_3', 'mobile-3', 'phone_number_3'],
    email_1: ['email1', 'email_1', 'email 1', 'emailaddress1', 'email_address_1'],
    email_2: ['email2', 'email_2', 'email 2', 'emailaddress2', 'email_address_2'],
    email_3: ['email3', 'email_3', 'email 3', 'emailaddress3', 'email_address_3'],

    // Mailing
    mailing_address: ['mailing_address', 'mail_address', 'mail_addr', 'owner_address'],
    mailing_street: ['mailing_street', 'mail_street'],
    mailing_city: ['mailing_city', 'mail_city'],
    mailing_state: ['mailing_state', 'mail_state'],
    mailing_zip: ['mailing_zip', 'mail_zip', 'mailing_postal'],
    absentee_owner: ['absentee', 'absentee_owner'],
    owner_occupied: ['owner_occupied', 'owner_occ'],
    corporate_owned: ['corporate', 'corp_owned', 'corporate_owned'],

    // Building
    bedrooms: ['bed', 'br', 'bedroom', 'beds_count'],
    bathrooms: ['bath', 'ba', 'bathroom', 'baths_total'],
    sqft: ['sqft', 'sq_ft', 'square', 'living_area', 'building_area', 'area', 'size', 'universal_building_sqft'],
    year_built: ['year_built', 'yearbuilt', 'built', 'yr_built', 'year_blt', 'year_built_effective'],
    stories: ['stories', 'levels', 'story_desc'],
    units_count: ['units', 'unit_count', 'number_of_units'],
    garage_type: ['garage', 'garage_type', 'parking_type'],
    garage_sqft: ['garage_sqft', 'garage_area'],
    basement_type: ['basement', 'basement_type', 'bsmt_desc'],
    pool: ['pool', 'pool_ind', 'has_pool'],
    condition: ['condition', 'bldg_condition', 'structure_condition'],
    construction_type: ['construction', 'const_type', 'frame_type'],
    roof_type: ['roof', 'roof_type', 'roof_material'],
    heating_type: ['heating', 'heat_type'],
    cooling_type: ['cooling', 'ac_type', 'air_conditioning'],

    // Lot
    lot_size: ['lot_sqft', 'lot_size', 'land_area_sqft', 'lot_area_sqft'],
    lot_acres: ['acres', 'acreage', 'lot_size_acres'],
    apn: ['apn', 'parcel', 'parcel_id', 'pin', 'tax_id'],
    zoning: ['zoning', 'zoning_code'],
    land_use: ['land_use', 'land_use_code'],
    subdivision: ['subdivision', 'subdiv'],
    legal_description: ['legal', 'legal_desc', 'legal_description'],

    // Financial
    list_price: ['price', 'list_price', 'asking', 'original_list_price'],
    estimated_value: ['value', 'market_value', 'est_value', 'avm', 'estimated_value'],
    estimated_equity: ['equity', 'est_equity', 'estimated_equity'],
    tax_amount: ['tax', 'tax_amt', 'tax_amount', 'total_tax_amount'],
    tax_year: ['tax_year', 'tax_yr', 'assessment_year'],
    assessed_value: ['assessed', 'total_assessed_value', 'assd_total_value'],
    assessed_land: ['assd_land', 'assessed_land_value'],
    assessed_improvement: ['assd_imp', 'assessed_improvement_value'],
    market_value: ['market_value', 'mkt_value', 'market_total_value'],
    market_land: ['market_land', 'mkt_land_value'],
    market_improvement: ['market_imp', 'mkt_impr_value'],
    last_sale_date: ['sale_date', 'last_sale_date', 'recording_date'],
    last_sale_price: ['sale_price', 'last_sale_amount', 'last_sale_price'],

    // Mortgage
    mortgage_amount: ['mortgage_amount', 'loan_amount', 'mtg_amt'],
    mortgage_lender: ['lender', 'mortgage_lender', 'mtg_lender'],
    mortgage_date: ['mortgage_date', 'loan_date', 'mtg_date'],
    mortgage_rate: ['interest_rate', 'mortgage_rate', 'int_rate'],
    mortgage_term: ['term', 'mortgage_term', 'loan_term'],
    mortgage_type: ['loan_type', 'mortgage_type', 'mtg_type'],

    // Demographics
    suggested_rent: ['rent', 'suggested_rent', 'market_rent'],
}

/**
 * Attempt to auto-detect the best target field for a given CSV column name.
 * Returns the target field key or '' (skip).
 */
function autoDetectMapping(csvCol: string, alreadyMapped: Set<string>): string {
    const normalized = csvCol.toLowerCase().trim().replace(/[\s\-:]+/g, '_')

    // Never auto-map carrier/type/metadata columns to phone or email fields
    const isCarrierCol = CARRIER_COLUMN_BLOCKLIST.some(
        (blocked) => normalized === blocked || normalized.includes(blocked)
    )
    const isMetadataCol = isSkipTraceMetadataColumn(normalized)
    const blockFromContactFields = isCarrierCol || isMetadataCol

    let bestMatch = ''
    let bestScore = 0

    for (const field of TARGET_FIELDS) {
        if (alreadyMapped.has(field.key)) continue
        if (blockFromContactFields && CONTACT_FIELD_KEYS.has(field.key as TargetFieldKey)) continue

        const keywords = FIELD_KEYWORDS[field.key]

        for (const kw of keywords) {
            let score = 0

            // Exact match is best
            if (normalized === kw) {
                score = 100
            }
            // Starts or ends with the keyword
            else if (normalized.startsWith(kw) || normalized.endsWith(kw)) {
                score = 80
            }
            // Contains the keyword
            else if (normalized.includes(kw)) {
                score = 60
            }
            // Keyword contains the column name (for short abbreviations like "ba", "br")
            else if (kw.length <= 3 && normalized === kw) {
                score = 90
            }

            if (score > bestScore) {
                bestScore = score
                bestMatch = field.key
            }
        }
    }

    // Only auto-map if we have a decent confidence
    return bestScore >= 60 ? bestMatch : ''
}

/**
 * Build initial column mappings by auto-detecting each CSV column.
 * Ensures no two CSV columns map to the same target field.
 * Skips mapping if the sample data (first row) is empty for that column.
 */
function buildInitialMappings(csvColumns: string[], firstRow?: RawRow): Record<string, string> {
    const mappings: Record<string, string> = {}
    const usedTargets = new Set<string>()

    // First pass: high-confidence matches
    const scores: { col: string; target: string; score: number }[] = []
    for (const col of csvColumns) {
        // If sample data is empty, don't auto-map
        if (firstRow) {
            const sampleVal = firstRow[col]
            if (!sampleVal || sampleVal.trim() === '') {
                continue
            }
        }

        const normalized = col.toLowerCase().trim().replace(/[\s\-:]+/g, '_')

        // Never auto-map carrier/type/metadata columns to phone or email fields
        const isCarrierCol = CARRIER_COLUMN_BLOCKLIST.some(
            (blocked) => normalized === blocked || normalized.includes(blocked)
        )
        const isMetadataCol = isSkipTraceMetadataColumn(normalized)
        const blockFromContactFields = isCarrierCol || isMetadataCol

        for (const field of TARGET_FIELDS) {
            // Skip phone/email fields entirely for carrier-type or metadata columns
            if (blockFromContactFields && CONTACT_FIELD_KEYS.has(field.key as TargetFieldKey)) continue

            const keywords = FIELD_KEYWORDS[field.key]
            let bestScore = 0
            for (const kw of keywords) {
                let score = 0
                if (normalized === kw) score = 100
                else if (normalized.startsWith(kw) || normalized.endsWith(kw)) score = 80
                else if (normalized.includes(kw)) score = 60
                if (score > bestScore) bestScore = score
            }

            if (bestScore >= 60) {
                scores.push({ col, target: field.key, score: bestScore })
            }
        }
    }

    // Sort by score descending so best matches get priority
    scores.sort((a, b) => b.score - a.score)

    for (const { col, target } of scores) {
        if (mappings[col] !== undefined) continue // already mapped this CSV col
        if (usedTargets.has(target)) continue // target already taken
        mappings[col] = target
        usedTargets.add(target)
    }

    // All unmapped columns default to skip
    for (const col of csvColumns) {
        if (mappings[col] === undefined) {
            mappings[col] = ''
        }
    }

    return mappings
}

type Step = 'upload' | 'mapping' | 'importing'

export function CsvUploadModal({ onImportComplete }: CsvUploadModalProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [listName, setListName] = useState('')
    const [rawRows, setRawRows] = useState<RawRow[]>([])
    const [csvColumns, setCsvColumns] = useState<string[]>([])
    const [columnMappings, setColumnMappings] = useState<Record<string, string>>({})
    const [importing, setImporting] = useState(false)
    const [progress, setProgress] = useState(0)
    const [result, setResult] = useState<ImportResult | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Skip trace state
    const [skipTracing, setSkipTracing] = useState(false)
    const [skipTraceStatus, setSkipTraceStatus] = useState('')
    const [skipTraceResult, setSkipTraceResult] = useState<{
        contactsFound?: number
        titanSkipCount?: number
        batchDataProcessed?: number
        message?: string
    } | null>(null)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        if (!selectedFile.name.endsWith('.csv')) {
            toast.error('Please select a CSV file')
            return
        }

        setFile(selectedFile)
        setResult(null)

        Papa.parse<RawRow>(selectedFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const rows = results.data
                setRawRows(rows)

                if (rows.length > 0) {
                    const cols = Object.keys(rows[0])
                    // Sort columns to prioritize Name, Email, Address
                    const priorityCols = ['name', 'owner', 'email', 'mail', 'address', 'property_address']
                    cols.sort((a, b) => {
                        const aLower = a.toLowerCase()
                        const bLower = b.toLowerCase()

                        const aPriority = priorityCols.findIndex(p => aLower.includes(p))
                        const bPriority = priorityCols.findIndex(p => bLower.includes(p))

                        // If both are priority columns, sort by priority index
                        if (aPriority !== -1 && bPriority !== -1) {
                            return aPriority - bPriority
                        }

                        // If only a is priority, it comes first
                        if (aPriority !== -1) return -1
                        // If only b is priority, it comes first
                        if (bPriority !== -1) return 1

                        // Otherwise sort alphabetically
                        return aLower.localeCompare(bLower)
                    })

                    setCsvColumns(cols)
                    setColumnMappings(buildInitialMappings(cols, rows[0]))
                }
            },
            error: (error) => {
                toast.error(`Failed to parse CSV: ${error.message}`)
            },
        })
    }

    const updateMapping = (csvCol: string, targetField: string) => {
        setColumnMappings(prev => {
            const next = { ...prev }

            // If another column was already mapped to this target, unmap it
            if (targetField) {
                for (const key of Object.keys(next)) {
                    if (next[key] === targetField && key !== csvCol) {
                        next[key] = ''
                    }
                }
            }

            next[csvCol] = targetField
            return next
        })
    }

    // Apply current mappings to preview rows
    const previewRows = useMemo(() => {
        return rawRows.slice(0, 5).map(row => {
            const mapped: Record<string, string> = {}
            for (const [csvCol, targetField] of Object.entries(columnMappings)) {
                if (targetField && row[csvCol]) {
                    mapped[targetField] = row[csvCol] || ''
                }
            }
            return mapped
        })
    }, [rawRows, columnMappings])

    const addressMapped = Object.values(columnMappings).includes('address')

    const handleImport = async () => {
        if (!file) return

        setStep('importing')
        setImporting(true)
        setProgress(0)
        setResult(null)

        let imported = 0
        let skipped = 0
        let errors = 0

        // Apply mappings to all rows
        const mappedRows = rawRows.map(row => {
            const mapped: Record<string, string | undefined> = {}
            for (const [csvCol, targetField] of Object.entries(columnMappings)) {
                if (targetField && row[csvCol]) {
                    mapped[targetField] = row[csvCol]
                }
            }
            return mapped
        })

        // Filter rows without addresses
        const validRows = mappedRows.filter(row => {
            if (!row.address?.trim()) {
                skipped++
                return false
            }
            return true
        })

        // Send in batches
        const batchSize = 100
        for (let i = 0; i < validRows.length; i += batchSize) {
            const batch = validRows.slice(i, i + batchSize)

            try {
                const response = await fetch('/api/properties/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        properties: batch,
                        listName: i === 0 ? listName.trim() : undefined,
                    }),
                })

                const res = await response.json()

                if (!response.ok) {
                    console.error('Import API error:', res)
                    errors += batch.length
                } else {
                    imported += res.data?.imported || 0
                    skipped += res.data?.skipped || 0
                    errors += res.data?.errors || 0
                    if (res.data?.errorDetails) {
                        // Capture the first error detail we see
                        setResult(prev => ({
                            imported: prev?.imported || imported,
                            skipped: prev?.skipped || skipped,
                            errors: prev?.errors || errors,
                            errorDetails: res.data.errorDetails
                        }))
                    }
                }
            } catch (err: any) {
                console.error('Import fetch error:', err)
                errors += batch.length
                // Only set error detail if we haven't set one yet
                setResult(prev => ({
                    imported: prev?.imported || imported,
                    skipped: prev?.skipped || skipped,
                    errors: prev?.errors || errors,
                    errorDetails: prev?.errorDetails || err.message || 'Network error'
                }))
            }

            setProgress(Math.round(((i + batch.length) / rawRows.length) * 100))
        }

        if (!result?.errorDetails) {
            setResult({ imported, skipped, errors, errorDetails: result?.errorDetails })
        } else {
            // If we already set an error detail in the loop, update the counts
            setResult(prev => ({
                imported,
                skipped,
                errors,
                errorDetails: prev?.errorDetails
            }))
        }
        setImporting(false)

        if (imported > 0) {
            toast.success(`Imported ${imported} properties!`)
            onImportComplete()
        }
    }

    const handleImportAndSkipTrace = async () => {
        if (!file) return

        setStep('importing')
        setImporting(true)
        setProgress(0)
        setResult(null)
        setSkipTracing(false)
        setSkipTraceStatus('')
        setSkipTraceResult(null)

        let imported = 0
        let skipped = 0
        let errors = 0
        const allPropertyIds: string[] = []

        // Phase 1: Import (same logic as handleImport)
        const mappedRows = rawRows.map(row => {
            const mapped: Record<string, string | undefined> = {}
            for (const [csvCol, targetField] of Object.entries(columnMappings)) {
                if (targetField && row[csvCol]) {
                    mapped[targetField] = row[csvCol]
                }
            }
            return mapped
        })

        const validRows = mappedRows.filter(row => {
            if (!row.address?.trim()) {
                skipped++
                return false
            }
            return true
        })

        const batchSize = 100
        for (let i = 0; i < validRows.length; i += batchSize) {
            const batch = validRows.slice(i, i + batchSize)

            try {
                const response = await fetch('/api/properties/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        properties: batch,
                        listName: i === 0 ? listName.trim() : undefined,
                    }),
                })

                const res = await response.json()

                if (!response.ok) {
                    console.error('Import API error:', res)
                    errors += batch.length
                } else {
                    imported += res.data?.imported || 0
                    skipped += res.data?.skipped || 0
                    errors += res.data?.errors || 0
                    if (res.data?.propertyIds) {
                        allPropertyIds.push(...res.data.propertyIds)
                    }
                }
            } catch (err: any) {
                console.error('Import fetch error:', err)
                errors += batch.length
            }

            setProgress(Math.round(((i + batch.length) / rawRows.length) * 100))
        }

        setResult({ imported, skipped, errors })
        setImporting(false)

        if (imported > 0) {
            toast.success(`Imported ${imported} properties!`)
            onImportComplete()
        }

        // Phase 2: Batch Skip Trace
        if (allPropertyIds.length === 0) {
            setSkipTraceStatus('No properties to skip trace')
            return
        }

        setSkipTracing(true)
        setSkipTraceStatus('Submitting skip trace request...')

        try {
            // Split into chunks of 500 (API limit)
            const chunkSize = 500
            let totalTitanSkip = 0
            let totalBatchData = 0
            let totalContacts = 0
            let activeTraceId: string | null = null

            for (let i = 0; i < allPropertyIds.length; i += chunkSize) {
                const chunk = allPropertyIds.slice(i, i + chunkSize)
                setSkipTraceStatus(`Submitting skip trace (${Math.min(i + chunkSize, allPropertyIds.length)}/${allPropertyIds.length} leads)...`)

                const { data, error } = await api.batchSkipTrace(chunk, true)

                if (error) {
                    console.error('Batch skip trace error:', error)
                    setSkipTraceStatus(`Skip trace error: ${error}`)
                    continue
                }

                if (data) {
                    totalTitanSkip += data.titanSkipCount || 0
                    totalBatchData += data.batchDataProcessed || 0

                    // If TitanSkip was used, we need to poll for results
                    if (data.traceId) {
                        activeTraceId = data.traceId
                    }
                }
            }

            // Phase 3: Poll for TitanSkip results if needed
            if (activeTraceId) {
                setSkipTraceStatus(`Processing ${totalTitanSkip} leads via TitanSkip...`)

                const maxPollTime = 5 * 60 * 1000 // 5 minutes
                const pollInterval = 5000 // 5 seconds
                const startTime = Date.now()

                while (Date.now() - startTime < maxPollTime) {
                    await new Promise(resolve => setTimeout(resolve, pollInterval))

                    const { data: pollData, error: pollError } = await api.pollSkipTraceJob(activeTraceId)

                    if (pollError) {
                        console.error('Poll error:', pollError)
                        setSkipTraceStatus('Error checking skip trace status')
                        break
                    }

                    if (pollData) {
                        if (pollData.status === 'completed') {
                            totalContacts += pollData.contactsFound || 0
                            setSkipTraceStatus('Skip trace complete!')
                            break
                        } else if (pollData.status === 'error') {
                            setSkipTraceStatus(`Skip trace error: ${pollData.message}`)
                            break
                        } else {
                            setSkipTraceStatus(`Processing skip trace... (${pollData.status})`)
                        }
                    }
                }

                if (Date.now() - startTime >= maxPollTime) {
                    setSkipTraceStatus('Skip trace is still processing. Results will appear shortly.')
                }
            } else {
                setSkipTraceStatus('Skip trace complete!')
            }

            setSkipTraceResult({
                contactsFound: totalContacts,
                titanSkipCount: totalTitanSkip,
                batchDataProcessed: totalBatchData,
                message: `Found contacts via TitanSkip (${totalTitanSkip} leads) and BatchData (${totalBatchData} leads)`,
            })
        } catch (err: any) {
            console.error('Skip trace error:', err)
            setSkipTraceStatus(`Skip trace failed: ${err.message || 'Unknown error'}`)
        }

        setSkipTracing(false)
        onImportComplete() // Refresh leads again to show contacts
    }

    const resetModal = () => {
        setStep('upload')
        setFile(null)
        setListName('')
        setRawRows([])
        setCsvColumns([])
        setColumnMappings({})
        setProgress(0)
        setResult(null)
        setSkipTracing(false)
        setSkipTraceStatus('')
        setSkipTraceResult(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) resetModal()
        }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload CSV
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {step === 'upload' && 'Import Properties from CSV'}
                        {step === 'mapping' && 'Map Your Columns'}
                        {step === 'importing' && 'Importing...'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* ─── STEP 1: UPLOAD ─── */}
                    {step === 'upload' && (
                        <>
                            {/* File Input */}
                            <div className="border-2 border-dashed rounded-lg p-6 text-center">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    id="csv-upload"
                                />
                                <label htmlFor="csv-upload" className="cursor-pointer">
                                    <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                                    {file ? (
                                        <p className="text-sm font-medium">{file.name} ({rawRows.length} rows)</p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Click to select a CSV file
                                        </p>
                                    )}
                                </label>
                            </div>

                            {/* List Name */}
                            {file && (
                                <div className="space-y-2">
                                    <Label htmlFor="list-name">List Name *</Label>
                                    <Input
                                        id="list-name"
                                        placeholder="e.g., Miami Homeowners Jan 2026"
                                        value={listName}
                                        onChange={(e) => setListName(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Give this import a name to organize and filter leads later.
                                    </p>
                                </div>
                            )}

                            {/* Next */}
                            {file && (
                                <Button
                                    onClick={() => setStep('mapping')}
                                    disabled={!listName.trim()}
                                    className="w-full"
                                >
                                    Next: Map Columns
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            )}
                        </>
                    )}

                    {/* ─── STEP 2: COLUMN MAPPING ─── */}
                    {step === 'mapping' && (
                        <>
                            <p className="text-sm text-muted-foreground">
                                We auto-detected your columns below. Use the dropdowns to fix any that are wrong, or set to &quot;Skip&quot; to ignore a column.
                            </p>


                            {!addressMapped && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                                    ⚠️ <strong>Address</strong> is required. Please map one of your columns to Address.
                                </div>
                            )}

                            {/* Actions - MOVED TO TOP */}
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setStep('upload')}>
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Button>
                                <Button
                                    onClick={handleImport}
                                    disabled={!addressMapped}
                                    variant="outline"
                                    className="flex-1"
                                >
                                    Import {rawRows.length} Properties
                                </Button>
                                <Button
                                    onClick={handleImportAndSkipTrace}
                                    disabled={!addressMapped}
                                    className="flex-1"
                                >
                                    <Search className="mr-2 h-4 w-4" />
                                    Import & Skip Trace
                                </Button>
                            </div>

                            {/* Preview with mappings applied - MOVED TO TOP */}
                            {previewRows.length > 0 && addressMapped && (
                                <div>
                                    <p className="text-sm font-medium mb-2">Preview (first 5 rows with your mapping)</p>
                                    <div className="border rounded-lg overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="bg-zinc-50 dark:bg-zinc-800">
                                                <tr>
                                                    <th className="px-2 py-1.5 text-left">Address</th>
                                                    <th className="px-2 py-1.5 text-left">City</th>
                                                    <th className="px-2 py-1.5 text-left">State</th>
                                                    <th className="px-2 py-1.5 text-left">Zip</th>
                                                    <th className="px-2 py-1.5 text-left">Owner</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewRows.map((row, i) => (
                                                    <tr key={i} className="border-t">
                                                        <td className="px-2 py-1.5">{row.address || '-'}</td>
                                                        <td className="px-2 py-1.5">{row.city || '-'}</td>
                                                        <td className="px-2 py-1.5">{row.state || '-'}</td>
                                                        <td className="px-2 py-1.5">{row.zip || '-'}</td>
                                                        <td className="px-2 py-1.5">{row.owner_name || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Mapped Columns Section */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-green-500" />
                                    Mapped Columns
                                </h3>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium w-1/3">Your CSV Column</th>
                                                <th className="px-3 py-2 text-left font-medium w-1/3">Sample Data</th>
                                                <th className="px-3 py-2 text-left font-medium w-1/3">Maps To</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {csvColumns.filter(col => columnMappings[col]).map((col) => {
                                                const sampleValue = rawRows[0]?.[col] || ''
                                                const currentMapping = columnMappings[col] || ''

                                                return (
                                                    <tr key={col} className="border-t">
                                                        <td className="px-3 py-2 font-mono text-xs font-medium">
                                                            {col}
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate" title={String(sampleValue)}>
                                                            {sampleValue || <span className="italic">empty</span>}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="relative">
                                                                <select
                                                                    value={currentMapping}
                                                                    onChange={(e) => updateMapping(col, e.target.value)}
                                                                    className="w-full appearance-none rounded-md border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-medium px-2 py-1.5 text-xs pr-7 bg-white dark:bg-zinc-900"
                                                                >
                                                                    <option value="">— Skip —</option>
                                                                    {TARGET_FIELDS.map((field, index) => {
                                                                        const taken = Object.entries(columnMappings).some(
                                                                            ([k, v]) => v === field.key && k !== col
                                                                        )
                                                                        const prevField = TARGET_FIELDS[index - 1]
                                                                        const showGroup = !prevField || prevField.group !== field.group

                                                                        return (
                                                                            <>
                                                                                {showGroup && (
                                                                                    <option disabled className="bg-zinc-100 dark:bg-zinc-800 font-bold text-xs">
                                                                                        ── {field.group} ──
                                                                                    </option>
                                                                                )}
                                                                                <option
                                                                                    key={field.key}
                                                                                    value={field.key}
                                                                                    disabled={taken}
                                                                                >
                                                                                    {field.label}{'required' in field && field.required ? ' *' : ''}{taken ? ' (already mapped)' : ''}
                                                                                </option>
                                                                            </>
                                                                        )
                                                                    })}
                                                                </select>
                                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                            {csvColumns.filter(col => columnMappings[col]).length === 0 && (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground italic">
                                                        No columns mapped yet. Check the unmapped columns below.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Unmapped Columns Section */}
                            {csvColumns.some(col => !columnMappings[col]) && (
                                <div className="pt-4 border-t">
                                    <details className="group" open={csvColumns.filter(col => columnMappings[col]).length === 0}>
                                        <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground select-none mb-3">
                                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                                            Show {csvColumns.filter(col => !columnMappings[col]).length} Unmapped Columns
                                        </summary>
                                        <div className="border rounded-lg overflow-hidden border-dashed border-zinc-300 dark:border-zinc-700">
                                            <table className="w-full text-sm">
                                                <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium w-1/3 text-muted-foreground">CSV Column</th>
                                                        <th className="px-3 py-2 text-left font-medium w-1/3 text-muted-foreground">Sample Data</th>
                                                        <th className="px-3 py-2 text-left font-medium w-1/3 text-muted-foreground">Map To...</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {csvColumns.filter(col => !columnMappings[col]).map((col) => {
                                                        const sampleValue = rawRows[0]?.[col] || ''

                                                        return (
                                                            <tr key={col} className="border-t border-zinc-100 dark:border-zinc-800">
                                                                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                                                    {col}
                                                                </td>
                                                                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate" title={String(sampleValue)}>
                                                                    {sampleValue || <span className="italic">empty</span>}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <div className="relative">
                                                                        <select
                                                                            value=""
                                                                            onChange={(e) => updateMapping(col, e.target.value)}
                                                                            className="w-full appearance-none rounded-md border border-zinc-200 dark:border-zinc-700 text-muted-foreground px-2 py-1.5 text-xs pr-7 bg-white dark:bg-zinc-900 focus:border-blue-500 focus:text-foreground"
                                                                        >
                                                                            <option value="">— Skip —</option>
                                                                            {TARGET_FIELDS.map((field, index) => {
                                                                                const taken = Object.entries(columnMappings).some(
                                                                                    ([k, v]) => v === field.key && k !== col
                                                                                )
                                                                                const prevField = TARGET_FIELDS[index - 1]
                                                                                const showGroup = !prevField || prevField.group !== field.group

                                                                                return (
                                                                                    <>
                                                                                        {showGroup && (
                                                                                            <option disabled className="bg-zinc-100 dark:bg-zinc-800 font-bold text-xs">
                                                                                                ── {field.group} ──
                                                                                            </option>
                                                                                        )}
                                                                                        <option
                                                                                            key={field.key}
                                                                                            value={field.key}
                                                                                            disabled={taken}
                                                                                        >
                                                                                            {field.label}{'required' in field && field.required ? ' *' : ''}{taken ? ' (already mapped)' : ''}
                                                                                        </option>
                                                                                    </>
                                                                                )
                                                                            })}
                                                                        </select>
                                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </details>
                                </div>
                            )}
                        </>
                    )}

                    {/* ─── STEP 3: IMPORTING / RESULTS ─── */}
                    {step === 'importing' && (
                        <>
                            {/* Import Progress Bar */}
                            {importing && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span>Importing...</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 transition-all duration-300"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Import Results */}
                            {result && (
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-green-600">
                                        <CheckCircle className="h-4 w-4" />
                                        <span>{result.imported} imported successfully</span>
                                    </div>
                                    {result.skipped > 0 && (
                                        <div className="flex items-center gap-2 text-amber-600">
                                            <XCircle className="h-4 w-4" />
                                            <span>{result.skipped} skipped (missing address)</span>
                                        </div>
                                    )}
                                    {result.errors > 0 && (
                                        <div className="flex items-center gap-2 text-red-600">
                                            <XCircle className="h-4 w-4" />
                                            <span>{result.errors} errors</span>
                                        </div>
                                    )}
                                    {result.errorDetails && (
                                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-xs text-red-700 dark:text-red-400 font-mono break-all">
                                            Error: {result.errorDetails}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Skip Trace Progress */}
                            {(skipTracing || skipTraceStatus) && (
                                <div className="border-t pt-3 mt-3 space-y-2">
                                    <div className="flex items-center gap-2 text-sm">
                                        {skipTracing ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                        ) : skipTraceStatus.includes('complete') ? (
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                        ) : skipTraceStatus.includes('error') || skipTraceStatus.includes('failed') ? (
                                            <XCircle className="h-4 w-4 text-red-600" />
                                        ) : (
                                            <Search className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className={
                                            skipTraceStatus.includes('error') || skipTraceStatus.includes('failed')
                                                ? 'text-red-600'
                                                : skipTraceStatus.includes('complete')
                                                    ? 'text-green-600'
                                                    : ''
                                        }>
                                            {skipTraceStatus}
                                        </span>
                                    </div>

                                    {skipTraceResult && (
                                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs space-y-1">
                                            {skipTraceResult.titanSkipCount !== undefined && skipTraceResult.titanSkipCount > 0 && (
                                                <p>TitanSkip: {skipTraceResult.titanSkipCount} leads processed</p>
                                            )}
                                            {skipTraceResult.batchDataProcessed !== undefined && skipTraceResult.batchDataProcessed > 0 && (
                                                <p>BatchData: {skipTraceResult.batchDataProcessed} leads processed</p>
                                            )}
                                            {skipTraceResult.contactsFound !== undefined && skipTraceResult.contactsFound > 0 && (
                                                <p className="font-medium">Contacts found: {skipTraceResult.contactsFound}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Done Button — only show when both import and skip trace are done */}
                            {result && !importing && !skipTracing && (
                                <Button onClick={() => setOpen(false)} className="w-full mt-2">
                                    Done
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
