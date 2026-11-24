import { corsHeaders, getRole, isAllowedOrigin, json, preflight, requireUser, serviceClient } from '../_shared/http.ts'

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return preflight(request)
	if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
	if (!isAllowedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403)

	try {
		const user = await requireUser(request)
		if (!user) return json(request, { error: 'Sign in required' }, 401)
		if (await getRole(user.id) !== 'instructor') return json(request, { error: 'Instructor account required' }, 403)

		const body = await request.json().catch(() => null)
		if (typeof body?.account_number !== 'string' || !/^\d{10}$/.test(body.account_number)
			|| typeof body?.bank_code !== 'string' || !/^\d{2,6}$/.test(body.bank_code)) {
			return json(request, { error: 'Enter a valid Nigerian bank account and bank' }, 400)
		}

		const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
		if (!secret) return json(request, { error: 'Payout setup unavailable' }, 503)

		const resolveUrl = new URL('https://api.paystack.co/bank/resolve')
		resolveUrl.searchParams.set('account_number', body.account_number)
		resolveUrl.searchParams.set('bank_code', body.bank_code)
		const resolveResponse = await fetch(resolveUrl, { headers: { Authorization: `Bearer ${secret}` } })
		const resolved = await resolveResponse.json().catch(() => null)
		if (!resolveResponse.ok || resolved?.status !== true || typeof resolved?.data?.account_name !== 'string') {
			return json(request, { error: 'We could not verify that bank account' }, 400)
		}

		const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
			method: 'POST',
			headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'nuban',
				name: resolved.data.account_name,
				account_number: body.account_number,
				bank_code: body.bank_code,
				currency: 'NGN',
			}),
		})
		const recipient = await recipientResponse.json().catch(() => null)
		if (!recipientResponse.ok || recipient?.status !== true || typeof recipient?.data?.recipient_code !== 'string') {
			console.error('Paystack recipient creation failed', recipientResponse.status, recipient?.message)
			return json(request, { error: 'Payout account could not be saved' }, 502)
		}

		const admin = serviceClient()
		const { error } = await admin.from('instructor_payout_accounts').upsert({
			user_id: user.id,
			paystack_recipient_code: recipient.data.recipient_code,
			bank_name: recipient.data.details?.bank_name ?? 'Nigerian bank',
			account_last4: body.account_number.slice(-4),
		})
		if (error) throw error

		return json(request, {
			account_name: resolved.data.account_name,
			bank_name: recipient.data.details?.bank_name ?? 'Nigerian bank',
			account_last4: body.account_number.slice(-4),
		})
	} catch (error) {
		console.error('Payout-account setup failed', error)
		return json(request, { error: 'Payout account could not be saved' }, 500)
	}
})