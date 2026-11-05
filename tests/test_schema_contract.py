"""Lightweight static checks: these do not replace live PostgreSQL RLS tests."""
from pathlib import Path
import re

sql = Path(__file__).resolve().parents[1].joinpath("supabase", "schema.sql").read_text().lower()
def check(pattern, message):
    assert re.search(pattern, sql, re.S), message
    print("PASS", message)

check(r"create table if not exists public\.automation_requests.*?owner_id uuid not null default auth\.uid\(\)", "database populates owner from Supabase auth.uid")
check(r"alter table public\.automation_requests enable row level security", "RLS enabled for requests")
check(r"create policy requests_select_own.*?for select.*?using \(owner_id = \(select auth\.uid\(\)\)\)", "SELECT scoped to owner")
check(r"create policy requests_insert_own.*?for insert.*?with check \(owner_id = \(select auth\.uid\(\)\) and status = 'новая'\)", "INSERT restricted to owner and defaults to Новая")
check(r"create policy requests_update_own.*?for update.*?using \(owner_id = \(select auth\.uid\(\)\)\).*?with check \(owner_id = \(select auth\.uid\(\)\)\)", "UPDATE both USING and WITH CHECK")
assert "for delete to authenticated" not in sql, "No authenticated DELETE policy should exist"
print("PASS no DELETE policy")
check(r"create policy services_public_read.*?for select to anon, authenticated", "services catalog public read only")
check(r"revoke insert, update, delete on public\.services from anon, authenticated", "services catalog mutations forbidden to anon/authenticated")
print("8 static checks passed; live Supabase RLS must be tested separately.")
