-- Create storage bucket for public assets
INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true);

-- Create policy for public access to assets bucket
CREATE POLICY "Public access to assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'assets');