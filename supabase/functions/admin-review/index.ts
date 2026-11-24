/// <reference types="deno" />

import { createClient } from '@supabase/supabase-js'
import { getRole, isAllowedOrigin, isValidUuid, json, preflight, requireUser, serviceClient } from '../_shared/http.ts'

Deno.serve(async (request: Request) => {
	if (request.method === 'OPTIONS') return preflight(request)
	if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
	if (!isAllowedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403)

	try {
		const user = await requireUser(request)
		if (!user) return json(request, { error: 'Sign in required' }, 401)
		if (await getRole(user.id) !== 'admin') return json(request, { error: 'Admin account required' }, 403)

		const supabaseUrl = Deno.env.get('SUPABASE_URL')
		const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
		const authorization = request.headers.get('authorization')
		if (!supabaseUrl || !anonKey || !authorization) return json(request, { error: 'Supabase configuration missing' }, 500)
		const caller = createClient(supabaseUrl, anonKey, {
			global: { headers: { Authorization: authorization } },
			auth: { persistSession: false, autoRefreshToken: false },
		})
		const { error: accessError } = await caller.rpc('assert_admin_access')
		if (accessError) return json(request, { error: 'Admin MFA verification is required. Sign out and complete verification, then retry.' }, 403)

		const body = await request.json().catch(() => null)
		if (!body || typeof body !== 'object') return json(request, { error: 'Invalid admin action' }, 400)

		if (body.type === 'delete_account' && isValidUuid(body.user_id)) {
			return await deleteAccount(request, body.user_id)
		}
		if (body.type === 'delete_course' && isValidUuid(body.course_id)) {
			return await deleteCourse(request, body.course_id)
		}
		if (body.type === 'account_deletion' && isValidUuid(body.request_id) && typeof body.approve === 'boolean') {
			return await reviewAccountDeletion(request, body.request_id, body.approve, user.id)
		}
		if (typeof body.approve !== 'boolean') return json(request, { error: 'Invalid review decision' }, 400)

		let result
		if (body?.type === 'instructor' && isValidUuid(body?.user_id)) {
			result = await caller.rpc('review_instructor_application', { target_user_id: body.user_id, approve: body.approve })
		} else if (body?.type === 'course' && isValidUuid(body?.course_id)) {
			result = await caller.rpc('review_course', { target_course_id: body.course_id, approve: body.approve })
		} else {
			return json(request, { error: 'Invalid review target' }, 400)
		}
		if (result.error) {
			console.error('Admin review RPC failed', result.error)
			if (result.error.message.includes('Admin role required')) {
				return json(request, { error: 'Your admin permissions could not be verified. Sign out and back in, then retry.' }, 403)
			}
			if (result.error.message.includes('Course owner or pricing is not approved')) {
				return json(request, { error: 'The instructor or course price is not approved for publishing.' }, 400)
			}
			if (result.error.message.includes('Course not found or not awaiting review')) {
				return json(request, { error: 'This course is no longer awaiting review. Refresh the admin page and try again.' }, 409)
			}
			return json(request, { error: 'The review could not be saved. Check the Supabase function logs for the underlying error.' }, 500)
		}
		return json(request, { reviewed: true })
	} catch (error) {
		console.error('Admin review failed', error)
		return json(request, { error: 'Review could not be completed' }, 500)
	}
})

async function deleteAccount(request: Request, userId: string) {
	const admin = serviceClient()
	const { data: profile, error: profileError } = await admin
		.from('profiles')
		.select('role')
		.eq('user_id', userId)
		.maybeSingle()
	if (profileError) throw profileError
	if (!profile || !['student', 'instructor'].includes(profile.role)) {
		return json(request, { error: 'Student or instructor account not found' }, 404)
	}

	const { error } = await admin.auth.admin.deleteUser(userId)
	if (error) {
		console.error('Admin account deletion failed', error)
		return json(request, {
			error: 'This account cannot be deleted because financial or other protected records depend on it. The account and its history were left unchanged.',
		}, 409)
	}
	return json(request, { deleted: true })
}

async function deleteCourse(request: Request, courseId: string) {
	const admin = serviceClient()
	const { data: lessons, error: lessonsError } = await admin
		.from('course_lessons')
		.select('media_path')
		.eq('course_id', courseId)
	if (lessonsError) throw lessonsError

	const { data: deletedCourse, error: deleteError } = await admin
		.from('courses')
		.delete()
		.eq('id', courseId)
		.select('id')
		.maybeSingle()
	if (deleteError) {
		console.error('Admin course deletion failed', deleteError)
		return json(request, {
			error: 'This course cannot be deleted because payment or enrollment records depend on it. The course and its history were left unchanged.',
		}, 409)
	}
	if (!deletedCourse) return json(request, { error: 'Course not found' }, 404)

	const mediaPaths = (lessons ?? []).map((lesson) => lesson.media_path).filter(Boolean)
	if (mediaPaths.length) {
		const { error: storageError } = await admin.storage.from('course-materials').remove(mediaPaths)
		if (storageError) {
			console.error('Deleted course media cleanup failed', storageError)
			return json(request, { deleted: true, warning: 'Course deleted, but some stored lesson files could not be removed.' })
		}
	}
	return json(request, { deleted: true })
}

async function reviewAccountDeletion(request: Request, requestId: string, approve: boolean, adminUserId: string) {
	const admin = serviceClient()
	const { data: deletionRequest, error: requestError } = await admin
		.from('account_deletion_requests')
		.select('id, user_id, status')
		.eq('id', requestId)
		.maybeSingle()
	if (requestError) throw requestError
	if (!deletionRequest) return json(request, { error: 'Account deletion request not found' }, 404)
	if (deletionRequest.status !== 'pending') {
		return json(request, { error: 'This account deletion request has already been reviewed' }, 409)
	}

	if (!approve) {
		const { data: reviewedRequest, error } = await admin
			.from('account_deletion_requests')
			.update({ status: 'rejected', processed_at: new Date().toISOString(), processed_by: adminUserId })
			.eq('id', requestId)
			.eq('status', 'pending')
			.select('id')
			.maybeSingle()
		if (error) throw error
		if (!reviewedRequest) return json(request, { error: 'This account deletion request has already been reviewed' }, 409)
		return json(request, { reviewed: true })
	}

	const { data: processingRequest, error: processingError } = await admin
		.from('account_deletion_requests')
		.update({ status: 'processing', processed_by: adminUserId })
		.eq('id', requestId)
		.eq('status', 'pending')
		.select('id')
		.maybeSingle()
	if (processingError) throw processingError
	if (!processingRequest) return json(request, { error: 'This account deletion request has already been reviewed' }, 409)

	const { error: deleteError } = await admin.auth.admin.deleteUser(deletionRequest.user_id)
	if (deleteError) {
		console.error('Requested account deletion failed', deleteError)
		const { error: restoreError } = await admin
			.from('account_deletion_requests')
			.update({ status: 'pending', processed_by: null })
			.eq('id', requestId)
			.eq('status', 'processing')
		if (restoreError) console.error('Account deletion request could not be restored to pending', restoreError)
		return json(request, {
			error: 'This account cannot be deleted because financial or other protected records depend on it. The account and its history were left unchanged; the request remains pending.',
		}, 409)
	}

	const { error: completionError } = await admin
		.from('account_deletion_requests')
		.update({ status: 'completed', processed_at: new Date().toISOString() })
		.eq('id', requestId)
		.eq('status', 'processing')
	if (completionError) throw completionError
	return json(request, { reviewed: true })
}