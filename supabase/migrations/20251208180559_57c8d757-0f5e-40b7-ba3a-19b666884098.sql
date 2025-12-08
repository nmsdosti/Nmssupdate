-- Add column to mark categories that should be subtracted from total
ALTER TABLE public.category_monitors
ADD COLUMN subtract_from_total boolean NOT NULL DEFAULT false;