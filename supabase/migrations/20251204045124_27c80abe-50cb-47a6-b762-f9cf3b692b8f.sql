-- Create table for monitoring history
CREATE TABLE public.monitor_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_count INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  exceeds_threshold BOOLEAN NOT NULL DEFAULT false,
  telegram_sent BOOLEAN NOT NULL DEFAULT false,
  telegram_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitor_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read" ON public.monitor_history
FOR SELECT USING (true);

-- Allow insert from service role (edge function)
CREATE POLICY "Allow service insert" ON public.monitor_history
FOR INSERT WITH CHECK (true);