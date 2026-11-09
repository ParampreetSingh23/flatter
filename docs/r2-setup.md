# Cloudflare R2 setup for flat photos

One private bucket per environment (e.g. `flatter-photos-dev`, `flatter-photos-prod`). No public access, no `r2.dev`, no custom domain.

1. **Create the bucket**: Cloudflare dashboard, R2, Create bucket. Keep "Public access" disabled.
2. **API token**: R2, Manage API tokens, create a token with **Object Read & Write**, scoped to this bucket only. Copy the Access Key ID and Secret.
3. **CORS** (bucket, Settings, CORS policy). Replace the origin with your real frontend origin(s):

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["etag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **Lifecycle rule** (bucket, Settings, Object lifecycle rules): add one rule, prefix `staging/`, delete objects after **1 day**. Never apply a rule to the `flats/` prefix: saved drafts must not expire.
5. **Backend env** (`backend/.env`, never committed; see `backend/.env.example`):

   ```
   R2_ACCOUNT_ID=<Cloudflare account id>
   R2_BUCKET=<bucket name>
   R2_ACCESS_KEY_ID=<token access key id>
   R2_SECRET_ACCESS_KEY=<token secret>
   ```
6. Restart the backend. Without these variables it logs `R2 not configured` and photo upload and publishing return `503 STORAGE_UNAVAILABLE`; everything else, including drafts, pause and close, still works.

Check: sign in as a `HAVE_ROOM` user, open `/dashboard/listing`, upload a photo, and confirm an object appears under `flats/` (and the `staging/` copy is gone).
