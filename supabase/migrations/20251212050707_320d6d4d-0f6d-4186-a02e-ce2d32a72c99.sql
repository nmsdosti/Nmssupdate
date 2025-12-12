-- Create subscription pricing table
CREATE TABLE public.subscription_pricing (
  id TEXT PRIMARY KEY DEFAULT 'default',
  price_3_days INTEGER NOT NULL DEFAULT 50,
  price_1_week INTEGER NOT NULL DEFAULT 100,
  price_1_month INTEGER NOT NULL DEFAULT 400,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_pricing ENABLE ROW LEVEL SECURITY;

-- Allow public read (for telegram bot)
CREATE POLICY "Allow public read" ON public.subscription_pricing FOR SELECT USING (true);

-- Allow public update (for admin panel)
CREATE POLICY "Allow public update" ON public.subscription_pricing FOR UPDATE USING (true);

-- Insert default pricing
INSERT INTO public.subscription_pricing (id, price_3_days, price_1_week, price_1_month)
VALUES ('default', 50, 100, 400);