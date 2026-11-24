import { getRole, isAllowedOrigin, json, preflight, requireUser, serviceClient } from '../_shared/http.ts'

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return preflight(request)
	if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
	if (!isAllowedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403)

	try {
		const user = await requireUser(request)
		if (!user) return json(request, { error: 'Sign in required' }, 401)
		if (await getRole(user.id) !== 'student') return json(request, { error: 'Student account required' }, 403)

		const body = await request.json().catch(() => null)
		const reference = body?.reference
		if (typeof reference !== 'string' || !/^[a-z0-9_-]{16,50}$/.test(reference)) {
			return json(request, { error: 'Invalid payment reference' }, 400)
		}

		const admin = serviceClient()
		const { data: order, error: orderError } = await admin
			.from('payment_orders')
			.select('id, student_id, amount_kobo, currency, status, provider_reference')
			.eq('provider_reference', reference)
			.eq('student_id', user.id)
			.maybeSingle()
		if (orderError) throw orderError
		if (!order) return json(request, { error: 'Payment order not found' }, 404)
		if (order.status === 'paid') return json(request, { status: 'paid' })

		const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
		if (!secret) return json(request, { error: 'Payment verification unavailable' }, 503)
		const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
			headers: { Authorization: `Bearer ${secret}` },
		})
		const result = await response.json().catch(() => null)
		const transaction = result?.data
		if (!response.ok || result?.status !== true || transaction?.reference !== order.provider_reference) {
			return json(request, { error: 'Payment verification unavailable' }, 502)
		}
		if (transaction.status === 'success') {
			if (transaction.currency !== order.currency || transaction.currency !== 'NGN'
				|| transaction.amount !== order.amount_kobo || !Number.isSafeInteger(transaction.amount)) {
				console.error('Verified transaction mismatched order', order.id)
				return json(request, { error: 'Payment details did not match the order' }, 409)
			}
			const { error } = await admin.rpc('settle_paystack_order', {
				requested_reference: reference,
				verified_amount_kobo: transaction.amount,
				verified_currency: transaction.currency,
			})
			if (error) throw error
			return json(request, { status: 'paid' })
		}

		if (transaction.status === 'failed' || transaction.status === 'abandoned') {
			await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending')
			return json(request, { status: 'failed' })
		}
		return json(request, { status: 'processing' }, 202)
	} catch (error) {
		console.error('Payment verification failed', error)
		return json(request, { error: 'Payment verification could not be completed' }, 500)
	}
})