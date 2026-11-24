create or replace function public.approved_instructor_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)
	from public.profiles
	where role = 'instructor';
$$;

revoke all on function public.approved_instructor_count() from public, anon, authenticated;
grant execute on function public.approved_instructor_count() to anon, authenticated;
