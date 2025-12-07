-- Add jump_threshold column to monitor_settings
ALTER TABLE public.monitor_settings 
ADD COLUMN jump_threshold integer NOT NULL DEFAULT 100;