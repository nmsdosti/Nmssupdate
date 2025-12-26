-- Create table to store known product links
CREATE TABLE public.monitored_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_url TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES public.category_monitors(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.monitored_products ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read" ON public.monitored_products FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON public.monitored_products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.monitored_products FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.monitored_products FOR DELETE USING (true);

-- Create index for faster lookups
CREATE INDEX idx_monitored_products_url ON public.monitored_products(product_url);
CREATE INDEX idx_monitored_products_category ON public.monitored_products(category_id);