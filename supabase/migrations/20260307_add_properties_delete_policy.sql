-- Add DELETE RLS policy for properties table
-- Previously missing, causing bulk delete to silently fail
CREATE POLICY "Users can delete own properties"
ON public.properties
FOR DELETE
USING (created_by = auth.uid());
