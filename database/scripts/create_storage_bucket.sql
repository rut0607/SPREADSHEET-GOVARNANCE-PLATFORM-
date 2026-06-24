-- ============================================
-- STORAGE BUCKET SETUP
-- Run this in Supabase SQL editor after
-- creating your project
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('spreadsheet-files', 'spreadsheet-files', false);

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'spreadsheet-files'
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to read files
CREATE POLICY "Authenticated users can read files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'spreadsheet-files'
    AND auth.role() = 'authenticated'
);

-- Allow admins to delete files
CREATE POLICY "Admins can delete files"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'spreadsheet-files'
    AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND is_admin = true
    )
);