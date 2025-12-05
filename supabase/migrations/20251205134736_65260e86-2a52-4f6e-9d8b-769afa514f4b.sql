-- Create table to store Telegram subscribers
CREATE TABLE public.telegram_subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;

-- Allow public read for the edge function
CREATE POLICY "Allow public read" ON public.telegram_subscribers
FOR SELECT USING (true);

-- Allow service insert/update
CREATE POLICY "Allow service insert" ON public.telegram_subscribers
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service update" ON public.telegram_subscribers
FOR UPDATE USING (true);