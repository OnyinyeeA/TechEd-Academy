import { getRole, isAllowedOrigin, json, preflight, requireUser, serviceClient } from '../_shared/http.ts'

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return preflight(request)
	if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
	if (!isAllowedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403)

	try {
		const user = await requireUser(request)
		if (!user) return json(request, { error: 'Sign in required' }, 401)
		const role = await getRole(user.id)
		if (role !== 'student' && role !== 'instructor') return json(request, { error: 'Account deletion request is not available' }, 403)

		const admin = serviceClient()
		const { data: current, error: lookupError } = await admin
			.from('account_deletion_requests')
			.select('status')
			.eq('user_id', user.id)
			.maybeSingle()
		if (lookupError) throw lookupError
		if (current) return json(request, { status: current.status, message: 'Your account deletion request is already on file.' })

		const { error } = await admin.from('account_deletion_requests').insert({ user_id: user.id })
		if (error) throw error
		return json(request, { status: 'pending', message: 'Your account deletion request was submitted for review.' }, 202)
	} catch (error) {
		console.error('Account deletion request failed', error)
		return json(request, { error: 'Account deletion request could not be submitted' }, 500)
	}
})