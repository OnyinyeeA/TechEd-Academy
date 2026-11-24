create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	full_name text not null default '',
	role text not null default 'student' check (role in ('student', 'instructor', 'admin')),
	created_at timestamptz not null default now()
);

create table public.instructor_applications (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null unique references public.profiles (user_id) on delete cascade,
	application_note text not null default '',
	status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
	created_at timestamptz not null default now(),
	reviewed_at timestamptz,
	reviewed_by uuid references public.profiles (user_id) on delete set null
);

create table public.account_deletion_requests (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null unique,
	status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
	requested_at timestamptz not null default now(),
	processed_at timestamptz,
	processed_by uuid references public.profiles (user_id) on delete set null
);

create table public.courses (
	id uuid primary key default gen_random_uuid(),
	instructor_id uuid not null references public.profiles (user_id) on delete restrict,
	title text not null check (length(title) between 3 and 120),
	description text not null default '',
	category text not null check (category in ('Frontend', 'Backend', 'Frameworks')),
	price_kobo bigint not null check (price_kobo >= 100),
	currency text not null default 'NGN' check (currency = 'NGN'),
	status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'rejected', 'archived')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table public.course_pricing_policy (
	singleton boolean primary key default true check (singleton),
	minimum_price_kobo bigint not null default 100 check (minimum_price_kobo >= 100),
	maximum_price_kobo bigint,
	updated_at timestamptz not null default now(),
	updated_by uuid references public.profiles (user_id) on delete set null,
	check (maximum_price_kobo is null or maximum_price_kobo >= minimum_price_kobo)
);

insert into public.course_pricing_policy (singleton, minimum_price_kobo, maximum_price_kobo)
values (true, 100, null);

create table public.instructor_payout_accounts (
	user_id uuid primary key references public.profiles (user_id) on delete cascade,
	paystack_recipient_code text not null unique,
	bank_name text not null,
	account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
	created_at timestamptz not null default now()
);

create table public.payment_orders (
	id uuid primary key default gen_random_uuid(),
	student_id uuid not null references public.profiles (user_id) on delete restrict,
	instructor_id uuid not null references public.profiles (user_id) on delete restrict,
	course_id uuid not null references public.courses (id) on delete restrict,
	amount_kobo bigint not null check (amount_kobo > 0),
	currency text not null default 'NGN' check (currency = 'NGN'),
	status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
	provider_reference text not null unique,
	checkout_url text,
	created_at timestamptz not null default now(),
	paid_at timestamptz
);

create unique index payment_orders_one_pending_or_paid_course
	on public.payment_orders (student_id, course_id)
	where status in ('pending', 'paid');

create table public.enrollments (
	id uuid primary key default gen_random_uuid(),
	student_id uuid not null references public.profiles (user_id) on delete cascade,
	course_id uuid not null references public.courses (id) on delete restrict,
	order_id uuid not null unique references public.payment_orders (id) on delete restrict,
	status text not null default 'active' check (status in ('active', 'revoked')),
	progress smallint not null default 0 check (progress between 0 and 100),
	created_at timestamptz not null default now(),
	unique (student_id, course_id)
);

create table public.course_lessons (
	id uuid primary key default gen_random_uuid(),
	course_id uuid not null references public.courses (id) on delete cascade,
	title text not null check (length(title) between 1 and 160),
	content text not null default '',
	media_path text,
	position integer not null default 0 check (position >= 0),
	created_at timestamptz not null default now(),
	unique (course_id, position)
);

create table public.instructor_wallets (
	instructor_id uuid primary key references public.profiles (user_id) on delete restrict,
	available_kobo bigint not null default 0 check (available_kobo >= 0),
	updated_at timestamptz not null default now()
);

create table public.withdrawal_requests (
	id uuid primary key default gen_random_uuid(),
	instructor_id uuid not null references public.profiles (user_id) on delete restrict,
	amount_kobo bigint not null check (amount_kobo > 0),
	currency text not null default 'NGN' check (currency = 'NGN'),
	status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed', 'reversed')),
	paystack_reference text not null unique,
	idempotency_key uuid not null,
	created_at timestamptz not null default now(),
	completed_at timestamptz,
	unique (instructor_id, idempotency_key)
);

create table public.instructor_ledger_entries (
	id uuid primary key default gen_random_uuid(),
	instructor_id uuid not null references public.profiles (user_id) on delete restrict,
	order_id uuid references public.payment_orders (id) on delete restrict,
	withdrawal_id uuid references public.withdrawal_requests (id) on delete restrict,
	entry_type text not null check (entry_type in ('course_earning', 'withdrawal', 'withdrawal_reversal')),
	amount_kobo bigint not null check (amount_kobo <> 0),
	created_at timestamptz not null default now(),
	check (
		(entry_type = 'course_earning' and order_id is not null and withdrawal_id is null and amount_kobo > 0)
		or (entry_type = 'withdrawal' and order_id is null and withdrawal_id is not null and amount_kobo < 0)
		or (entry_type = 'withdrawal_reversal' and order_id is null and withdrawal_id is not null and amount_kobo > 0)
	)
);

create unique index instructor_ledger_order_once
	on public.instructor_ledger_entries (order_id)
	where entry_type = 'course_earning';
create unique index instructor_ledger_withdrawal_once
	on public.instructor_ledger_entries (withdrawal_id, entry_type)
	where withdrawal_id is not null;

create table public.academy_revenue_entries (
	id uuid primary key default gen_random_uuid(),
	order_id uuid not null unique references public.payment_orders (id) on delete restrict,
	amount_kobo bigint not null check (amount_kobo >= 0),
	currency text not null default 'NGN' check (currency = 'NGN'),
	created_at timestamptz not null default now()
);

create index courses_instructor_id_idx on public.courses (instructor_id);
create index courses_status_idx on public.courses (status);
create index enrollments_student_id_idx on public.enrollments (student_id);
create index course_lessons_course_id_idx on public.course_lessons (course_id, position);
create index payment_orders_student_id_idx on public.payment_orders (student_id, created_at desc);
create index ledger_instructor_id_idx on public.instructor_ledger_entries (instructor_id, created_at desc);
create index withdrawal_instructor_id_idx on public.withdrawal_requests (instructor_id, created_at desc);

create or replace function private.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.profiles p
		where p.user_id = (select auth.uid()) and p.role = required_role
	);
$$;

create or replace function private.can_access_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.courses c
		where c.id = target_course_id and c.instructor_id = (select auth.uid())
	) or exists (
		select 1 from public.enrollments e
		where e.course_id = target_course_id
			and e.student_id = (select auth.uid())
			and e.status = 'active'
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
		where c.id = target_course_id and c.instructor_id = (select auth.uid())
	) and private.has_role('instructor');
$$;

create or replace function private.price_is_approved(proposed_price_kobo bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.course_pricing_policy p
		where p.singleton
			and p.maximum_price_kobo is not null
			and proposed_price_kobo between p.minimum_price_kobo and p.maximum_price_kobo
	);
$$;

revoke all on function private.has_role(text) from public, anon;
revoke all on function private.can_access_course(uuid) from public, anon;
revoke all on function private.owns_course(uuid) from public, anon;
revoke all on function private.price_is_approved(bigint) from public, anon;
grant execute on function private.has_role(text) to authenticated, service_role;
grant execute on function private.can_access_course(uuid) to authenticated, service_role;
grant execute on function private.owns_course(uuid) to authenticated, service_role;
grant execute on function private.price_is_approved(bigint) to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (user_id, full_name, role)
	values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'student');

	if new.raw_user_meta_data ->> 'requested_role' = 'instructor' then
		insert into public.instructor_applications (user_id)
		values (new.id)
		on conflict (user_id) do nothing;
	end if;

	return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.instructor_applications enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.courses enable row level security;
alter table public.instructor_payout_accounts enable row level security;
alter table public.payment_orders enable row level security;
alter table public.enrollments enable row level security;
alter table public.course_lessons enable row level security;
alter table public.instructor_wallets enable row level security;
alter table public.instructor_ledger_entries enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.academy_revenue_entries enable row level security;
alter table public.course_pricing_policy enable row level security;

revoke all on public.profiles, public.instructor_applications, public.account_deletion_requests, public.courses,
	public.instructor_payout_accounts, public.payment_orders, public.enrollments,
	public.course_lessons, public.instructor_wallets, public.instructor_ledger_entries,
	public.withdrawal_requests, public.academy_revenue_entries, public.course_pricing_policy
from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.instructor_applications to authenticated;
grant select, insert (user_id) on public.account_deletion_requests to authenticated;
grant select on public.course_pricing_policy to authenticated;
grant select (user_id, bank_name, account_last4, created_at) on public.instructor_payout_accounts to authenticated;
grant select on public.courses to anon, authenticated;
grant insert (instructor_id, title, description, category, price_kobo) on public.courses to authenticated;
grant update (title, description, category, price_kobo) on public.courses to authenticated;
grant select, insert, update, delete on public.course_lessons to authenticated;
grant select on public.payment_orders, public.enrollments, public.instructor_wallets,
	public.instructor_ledger_entries, public.withdrawal_requests to authenticated;
grant select on public.academy_revenue_entries to authenticated;

create policy profiles_read_self_or_admin
	on public.profiles for select to authenticated
	using (user_id = (select auth.uid()) or (select private.has_role('admin')));
create policy profiles_update_self
	on public.profiles for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy instructor_applications_read_self_or_admin
	on public.instructor_applications for select to authenticated
	using (user_id = (select auth.uid()) or (select private.has_role('admin')));
create policy account_deletion_requests_read_self_or_admin
	on public.account_deletion_requests for select to authenticated
	using (user_id = (select auth.uid()) or (select private.has_role('admin')));
create policy account_deletion_requests_insert_self
	on public.account_deletion_requests for insert to authenticated
	with check (
		user_id = (select auth.uid())
		and ((select private.has_role('student')) or (select private.has_role('instructor')))
	);
create policy account_deletion_requests_admin_update
	on public.account_deletion_requests for update to authenticated
	using ((select private.has_role('admin')))
	with check ((select private.has_role('admin')));

create policy courses_read_published
	on public.courses for select to anon, authenticated
	using (status = 'published');
create policy courses_read_owner_or_admin
	on public.courses for select to authenticated
	using (instructor_id = (select auth.uid()) or (select private.has_role('admin')));
create policy courses_read_active_enrollment
	on public.courses for select to authenticated
	using (
		exists (
			select 1 from public.enrollments e
			where e.course_id = id
				and e.student_id = (select auth.uid())
				and e.status = 'active'
		)
	);
create policy courses_insert_approved_instructor
	on public.courses for insert to authenticated
	with check (
		instructor_id = (select auth.uid())
		and (select private.has_role('instructor'))
		and (select private.price_is_approved(price_kobo))
		and status = 'draft'
	);
create policy courses_update_own_draft
	on public.courses for update to authenticated
	using (instructor_id = (select auth.uid()) and status in ('draft', 'rejected') and (select private.has_role('instructor')))
	with check (instructor_id = (select auth.uid()) and status in ('draft', 'rejected') and (select private.has_role('instructor')) and (select private.price_is_approved(price_kobo)));

create policy pricing_policy_read_admin
	on public.course_pricing_policy for select to authenticated
	using ((select private.has_role('admin')));

create or replace function public.set_course_pricing_policy(minimum_kobo bigint, maximum_kobo bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not (select private.has_role('admin')) then
		raise exception 'Admin role required';
	end if;
	if minimum_kobo < 100 or maximum_kobo < minimum_kobo then
		raise exception 'Invalid course price range';
	end if;
	update public.course_pricing_policy
	set minimum_price_kobo = minimum_kobo,
		maximum_price_kobo = maximum_kobo,
		updated_at = now(),
		updated_by = (select auth.uid())
	where singleton;
end;
$$;

create or replace function public.submit_course_for_review(target_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not (select private.has_role('instructor')) then
		raise exception 'Instructor role required';
	end if;

	update public.courses
	set status = 'pending_review', updated_at = now()
	where id = target_course_id
		and instructor_id = (select auth.uid())
		and status in ('draft', 'rejected');

	if not found then
		raise exception 'Course not found or cannot be submitted';
	end if;
end;
$$;

create or replace function public.review_instructor_application(target_user_id uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not (select private.has_role('admin')) then
		raise exception 'Admin role required';
	end if;

	update public.instructor_applications
	set status = case when approve then 'approved' else 'rejected' end,
		reviewed_at = now(),
		reviewed_by = (select auth.uid())
	where user_id = target_user_id and status = 'pending';

	if not found then
		raise exception 'Application not found or already reviewed';
	end if;

	update public.profiles
	set role = case when approve then 'instructor' else 'student' end
	where user_id = target_user_id;

	if approve then
		insert into public.instructor_wallets (instructor_id)
		values (target_user_id)
		on conflict (instructor_id) do nothing;
	end if;
end;
$$;

create or replace function public.review_course(target_course_id uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not (select private.has_role('admin')) then
		raise exception 'Admin role required';
	end if;
	if approve and not exists (
		select 1
		from public.courses c
		join public.profiles p on p.user_id = c.instructor_id
		where c.id = target_course_id
			and p.role = 'instructor'
			and private.price_is_approved(c.price_kobo)
	) then
		raise exception 'Course owner or pricing is not approved';
	end if;

	update public.courses
	set status = case when approve then 'published' else 'rejected' end,
		updated_at = now()
	where id = target_course_id and status = 'pending_review';

	if not found then
		raise exception 'Course not found or not awaiting review';
	end if;
end;
$$;

create policy course_lessons_read_entitled
	on public.course_lessons for select to authenticated
	using ((select private.can_access_course(course_id)));
create policy course_lessons_insert_instructor
	on public.course_lessons for insert to authenticated
	with check (
		(select private.has_role('instructor'))
		and exists (
			select 1 from public.courses c
			where c.id = course_id and c.instructor_id = (select auth.uid())
				and c.status in ('draft', 'pending_review', 'published')
		)
	);
create policy course_lessons_update_instructor
	on public.course_lessons for update to authenticated
	using (
		(select private.has_role('instructor'))
		and exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = (select auth.uid()))
	)
	with check (
		(select private.has_role('instructor'))
		and exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = (select auth.uid()))
	);
create policy course_lessons_delete_instructor
	on public.course_lessons for delete to authenticated
	using (
		(select private.has_role('instructor'))
		and exists (select 1 from public.courses c where c.id = course_id and c.instructor_id = (select auth.uid()))
	);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'course-materials',
	'course-materials',
	false,
	52428800,
	array['application/pdf', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
	file_size_limit = 52428800,
	allowed_mime_types = excluded.allowed_mime_types;

create policy course_materials_instructor_read
	on storage.objects for select to authenticated
	using (
		bucket_id = 'course-materials'
		and (storage.foldername(name))[1] = (select auth.uid())::text
		and (select private.owns_course(((storage.foldername(name))[2])::uuid))
	);
create policy course_materials_read_entitled
	on storage.objects for select to authenticated
	using (
		bucket_id = 'course-materials'
		and (select private.can_access_course(((storage.foldername(name))[2])::uuid))
	);
create policy course_materials_instructor_insert
	on storage.objects for insert to authenticated
	with check (
		bucket_id = 'course-materials'
		and (storage.foldername(name))[1] = (select auth.uid())::text
		and (select private.owns_course(((storage.foldername(name))[2])::uuid))
	);
create policy course_materials_instructor_update
	on storage.objects for update to authenticated
	using (
		bucket_id = 'course-materials'
		and (storage.foldername(name))[1] = (select auth.uid())::text
		and (select private.owns_course(((storage.foldername(name))[2])::uuid))
	)
	with check (
		bucket_id = 'course-materials'
		and (storage.foldername(name))[1] = (select auth.uid())::text
		and (select private.owns_course(((storage.foldername(name))[2])::uuid))
	);
create policy course_materials_instructor_delete
	on storage.objects for delete to authenticated
	using (
		bucket_id = 'course-materials'
		and (storage.foldername(name))[1] = (select auth.uid())::text
		and (select private.owns_course(((storage.foldername(name))[2])::uuid))
	);

create policy payment_orders_read_self_or_admin
	on public.payment_orders for select to authenticated
	using (student_id = (select auth.uid()) or instructor_id = (select auth.uid()) or (select private.has_role('admin')));
create policy enrollments_read_self_or_admin
	on public.enrollments for select to authenticated
	using (student_id = (select auth.uid()) or (select private.has_role('admin')));
create policy wallets_read_self_or_admin
	on public.instructor_wallets for select to authenticated
	using (instructor_id = (select auth.uid()) or (select private.has_role('admin')));
create policy ledger_read_self_or_admin
	on public.instructor_ledger_entries for select to authenticated
	using (instructor_id = (select auth.uid()) or (select private.has_role('admin')));
create policy withdrawals_read_self_or_admin
	on public.withdrawal_requests for select to authenticated
	using (instructor_id = (select auth.uid()) or (select private.has_role('admin')));
create policy payout_account_read_self_or_admin
	on public.instructor_payout_accounts for select to authenticated
	using (user_id = (select auth.uid()) or (select private.has_role('admin')));
create policy academy_revenue_admin_read
	on public.academy_revenue_entries for select to authenticated
	using ((select private.has_role('admin')));

create or replace function public.settle_paystack_order(
	requested_reference text,
	verified_amount_kobo bigint,
	verified_currency text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	order_row public.payment_orders%rowtype;
	instructor_share bigint;
	academy_share bigint;
begin
	select * into order_row
	from public.payment_orders
	where provider_reference = requested_reference
	for update;

	if not found then
		raise exception 'Payment order not found';
	end if;
	if order_row.status = 'paid' then
		return;
	end if;
	if order_row.status <> 'pending'
		or order_row.amount_kobo <> verified_amount_kobo
		or verified_currency <> 'NGN'
		or order_row.currency <> verified_currency then
		raise exception 'Payment verification mismatch';
	end if;

	instructor_share := floor(order_row.amount_kobo * 0.80)::bigint;
	academy_share := order_row.amount_kobo - instructor_share;

	update public.payment_orders
	set status = 'paid', paid_at = now()
	where id = order_row.id;

	insert into public.enrollments (student_id, course_id, order_id)
	values (order_row.student_id, order_row.course_id, order_row.id)
	on conflict (student_id, course_id) do update
	set order_id = excluded.order_id, status = 'active', progress = 0;

	insert into public.instructor_ledger_entries (instructor_id, order_id, entry_type, amount_kobo)
	values (order_row.instructor_id, order_row.id, 'course_earning', instructor_share);

	insert into public.instructor_wallets (instructor_id, available_kobo)
	values (order_row.instructor_id, instructor_share)
	on conflict (instructor_id) do update
	set available_kobo = public.instructor_wallets.available_kobo + excluded.available_kobo,
		updated_at = now();

	insert into public.academy_revenue_entries (order_id, amount_kobo)
	values (order_row.id, academy_share);
end;
$$;

create or replace function public.reserve_instructor_withdrawal(
	requested_instructor_id uuid,
	requested_amount_kobo bigint,
	requested_paystack_reference text,
	requested_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	available_amount bigint;
	withdrawal_id uuid;
	existing_withdrawal public.withdrawal_requests%rowtype;
begin
	if requested_amount_kobo <= 0
		or requested_paystack_reference !~ '^[a-z0-9_-]{16,50}$'
		or not exists (
			select 1 from public.profiles p
			where p.user_id = requested_instructor_id and p.role = 'instructor'
		)
		or not exists (
			select 1 from public.instructor_payout_accounts a
			where a.user_id = requested_instructor_id
		) then
		raise exception 'Invalid withdrawal request';
	end if;

	select * into existing_withdrawal
	from public.withdrawal_requests
	where instructor_id = requested_instructor_id
		and idempotency_key = requested_idempotency_key
	for update;

	if found then
		if existing_withdrawal.amount_kobo <> requested_amount_kobo then
			raise exception 'Idempotency key was already used with a different amount';
		end if;
		return existing_withdrawal.id;
	end if;

	select available_kobo into available_amount
	from public.instructor_wallets
	where instructor_id = requested_instructor_id
	for update;

	if not found or available_amount < requested_amount_kobo then
		raise exception 'Insufficient available balance';
	end if;

	insert into public.withdrawal_requests (instructor_id, amount_kobo, paystack_reference, idempotency_key)
	values (requested_instructor_id, requested_amount_kobo, requested_paystack_reference, requested_idempotency_key)
	returning id into withdrawal_id;

	update public.instructor_wallets
	set available_kobo = available_kobo - requested_amount_kobo, updated_at = now()
	where instructor_id = requested_instructor_id;

	insert into public.instructor_ledger_entries (instructor_id, withdrawal_id, entry_type, amount_kobo)
	values (requested_instructor_id, withdrawal_id, 'withdrawal', -requested_amount_kobo);

	return withdrawal_id;
end;
$$;

create or replace function public.finish_instructor_withdrawal(
	requested_withdrawal_id uuid,
	final_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	withdrawal_row public.withdrawal_requests%rowtype;
begin
	if final_status not in ('paid', 'failed', 'reversed') then
		raise exception 'Invalid withdrawal status';
	end if;

	select * into withdrawal_row
	from public.withdrawal_requests
	where id = requested_withdrawal_id
	for update;

	if not found or withdrawal_row.status in ('paid', 'failed', 'reversed') then
		return;
	end if;

	update public.withdrawal_requests
	set status = final_status,
		completed_at = case when final_status = 'paid' then now() else completed_at end
	where id = requested_withdrawal_id;

	if final_status in ('failed', 'reversed') then
		update public.instructor_wallets
		set available_kobo = available_kobo + withdrawal_row.amount_kobo, updated_at = now()
		where instructor_id = withdrawal_row.instructor_id;

		insert into public.instructor_ledger_entries (instructor_id, withdrawal_id, entry_type, amount_kobo)
		values (withdrawal_row.instructor_id, requested_withdrawal_id, 'withdrawal_reversal', withdrawal_row.amount_kobo)
		on conflict (withdrawal_id, entry_type) where withdrawal_id is not null do nothing;
	end if;
end;
$$;

revoke all on function public.settle_paystack_order(text, bigint, text) from public, anon, authenticated;
revoke all on function public.reserve_instructor_withdrawal(uuid, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_instructor_withdrawal(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_course_for_review(uuid) from public, anon;
revoke all on function public.review_instructor_application(uuid, boolean) from public, anon;
revoke all on function public.review_course(uuid, boolean) from public, anon;
revoke all on function public.set_course_pricing_policy(bigint, bigint) from public, anon;
grant execute on function public.settle_paystack_order(text, bigint, text) to service_role;
grant execute on function public.reserve_instructor_withdrawal(uuid, bigint, text, uuid) to service_role;
grant execute on function public.finish_instructor_withdrawal(uuid, text) to service_role;
grant execute on function public.submit_course_for_review(uuid) to authenticated;
grant execute on function public.review_instructor_application(uuid, boolean) to authenticated;
grant execute on function public.review_course(uuid, boolean) to authenticated;
grant execute on function public.set_course_pricing_policy(bigint, bigint) to authenticated;