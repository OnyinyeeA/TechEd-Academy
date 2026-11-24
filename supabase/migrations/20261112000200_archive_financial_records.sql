alter table public.profiles
	add column account_status text not null default 'active'
	check (account_status in ('active', 'archived'));

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
			and p.account_status = 'active'
			and (
				required_role <> 'admin'
				or (select auth.jwt() ->> 'aal') = 'aal2'
			)
	);
$$;

create or replace function public.review_account_deletion_request(target_request_id uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	target_user_id uuid;
	target_role text;
begin
	if not (select private.has_role('admin')) then
		raise exception 'Admin role required';
	end if;

	select r.user_id
	into target_user_id
	from public.account_deletion_requests r
	where r.id = target_request_id
		and r.status = 'pending'
	for update;

	if not found then
		raise exception 'Account deletion request not found or already reviewed';
	end if;

	select p.role
	into target_role
	from public.profiles p
	where p.user_id = target_user_id
		and p.role in ('student', 'instructor');

	if target_role is null then
		raise exception 'Student or instructor account not found';
	end if;

	if approve then
		update public.profiles
		set account_status = 'archived'
		where user_id = target_user_id;

		if target_role = 'instructor' then
			update public.courses
			set status = 'archived', updated_at = now()
			where instructor_id = target_user_id
				and status <> 'archived';
		end if;

		update public.account_deletion_requests
		set status = 'completed',
			processed_at = now(),
			processed_by = (select auth.uid())
		where id = target_request_id;
	else
		update public.account_deletion_requests
		set status = 'rejected',
			processed_at = now(),
			processed_by = (select auth.uid())
		where id = target_request_id;
	end if;
end;
$$;

create or replace function public.archive_user_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	target_role text;
begin
	if not (select private.has_role('admin')) then
		raise exception 'Admin role required';
	end if;

	select p.role
	into target_role
	from public.profiles p
	where p.user_id = target_user_id
		and p.account_status = 'active'
		and p.role in ('student', 'instructor')
	for update;

	if not found then
		raise exception 'Active student or instructor account not found';
	end if;

	update public.profiles
	set account_status = 'archived'
	where user_id = target_user_id;

	if target_role = 'instructor' then
		update public.courses
		set status = 'archived', updated_at = now()
		where instructor_id = target_user_id
			and status <> 'archived';
	end if;
end;
$$;

create or replace function private.can_access_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select (
		private.has_role('instructor')
		and exists (
			select 1 from public.courses c
			where c.id = target_course_id
				and c.instructor_id = (select auth.uid())
				and c.status <> 'archived'
		)
	) or (
		private.has_role('student')
		and exists (
			select 1 from public.enrollments e
			where e.course_id = target_course_id
				and e.student_id = (select auth.uid())
				and e.status = 'active'
		)
	) or private.has_role('admin');
$$;

create or replace function private.owns_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.courses c
		where c.id = target_course_id
			and c.instructor_id = (select auth.uid())
			and c.status <> 'archived'
	) and private.has_role('instructor');
$$;

drop policy courses_read_owner_or_admin on public.courses;
create policy courses_read_owner_or_admin
	on public.courses for select to authenticated
	using (
		(instructor_id = (select auth.uid()) and (select private.has_role('instructor')))
		or (select private.has_role('admin'))
	);

drop policy courses_read_active_enrollment on public.courses;
create policy courses_read_active_enrollment
	on public.courses for select to authenticated
	using (
		(select private.has_role('student'))
		and exists (
			select 1 from public.enrollments e
			where e.course_id = id
				and e.student_id = (select auth.uid())
				and e.status = 'active'
		)
	);

drop policy course_lessons_update_instructor on public.course_lessons;
create policy course_lessons_update_instructor
	on public.course_lessons for update to authenticated
	using (
		(select private.has_role('instructor'))
		and exists (
			select 1 from public.courses c
			where c.id = course_id
				and c.instructor_id = (select auth.uid())
				and c.status <> 'archived'
		)
	)
	with check (
		(select private.has_role('instructor'))
		and exists (
			select 1 from public.courses c
			where c.id = course_id
				and c.instructor_id = (select auth.uid())
				and c.status <> 'archived'
		)
	);

drop policy course_lessons_delete_instructor on public.course_lessons;
create policy course_lessons_delete_instructor
	on public.course_lessons for delete to authenticated
	using (
		(select private.has_role('instructor'))
		and exists (
			select 1 from public.courses c
			where c.id = course_id
				and c.instructor_id = (select auth.uid())
				and c.status <> 'archived'
		)
	);

drop policy payment_orders_read_self_or_admin on public.payment_orders;
create policy payment_orders_read_self_or_admin
	on public.payment_orders for select to authenticated
	using (
		(student_id = (select auth.uid()) and (select private.has_role('student')))
		or (instructor_id = (select auth.uid()) and (select private.has_role('instructor')))
		or (select private.has_role('admin'))
	);

drop policy enrollments_read_self_or_admin on public.enrollments;
create policy enrollments_read_self_or_admin
	on public.enrollments for select to authenticated
	using (
		(student_id = (select auth.uid()) and (select private.has_role('student')))
		or (select private.has_role('admin'))
	);

drop policy wallets_read_self_or_admin on public.instructor_wallets;
create policy wallets_read_self_or_admin
	on public.instructor_wallets for select to authenticated
	using (
		(instructor_id = (select auth.uid()) and (select private.has_role('instructor')))
		or (select private.has_role('admin'))
	);

drop policy ledger_read_self_or_admin on public.instructor_ledger_entries;
create policy ledger_read_self_or_admin
	on public.instructor_ledger_entries for select to authenticated
	using (
		(instructor_id = (select auth.uid()) and (select private.has_role('instructor')))
		or (select private.has_role('admin'))
	);

drop policy withdrawals_read_self_or_admin on public.withdrawal_requests;
create policy withdrawals_read_self_or_admin
	on public.withdrawal_requests for select to authenticated
	using (
		(instructor_id = (select auth.uid()) and (select private.has_role('instructor')))
		or (select private.has_role('admin'))
	);

drop policy payout_account_read_self_or_admin on public.instructor_payout_accounts;
create policy payout_account_read_self_or_admin
	on public.instructor_payout_accounts for select to authenticated
	using (
		(user_id = (select auth.uid()) and (select private.has_role('instructor')))
		or (select private.has_role('admin'))
	);

revoke all on function public.review_account_deletion_request(uuid, boolean) from public, anon;
grant execute on function public.review_account_deletion_request(uuid, boolean) to authenticated;
revoke all on function public.archive_user_account(uuid) from public, anon;
grant execute on function public.archive_user_account(uuid) to authenticated;
