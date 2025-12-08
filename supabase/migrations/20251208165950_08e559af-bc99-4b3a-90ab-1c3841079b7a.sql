-- Create table for multiple Firecrawl API keys
CREATE TABLE public.firecrawl_api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key text NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  last_error text,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.firecrawl_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow public read" ON public.firecrawl_api_keys FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.firecrawl_api_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.firecrawl_api_keys FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.firecrawl_api_keys FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_firecrawl_api_keys_updated_at
BEFORE UPDATE ON public.firecrawl_api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing API key if present
INSERT INTO public.firecrawl_api_keys (api_key, label)
SELECT firecrawl_api_key, 'Primary Key'
FROM public.monitor_settings
WHERE id = 'default' AND firecrawl_api_key IS NOT NULL AND firecrawl_api_key != '';