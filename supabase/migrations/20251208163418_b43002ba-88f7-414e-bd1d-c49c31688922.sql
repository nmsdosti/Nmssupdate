-- Create a table for category-wise monitoring
CREATE TABLE public.category_monitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_item_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.category_monitors ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read" ON public.category_monitors FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.category_monitors FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.category_monitors FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.category_monitors FOR DELETE USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_category_monitors_updated_at
BEFORE UPDATE ON public.category_monitors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();