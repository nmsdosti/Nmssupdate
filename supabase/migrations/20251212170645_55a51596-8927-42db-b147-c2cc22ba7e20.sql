-- Rename interval_minutes to interval_seconds and convert existing values
ALTER TABLE public.monitor_settings 
  RENAME COLUMN interval_minutes TO interval_seconds;

-- Update existing values from minutes to seconds (multiply by 60)
UPDATE public.monitor_settings 
SET interval_seconds = GREATEST(10, LEAST(60, interval_seconds * 60));

-- Add a default constraint for new rows
ALTER TABLE public.monitor_settings 
  ALTER COLUMN interval_seconds SET DEFAULT 30;