UPDATE storage.buckets
SET public = false
WHERE id = 'comprovantes';

DROP POLICY IF EXISTS "Public can upload comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Public can read comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete comprovantes" ON storage.objects;

CREATE POLICY "Admins can read comprovantes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can upload comprovantes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update comprovantes"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete comprovantes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);