
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vevgcwtruyvdjlcvnuhu.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldmdjd3RydXl2ZGpsY3ZudWh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4MDI3MCwiZXhwIjoyMDg1ODU2MjcwfQ.nVQOe_48V7ybCxZgwObT9VxEBdW0_mXlxjqYZ8jKZDQ';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'public' }
});

async function runSQL(sql, label) {
    console.log(`\n🔄 Running: ${label}...`);
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
        console.error(`❌ ${label} failed:`, error.message);
        return false;
    }
    if (data && data.success === false) {
        console.error(`❌ ${label} SQL error:`, data.error);
        return false;
    }
    console.log(`✅ ${label} completed`);
    return true;
}

const M_RECORDING = `
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS recording_sid TEXT,
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS transcript TEXT,
ADD COLUMN IF NOT EXISTS transcription_status TEXT DEFAULT 'none';
`;

async function main() {
    console.log('🚀 Starting recording migration...\n');
    const success = await runSQL(M_RECORDING, 'Add Call Recording Fields');
    if (!success) {
        process.exit(1);
    }
    console.log('\n🎉 Migration completed successfully!');
}

main().catch(console.error);
