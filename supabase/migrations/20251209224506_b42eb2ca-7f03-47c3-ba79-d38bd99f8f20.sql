-- Add column to track last API key failure notification time
ALTER TABLE public.monitor_settings 
ADD COLUMN last_api_key_alert_at timestamp with time zone;