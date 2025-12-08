-- Create table for storing telegram messages from users
CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  username text,
  first_name text,
  message_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- Allow public read for the management page
CREATE POLICY "Allow public read" ON public.telegram_messages FOR SELECT USING (true);

-- Allow service insert from edge function
CREATE POLICY "Allow service insert" ON public.telegram_messages FOR INSERT WITH CHECK (true);

-- Allow delete for management
CREATE POLICY "Allow public delete" ON public.telegram_messages FOR DELETE USING (true);