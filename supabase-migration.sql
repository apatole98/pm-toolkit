-- ════════════════════════════════════════════════════════════════════
-- PM Toolkit — Supabase Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════════

-- 1. Add usage-tracking columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS generations_used       INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generations_reset_at   TIMESTAMPTZ DEFAULT NULL;

-- 2. Create documents table (generation history)
CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key  TEXT        NOT NULL,
  template_name TEXT        NOT NULL,
  form_data     JSONB       DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS on documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Users can insert their own documents
CREATE POLICY "Users can insert own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own documents
CREATE POLICY "Users can read own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Allow users to update their own profile (needed for usage counter)
-- (Only add if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;
