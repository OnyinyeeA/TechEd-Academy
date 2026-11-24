create or replace function private.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.profiles p
		where p.user_id = (select auth.uid())
			and p.role = required_role
			and (
				required_role <> 'admin'
				or (select auth.jwt() ->> 'aal') = 'aal2'
			)
	);
$$;
