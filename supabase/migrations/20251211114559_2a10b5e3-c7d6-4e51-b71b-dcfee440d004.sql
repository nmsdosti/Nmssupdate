-- Create subscription status enum
CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'expired');

-- Create telegram subscriptions table
CREATE TABLE public.telegram_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  utr_id TEXT,
  plan_type TEXT NOT NULL, -- '3_days', '1_week', '1_month'
  amount INTEGER NOT NULL, -- 50, 100, 400
  status subscription_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow public read" ON public.telegram_subscriptions FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON public.telegram_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.telegram_subscriptions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.telegram_subscriptions FOR DELETE USING (true);

-- Add subscription_expires_at to telegram_subscribers
ALTER TABLE public.telegram_subscribers 
ADD COLUMN subscription_expires_at TIMESTAMP WITH TIME ZONE;