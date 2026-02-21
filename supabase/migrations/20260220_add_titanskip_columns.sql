-- Add separate columns for TitanSkip API fields
-- These columns store owner first/last name and mailing address info
-- so TitanSkip can consume them directly instead of parsing from owner_name
-- or extracting from raw_realestate_data JSONB.

DO $$
BEGIN
    -- Owner first name (split from owner_name)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'properties' AND column_name = 'owner_first_name'
    ) THEN
        ALTER TABLE properties ADD COLUMN owner_first_name TEXT;
    END IF;

    -- Owner last name (split from owner_name)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'properties' AND column_name = 'owner_last_name'
    ) THEN
        ALTER TABLE properties ADD COLUMN owner_last_name TEXT;
    END IF;

    -- Mailing address (street)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'properties' AND column_name = 'mailing_address'
    ) THEN
        ALTER TABLE properties ADD COLUMN mailing_address TEXT;
    END IF;

    -- Mailing city
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'properties' AND column_name = 'mailing_city'
    ) THEN
        ALTER TABLE properties ADD COLUMN mailing_city TEXT;
    END IF;

    -- Mailing state
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'properties' AND column_name = 'mailing_state'
    ) THEN
        ALTER TABLE properties ADD COLUMN mailing_state TEXT;
    END IF;

    -- Mailing zip
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'properties' AND column_name = 'mailing_zip'
    ) THEN
        ALTER TABLE properties ADD COLUMN mailing_zip TEXT;
    END IF;
END $$;
