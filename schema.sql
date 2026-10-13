-- ASCEND MIND INSTITUTE | Initial Supabase schema | v3
-- For a NEW Supabase project only. Review before running.
-- Does not delete existing tables, data, triggers or policies.
-- Run as project database owner in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '' check (char_length(full_name) <= 150),
 role text not null default 'parent' check (role in ('parent','student','tutor','admin')),
 created_at timestamptz not null default now()
);
create table if not exists public.student_guardians (
 student_id uuid not null references public.profiles(id) on delete cascade,
 guardian_id uuid not null references public.profiles(id) on delete cascade,
 primary key(student_id,guardian_id), check(student_id <> guardian_id)
);
create table if not exists public.tutor_students (
 student_id uuid not null references public.profiles(id) on delete cascade,
 tutor_id uuid not null references public.profiles(id) on delete cascade,
 assigned_at timestamptz not null default now(),
 primary key(student_id,tutor_id), check(student_id <> tutor_id)
);
create table if not exists public.lessons (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 student_id uuid not null references public.profiles(id),
 tutor_id uuid not null references public.profiles(id),
 starts_at timestamptz not null,
 duration_minutes integer not null check(duration_minutes between 10 and 360),
 meeting_url text check(meeting_url is null or meeting_url ~ '^https://'),
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 created_at timestamptz not null default now()
);
create table if not exists public.assignments (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 student_id uuid not null references public.profiles(id),
 tutor_id uuid not null references public.profiles(id),
 instructions text,
 due_at timestamptz,
 created_at timestamptz not null default now(),
 unique(id,student_id)
);
create table if not exists public.submissions (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null,
 student_id uuid not null references public.profiles(id),
 content text not null,
 submitted_at timestamptz not null default now(),
 unique(assignment_id,student_id),
 foreign key(assignment_id,student_id) references public.assignments(id,student_id) on delete cascade
);
create table if not exists public.attendance (
 id uuid primary key default gen_random_uuid(),
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 student_id uuid not null references public.profiles(id),
 status text not null check(status in ('present','absent','late','excused')),
 notes text,
 recorded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(lesson_id,student_id)
);
create table if not exists public.progress_reports (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id),
 tutor_id uuid not null references public.profiles(id),
 subject text,
 period_label text,
 score numeric check(score between 0 and 100),
 comments text,
 created_at timestamptz not null default now()
);
create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id),
 description text,
 amount_kobo bigint not null check(amount_kobo > 0),
 status text not null default 'unpaid' check(status in ('unpaid','paid')),
 paystack_reference text unique,
 paid_at timestamptz,
 created_at timestamptz not null default now()
);

create index if not exists idx_guardians_guardian on public.student_guardians(guardian_id);
create index if not exists idx_tutor_students_tutor on public.tutor_students(tutor_id);
create index if not exists idx_lessons_student on public.lessons(student_id,starts_at);
create index if not exists idx_lessons_tutor on public.lessons(tutor_id,starts_at);
create index if not exists idx_assignments_student on public.assignments(student_id);
create index if not exists idx_invoices_student on public.invoices(student_id);

-- SECURITY DEFINER helpers use an empty search_path and schema-qualified references.
-- Keep these owned by the trusted database owner; never expose service-role keys in the browser.
create or replace function public.ami_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin');
$$;
create or replace function public.ami_is_tutor() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='tutor');
$$;
create or replace function public.ami_is_student(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=s and p.role='student');
$$;
create or replace function public.ami_is_guardian(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.student_guardians g where g.student_id=s and g.guardian_id=(select auth.uid()));
$$;
create or replace function public.ami_is_assigned_tutor(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.ami_is_tutor() and exists(select 1 from public.tutor_students ts where ts.student_id=s and ts.tutor_id=(select auth.uid()));
$$;
create or replace function public.ami_can_view_student(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.ami_is_admin() or (s=(select auth.uid()) and public.ami_is_student(s)) or public.ami_is_guardian(s);
$$;
create or replace function public.ami_assignment_matches(a uuid,s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.assignments x where x.id=a and x.student_id=s);
$$;
create or replace function public.ami_tutor_owns_assignment(a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.ami_is_tutor() and exists(select 1 from public.assignments x where x.id=a and x.tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(x.student_id));
$$;
create or replace function public.ami_lesson_matches(l uuid,s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.lessons x where x.id=l and x.student_id=s);
$$;
create or replace function public.ami_tutor_owns_lesson(l uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.ami_is_tutor() and exists(select 1 from public.lessons x where x.id=l and x.tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(x.student_id));
$$;

-- New users always start as parent. Admin assigns other roles through a trusted workflow.
create or replace function public.ami_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,full_name,role)
 values(new.id,coalesce(left(new.raw_user_meta_data->>'full_name',150),''),'parent')
 on conflict(id) do nothing;
 return new;
end;
$$;
-- Do not overwrite an existing trigger with the same name.
do $$ begin
 if not exists (select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='ami_on_auth_user_created') then
  create trigger ami_on_auth_user_created after insert on auth.users
  for each row execute function public.ami_create_profile();
 end if;
end $$;

-- Validate relationships even when created through privileged server code.
create or replace function public.ami_validate_guardian_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=new.student_id and role='student') or
    not exists(select 1 from public.profiles where id=new.guardian_id and role='parent') then
  raise exception 'Guardian links require a student and a parent profile';
 end if;
 return new;
end;
$$;
create or replace function public.ami_validate_tutor_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=new.student_id and role='student') or
    not exists(select 1 from public.profiles where id=new.tutor_id and role='tutor') then
  raise exception 'Tutor links require a student and a tutor profile';
 end if;
 return new;
end;
$$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.student_guardians'::regclass and tgname='ami_check_guardian') then
  create trigger ami_check_guardian before insert or update on public.student_guardians
  for each row execute function public.ami_validate_guardian_link();
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.tutor_students'::regclass and tgname='ami_check_tutor') then
  create trigger ami_check_tutor before insert or update on public.tutor_students
  for each row execute function public.ami_validate_tutor_link();
 end if;
end $$;

-- Row-level security is enabled on every application table.
alter table public.profiles enable row level security;
alter table public.student_guardians enable row level security;
alter table public.tutor_students enable row level security;
alter table public.lessons enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.attendance enable row level security;
alter table public.progress_reports enable row level security;
alter table public.invoices enable row level security;

-- Profiles: users see their own; admins see all; assigned tutors see students' basic profiles.
create policy ami_profiles_read on public.profiles for select to authenticated
 using(id=(select auth.uid()) or public.ami_is_admin() or
 (role='student' and public.ami_is_assigned_tutor(id)) or
 (role='student' and public.ami_is_guardian(id)));
-- No client UPDATE/INSERT/DELETE policies on profiles: role changes are admin-only via SQL/server.

create policy ami_guardians_read on public.student_guardians for select to authenticated
 using(public.ami_is_admin() or guardian_id=(select auth.uid()));
create policy ami_guardians_admin_insert on public.student_guardians for insert to authenticated
 with check(public.ami_is_admin());
create policy ami_guardians_admin_update on public.student_guardians for update to authenticated
 using(public.ami_is_admin()) with check(public.ami_is_admin());
create policy ami_guardians_admin_delete on public.student_guardians for delete to authenticated
 using(public.ami_is_admin());

create policy ami_tutor_students_read on public.tutor_students for select to authenticated
 using(public.ami_is_admin() or tutor_id=(select auth.uid()) or student_id=(select auth.uid()) or public.ami_is_guardian(student_id));
create policy ami_tutor_students_admin_insert on public.tutor_students for insert to authenticated
 with check(public.ami_is_admin());
create policy ami_tutor_students_admin_update on public.tutor_students for update to authenticated
 using(public.ami_is_admin()) with check(public.ami_is_admin());
create policy ami_tutor_students_admin_delete on public.tutor_students for delete to authenticated
 using(public.ami_is_admin());

create policy ami_lessons_read on public.lessons for select to authenticated
 using(public.ami_can_view_student(student_id) or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id)));
create policy ami_lessons_insert on public.lessons for insert to authenticated
 with check(public.ami_is_student(student_id) and
 (public.ami_is_admin() or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id))));
create policy ami_lessons_update on public.lessons for update to authenticated
 using(public.ami_is_admin() or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id)))
 with check(public.ami_is_student(student_id) and
 (public.ami_is_admin() or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id))));
-- Note: for production, use a server-side RPC/trigger to make student_id and tutor_id immutable after creation.

create policy ami_assignments_read on public.assignments for select to authenticated
 using(public.ami_can_view_student(student_id) or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id)));
create policy ami_assignments_insert on public.assignments for insert to authenticated
 with check(public.ami_is_student(student_id) and
 (public.ami_is_admin() or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id))));

create policy ami_submissions_read on public.submissions for select to authenticated
 using(public.ami_can_view_student(student_id) or public.ami_tutor_owns_assignment(assignment_id));
create policy ami_submissions_insert on public.submissions for insert to authenticated
 with check(student_id=(select auth.uid()) and public.ami_is_student(student_id) and public.ami_assignment_matches(assignment_id,student_id));
create policy ami_submissions_update on public.submissions for update to authenticated
 using(student_id=(select auth.uid()) and public.ami_is_student(student_id))
 with check(student_id=(select auth.uid()) and public.ami_is_student(student_id) and public.ami_assignment_matches(assignment_id,student_id));

create policy ami_attendance_read on public.attendance for select to authenticated
 using(public.ami_can_view_student(student_id) or public.ami_tutor_owns_lesson(lesson_id));
create policy ami_attendance_insert on public.attendance for insert to authenticated
 with check(recorded_by=(select auth.uid()) and public.ami_lesson_matches(lesson_id,student_id) and
 (public.ami_is_admin() or public.ami_tutor_owns_lesson(lesson_id)));
create policy ami_attendance_update on public.attendance for update to authenticated
 using(public.ami_is_admin() or public.ami_tutor_owns_lesson(lesson_id))
 with check(public.ami_lesson_matches(lesson_id,student_id) and (public.ami_is_admin() or public.ami_tutor_owns_lesson(lesson_id)));

create policy ami_reports_read on public.progress_reports for select to authenticated
 using(public.ami_can_view_student(student_id) or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id)));
create policy ami_reports_insert on public.progress_reports for insert to authenticated
 with check(public.ami_is_student(student_id) and
 (public.ami_is_admin() or (tutor_id=(select auth.uid()) and public.ami_is_assigned_tutor(student_id))));

create policy ami_invoices_read on public.invoices for select to authenticated
 using(public.ami_can_view_student(student_id));
create policy ami_invoices_insert on public.invoices for insert to authenticated
 with check(public.ami_is_admin() and public.ami_is_student(student_id));
-- No authenticated UPDATE on invoices. Verified server-side payment webhook uses service role.

-- Restrict table grants to match policies (RLS still applies).
revoke all on public.profiles, public.student_guardians, public.tutor_students,
 public.lessons, public.assignments, public.submissions, public.attendance,
 public.progress_reports, public.invoices from anon;
revoke all on public.profiles, public.student_guardians, public.tutor_students,
 public.lessons, public.assignments, public.submissions, public.attendance,
 public.progress_reports, public.invoices from authenticated;
grant select on public.profiles to authenticated;
grant select,insert,update,delete on public.student_guardians,public.tutor_students to authenticated;
grant select,insert,update on public.lessons to authenticated;
grant select,insert on public.assignments to authenticated;
grant select,insert,update on public.submissions,public.attendance to authenticated;
grant select,insert on public.progress_reports,public.invoices to authenticated;

-- Helpers needed by RLS; no anonymous invocation.
revoke execute on function public.ami_is_admin(), public.ami_is_tutor(), public.ami_is_student(uuid),
 public.ami_is_guardian(uuid), public.ami_is_assigned_tutor(uuid), public.ami_can_view_student(uuid),
 public.ami_assignment_matches(uuid,uuid), public.ami_tutor_owns_assignment(uuid),
 public.ami_lesson_matches(uuid,uuid), public.ami_tutor_owns_lesson(uuid) from public,anon;
grant execute on function public.ami_is_admin(), public.ami_is_tutor(), public.ami_is_student(uuid),
 public.ami_is_guardian(uuid), public.ami_is_assigned_tutor(uuid), public.ami_can_view_student(uuid),
 public.ami_assignment_matches(uuid,uuid), public.ami_tutor_owns_assignment(uuid),
 public.ami_lesson_matches(uuid,uuid), public.ami_tutor_owns_lesson(uuid) to authenticated;
revoke execute on function public.ami_create_profile(), public.ami_validate_guardian_link(), public.ami_validate_tutor_link() from public,anon,authenticated;

-- For deployment: check any existing application code that expects function names from the older schema.
-- Payments must be verified server-side against Paystack amount, currency, reference and invoice.
