-- Update the cron job to NOT pass a hardcoded threshold
-- This allows the edge function to read the threshold from the database

SELECT cron.unschedule('monitor-shein-every-5-min');

SELECT cron.schedule(
  'monitor-shein-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tavwgjeshzofasvhxidz.supabase.co/functions/v1/monitor-shein',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhdndnamVzaHpvZmFzdmh4aWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Njg3NTEsImV4cCI6MjA4MDM0NDc1MX0.tadVo2BgxxlzMcFT4N7QkZ-WVw6l8M9Lozcys85sedk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);