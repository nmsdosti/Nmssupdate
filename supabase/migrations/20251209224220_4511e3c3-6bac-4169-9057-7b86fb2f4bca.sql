-- Add is_paused column to monitor_settings
ALTER TABLE public.monitor_settings 
ADD COLUMN is_paused boolean NOT NULL DEFAULT false;