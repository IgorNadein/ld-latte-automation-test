# LD LATTE — план проверки

## 1. Telegram / n8n

Prerequisites: n8n webhook reachable from Telegram, bot credentials, seeded Supabase table `services`.

| Check | Action | Expected |
|---|---|---|
| Two buttons | Activate 1,2; send /start | Exactly 2 buttons |
| Five buttons | Activate 1–5; send /start | Exactly 5 buttons |
| Nine buttons | Activate 1–9; send /start | Exactly 9 buttons |
| Renaming | Rename service 1; resend /start | Button text changes immediately |
| Adding | Insert 10th service; resend /start | Another button appears without workflow changes |
| Disabling | Disable service 2; resend /start | Button disappears |
| Empty catalog | Disable all; resend /start | Clear no-services message; no empty keyboard |
| Callback | Click each active button | Bot replies with current name for ID |
| Stale callback | Disable service after rendering, then click | Bot explains service no longer available |
| Selection feedback | Click active service | Explicitly confirms service name and shows **Return to services** button |
| Return to menu | Click Return to services after selection | Fresh menu from database, not an old cached keyboard |
| Back after all disabled | Disable all services, click Return | Clear no-services message without buttons |
| Unknown callback | Send unknown id via mocked update | No crash; explanatory text |
| Other message | Message without /start | Help text or ignored by design |

**Not claimed as executed** until the workflow has been imported into an n8n instance and linked to a Telegram bot and Supabase. No real employee data is needed.

## 2. Instagram plan

- Confirm whether accounts are Professional, Business or Creator.
- Confirm which auth route is selected and why.
- Verify requested scopes in current Meta app API version.
- Confirm first API call, account ID, Insights permission and response.
- Check empty arrays vs actual zero metrics; be aware of lag.
- Confirm token expiration/refresh schedule and negative permission tests.
- Confirm multi-account isolation, duplicate protection, UTC timestamps, backfills.

## 3. Web app / Supabase

1. Apply `supabase/schema.sql` to a clean Supabase project and configure `app/.env`.
2. Create user A, verify confirmation email if enabled, sign in and sign out.
3. Create a request: all fields required; verify status defaults to "Новая".
4. Verify list includes title, category, creation date, status.
5. Edit name, description, category, status; reload browser and sign in again. Changes persist.
6. Filter by "В работе", search by partial title; verify combined filtering.
7. Double-click Save while network is slow: exactly one record appears.
8. Create user B in a separate browser/profile; check user B cannot view user A's requests.
9. In browser DevTools use a direct REST query with B's JWT for A's `id`: SELECT returns no row, UPDATE modifies no row. A forged INSERT with `owner_id` of A fails RLS. This is the essential security test.
10. Test the narrow phone viewport (320–375px) and desktop (1280px).
11. Temporarily disconnect network during save and verify a clear error and no false success.
12. Check no service_role credentials and no real employee data in the repository.

## About AI tool use

AI tools assisted in the initial structure, UI implementation, safety checklist and documentation. Final checks must include `npm run build`, RLS tests in the live Supabase environment, and human review of edge cases. Never claim remote end-to-end testing if credentials were unavailable.

## Known limitations

- Auth and DB require the user's Supabase project and public configuration keys.
- Email verification flow depends on project Auth settings and redirect URLs.
- The demo deliberately omits administrator/manager roles, notifications, attachments and deletion — outside scope.
- Client-side prevention of duplicate clicks covers one in-flight form submission; server-side deduplication across retries or tabs would require an idempotency key (not requested).
