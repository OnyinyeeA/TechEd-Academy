import { getRole, isAllowedOrigin, isValidUuid, json, preflight, requireUser, serviceClient } from '../_shared/http.ts'

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return preflight(request)
	if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
	if (!isAllowedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403)

	try {
		const user = await requireUser(request)
		if (!user) return json(request, { error: 'Sign in required' }, 401)
		if (await getRole(user.id) !== 'instructor') return json(request, { error: 'Instructor account required' }, 403)

		const body = await request.json().catch(() => null)
		if (!Number.isSafeInteger(body?.amount_kobo) || body.amount_kobo <= 0 || !isValidUuid(body?.idempotency_key)) {
			return json(request, { error: 'Invalid withdrawal amount or request key' }, 400)
		}

		const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
		if (!secret) return json(request, { error: 'Withdrawals are not configured. Please contact the academy.' }, 503)

		const admin = serviceClient()
		const { data: payoutAccount, error: payoutError } = await admin
			.from('instructor_payout_accounts')
			.select('paystack_recipient_code')
			.eq('user_id', user.id)
			.maybeSingle()
		if (payoutError) throw payoutError
		if (!payoutAccount?.paystack_recipient_code) {
			return json(request, { error: 'Add and verify a payout bank account before requesting a withdrawal.' }, 409)
		}

		const reference = `ta_${crypto.randomUUID().replaceAll('-', '')}`
		const { data: withdrawalId, error: reserveError } = await admin.rpc('reserve_instructor_withdrawal', {
			requested_instructor_id: user.id,
			requested_amount_kobo: body.amount_kobo,
			requested_paystack_reference: reference,
			requested_idempotency_key: body.idempotency_key,
		})
		if (reserveError) {
			const message = reserveError.message.toLowerCase()
			if (message.includes('insufficient available balance')) {
				return json(request, { error: 'Your available balance is too low for this withdrawal.' }, 409)
			}
			if (message.includes('idempotency key was already used')) {
				return json(request, { error: 'A withdrawal retry must use the same amount as the original request.' }, 409)
			}
			console.error('Withdrawal balance reservation failed', reserveError)
			return json(request, { error: 'Your withdrawal could not be reserved. Refresh your balance and try again.' }, 409)
		}
		if (!withdrawalId) {
			throw new Error('Withdrawal reservation returned no request id')
		}

		const { data: withdrawal, error: withdrawalError } = await admin
			.from('withdrawal_requests')
			.select('id, amount_kobo, status, paystack_reference')
			.eq('id', withdrawalId)
			.single()
		if (withdrawalError || !withdrawal) throw withdrawalError ?? new Error('Withdrawal reservation missing')
		if (['paid', 'failed', 'reversed'].includes(withdrawal.status)) {
			return json(request, { withdrawal_id: withdrawal.id, status: withdrawal.status })
		}
		const { error: statusError } = await admin.from('withdrawal_requests')
			.update({ status: 'processing' })
			.eq('id', withdrawal.id)
			.in('status', ['pending', 'processing'])
		if (statusError) {
			console.error('Could not mark withdrawal as processing', statusError)
			return json(request, {
				withdrawal_id: withdrawal.id,
				status: 'processing',
				message: 'Your withdrawal is reserved and awaiting processing. Please check back before submitting again.',
			}, 202)
		}

		const transferResponse = await fetch('https://api.paystack.co/transfer', {
			method: 'POST',
			headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				source: 'balance',
				amount: withdrawal.amount_kobo,
				recipient: payoutAccount.paystack_recipient_code,
				reference: withdrawal.paystack_reference,
				reason: 'Teched Academy instructor course earnings',
			}),
		}).catch((error) => {
			console.error('Paystack transfer request failed', error)
			return null
		})

		if (!transferResponse) {
			return json(request, {
				withdrawal_id: withdrawal.id,
				status: 'processing',
				message: 'Paystack has not confirmed the transfer yet. Please check back before submitting again.',
			}, 202)
		}
		const result = await transferResponse.json().catch(() => null)
		if (!transferResponse.ok || result?.status !== true) {
			console.error('Paystack transfer not confirmed', transferResponse.status, result?.message)
			const verifyResponse = await fetch(`https://api.paystack.co/transfer/verify/${encodeURIComponent(withdrawal.paystack_reference)}`, {
				headers: { Authorization: `Bearer ${secret}` },
			}).catch(() => null)
			const verification = await verifyResponse?.json().catch(() => null)
			const transferStatus = verification?.data?.status
			const verifiedTransfer = verification?.data
			if (verification?.status === true && ['success', 'failed', 'reversed'].includes(transferStatus)
				&& verifiedTransfer?.amount === withdrawal.amount_kobo && verifiedTransfer?.currency === 'NGN') {
				const finalStatus = transferStatus === 'success' ? 'paid' : transferStatus
				const { error: finalizeError } = await admin.rpc('finish_instructor_withdrawal', {
					requested_withdrawal_id: withdrawal.id,
					final_status: finalStatus,
				})
				if (finalizeError) throw finalizeError
				return json(request, { withdrawal_id: withdrawal.id, status: finalStatus })
			}
			return json(request, {
				withdrawal_id: withdrawal.id,
				status: 'processing',
				message: 'Paystack is still confirming the transfer. Please check back before submitting again.',
			}, 202)
		}

		return json(request, {
			withdrawal_id: withdrawal.id,
			status: 'processing',
			message: 'Paystack accepted the transfer request. The final status will update after confirmation.',
		}, 202)
	} catch (error) {
		console.error('Withdrawal request failed', error)
		return json(request, { error: 'Withdrawal request could not be completed' }, 500)
	}
})