-- Add raw_realestate_data column to properties table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'properties'
        AND column_name = 'raw_realestate_data'
    ) THEN
        ALTER TABLE properties ADD COLUMN raw_realestate_data JSONB;
    END IF;
END $$;
