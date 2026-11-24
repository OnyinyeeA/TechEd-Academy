import { getRole, isAllowedOrigin, json, preflight, requireUser } from '../_shared/http.ts'

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return preflight(request)
	if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
	if (!isAllowedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403)

	try {
		const user = await requireUser(request)
		if (!user) return json(request, { error: 'Sign in required' }, 401)
		if (await getRole(user.id) !== 'instructor') {
			return json(request, { error: 'Instructor account required' }, 403)
		}

		const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
		if (!secret) return json(request, { error: 'Bank list is unavailable. Please contact the academy.' }, 503)

		const banksUrl = new URL('https://api.paystack.co/bank')
		banksUrl.searchParams.set('country', 'nigeria')
		banksUrl.searchParams.set('currency', 'NGN')
		banksUrl.searchParams.set('use_cursor', 'false')
		banksUrl.searchParams.set('perPage', '100')
		const response = await fetch(banksUrl, {
			headers: { Authorization: 'Bearer ' + secret },
		})
		const result = await response.json().catch(() => null)
		if (!response.ok || result?.status !== true || !Array.isArray(result?.data)) {
			console.error('Paystack bank list request failed', response.status, result?.message)
			return json(request, { error: 'Could not load banks from Paystack. Please try again.' }, 502)
		}

		const banks = result.data
			.filter((bank: { name?: unknown; code?: unknown }) =>
				typeof bank.name === 'string' && typeof bank.code === 'string')
			.map((bank: { name: string; code: string }) => ({ name: bank.name, code: bank.code }))
			.sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name))
		return json(request, { banks })
	} catch (error) {
		console.error('Paystack bank list could not be loaded', error)
		return json(request, { error: 'Could not load banks. Please try again.' }, 500)
	}
})
