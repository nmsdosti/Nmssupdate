-- Add firecrawl_api_key column to monitor_settings
ALTER TABLE public.monitor_settings 
ADD COLUMN firecrawl_api_key TEXT;