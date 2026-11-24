import { serviceClient } from '../_shared/http.ts'

function equalHex(left: string, right: string) {
	if (left.length !== right.length) return false
	let mismatch = 0
	for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
	return mismatch === 0
}

async function signatureFor(payload: string, secret: string) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-512' },
		false,
		['sign'],
	)
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
	return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
	if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

	const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
	const suppliedSignature = request.headers.get('x-paystack-signature') ?? ''
	if (!secret || !suppliedSignature) return new Response('Unauthorized', { status: 401 })

	const payload = await request.text()
	const expectedSignature = await signatureFor(payload, secret)
	if (!equalHex(expectedSignature, suppliedSignature.toLowerCase())) return new Response('Unauthorized', { status: 401 })

	let event: { event?: string; data?: Record<string, unknown> }
	try {
		event = JSON.parse(payload)
	} catch {
		return new Response('Invalid payload', { status: 400 })
	}

	try {
		const admin = serviceClient()
		if (event.event === 'charge.success') {
			const reference = event.data?.reference
			if (typeof reference !== 'string') return new Response('Missing reference', { status: 400 })

			const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
				headers: { Authorization: `Bearer ${secret}` },
			})
			const verification = await verifyResponse.json().catch(() => null)
			const transaction = verification?.data
			if (!verifyResponse.ok || verification?.status !== true || transaction?.status !== 'success'
				|| transaction?.reference !== reference || transaction?.currency !== 'NGN'
				|| !Number.isSafeInteger(transaction?.amount) || transaction.amount <= 0) {
				return new Response('Payment verification failed', { status: 400 })
			}

			const { error } = await admin.rpc('settle_paystack_order', {
				requested_reference: reference,
				verified_amount_kobo: transaction.amount,
				verified_currency: transaction.currency,
			})
			if (error) throw error
			return new Response('ok', { status: 200 })
		}

		if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event ?? '')) {
			const reference = event.data?.reference
			if (typeof reference !== 'string') return new Response('Missing reference', { status: 400 })
			const { data: withdrawal, error: lookupError } = await admin
				.from('withdrawal_requests')
				.select('id, amount_kobo, currency')
				.eq('paystack_reference', reference)
				.maybeSingle()
			if (lookupError) throw lookupError
			if (!withdrawal) return new Response('Unknown transfer', { status: 404 })
			if (event.data?.currency !== withdrawal.currency || event.data?.amount !== withdrawal.amount_kobo) {
				console.error('Transfer webhook does not match reserved withdrawal', reference)
				return new Response('Transfer verification failed', { status: 400 })
			}

			const finalStatus = event.event === 'transfer.success' ? 'paid' : event.event === 'transfer.failed' ? 'failed' : 'reversed'
			const { error } = await admin.rpc('finish_instructor_withdrawal', {
				requested_withdrawal_id: withdrawal.id,
				final_status: finalStatus,
			})
			if (error) throw error
		}

		return new Response('ok', { status: 200 })
	} catch (error) {
		console.error('Paystack webhook processing failed', error)
		return new Response('Webhook processing failed', { status: 500 })
	}
})