-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create settings table for storing configuration
CREATE TABLE public.monitor_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  threshold INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO public.monitor_settings (id, threshold) VALUES ('default', 1000);

-- Enable RLS but allow public read/write for this simple app
ALTER TABLE public.monitor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.monitor_settings FOR SELECT USING (true);
CREATE POLICY "Allow public update" ON public.monitor_settings FOR UPDATE USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_monitor_settings_updated_at
BEFORE UPDATE ON public.monitor_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();