-- Add interval_minutes column to monitor_settings
ALTER TABLE public.monitor_settings 
ADD COLUMN interval_minutes integer NOT NULL DEFAULT 5;

-- Update the default setting
UPDATE public.monitor_settings 
SET interval_minutes = 1 
WHERE id = 'default';