-- Create notes table for user notes on properties
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes" ON public.notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create notes" ON public.notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes" ON public.notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes" ON public.notes
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_notes_property_id ON public.notes(property_id);
CREATE INDEX idx_notes_user_id ON public.notes(user_id);

-- Create api_usage table for rate limiting
CREATE TABLE IF NOT EXISTS public.api_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- Only service role should access this table (used by admin client in rate-limit.ts)
CREATE POLICY "Service role full access" ON public.api_usage
  FOR ALL USING (true);

CREATE INDEX idx_api_usage_user_endpoint ON public.api_usage(user_id, endpoint, created_at DESC);

-- Auto-cleanup: delete api_usage records older than 24 hours to keep the table small
-- This can be run periodically via a cron job or pg_cron
CREATE OR REPLACE FUNCTION public.cleanup_old_api_usage()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.api_usage WHERE created_at < now() - interval '24 hours';
$$;
