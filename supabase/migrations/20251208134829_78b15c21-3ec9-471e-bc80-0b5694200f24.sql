-- Allow deleting subscribers from management page
CREATE POLICY "Allow public delete" ON public.telegram_subscribers FOR DELETE USING (true);