create or replace function public.assert_admin_access()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not (select private.has_role('admin')) then
		raise exception 'Admin role required';
	end if;
end;
$$;

revoke all on function public.assert_admin_access() from public, anon;
grant execute on function public.assert_admin_access() to authenticated;
