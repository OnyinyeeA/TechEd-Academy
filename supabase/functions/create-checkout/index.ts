import { createClient } from '@supabase/supabase-js'
import { corsHeaders, getRole, isAllowedOrigin, isValidUuid, json, preflight, requireUser, serviceClient } from '../_shared/http.ts'

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return preflight(request)
	if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
	if (!isAllowedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403)

	try {
		const user = await requireUser(request)
		if (!user?.email) return json(request, { error: 'Sign in required' }, 401)
		if (await getRole(user.id) !== 'student') return json(request, { error: 'Student account required' }, 403)

		const body = await request.json().catch(() => null)
		if (!isValidUuid(body?.course_id)) return json(request, { error: 'Invalid course' }, 400)

		const supabaseUrl = Deno.env.get('SUPABASE_URL')
		const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
		const authHeader = request.headers.get('authorization')
		if (!supabaseUrl || !anonKey || !authHeader) return json(request, { error: 'Supabase configuration missing' }, 500)
		const userClient = createClient(supabaseUrl, anonKey, {
			global: { headers: { Authorization: authHeader } },
			auth: { persistSession: false, autoRefreshToken: false },
		})
		const { data: course, error: courseError } = await userClient
			.from('courses')
			.select('id, instructor_id, price_kobo, currency, status')
			.eq('id', body.course_id)
			.eq('status', 'published')
			.single()
		if (courseError || !course) return json(request, { error: 'Course is unavailable' }, 404)

		const { data: existingEnrollment } = await userClient
			.from('enrollments')
			.select('id')
			.eq('student_id', user.id)
			.eq('course_id', course.id)
			.eq('status', 'active')
			.maybeSingle()
		if (existingEnrollment) return json(request, { error: 'Already enrolled' }, 409)

		const admin = serviceClient()
		const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
		const appUrl = Deno.env.get('ACADEMY_APP_ORIGIN')
		if (!secret || !appUrl) return json(request, { error: 'Payment configuration unavailable' }, 503)

		const { data: pendingOrder, error: pendingLookupError } = await admin
			.from('payment_orders')
			.select('id, provider_reference, checkout_url, amount_kobo, currency')
			.eq('student_id', user.id)
			.eq('course_id', course.id)
			.eq('status', 'pending')
			.maybeSingle()
		if (pendingLookupError) throw pendingLookupError
		if (pendingOrder?.checkout_url && pendingOrder.amount_kobo === course.price_kobo && pendingOrder.currency === 'NGN') {
			return json(request, { order_id: pendingOrder.id, authorization_url: pendingOrder.checkout_url })
		}

		let order = pendingOrder
		if (!order) {
			const { data, error } = await admin
				.from('payment_orders')
				.insert({
					student_id: user.id,
					instructor_id: course.instructor_id,
					course_id: course.id,
					amount_kobo: course.price_kobo,
					currency: 'NGN',
					provider_reference: `ta_${crypto.randomUUID().replaceAll('-', '')}`,
				})
				.select('id, provider_reference, checkout_url, amount_kobo, currency')
				.single()
			if (error || !data) {
				console.error('Could not create payment order', error)
				return json(request, { error: 'A checkout may already be in progress. Retry shortly.' }, 409)
			}
			order = data
		}
		if (order.amount_kobo !== course.price_kobo || order.currency !== 'NGN') {
			return json(request, { error: 'Course price changed. Please start checkout again.' }, 409)
		}

		let response: Response
		try {
			response = await fetch('https://api.paystack.co/transaction/initialize', {
				method: 'POST',
				signal: AbortSignal.timeout(15000),
				headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: user.email,
					amount: String(order.amount_kobo),
					currency: 'NGN',
					reference: order.provider_reference,
					callback_url: `${appUrl}/student/payment-result`,
					metadata: { order_id: order.id, course_id: course.id },
				}),
			})
		} catch (error) {
			console.error('Paystack initialization transport error', error)
			await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending')
			return json(request, {
				error: error instanceof DOMException && error.name === 'TimeoutError'
					? 'Paystack did not respond in time. Please retry shortly.'
					: 'Checkout could not be confirmed. Please retry shortly.',
			}, 502)
		}

		const result = await response.json().catch(() => null)
		if (!response.ok || result?.status !== true || !result?.data?.authorization_url) {
			console.error('Paystack initialization failed', response.status, result?.message)
			await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending')
			return json(request, { error: 'Checkout could not be started' }, 502)
		}
		const checkoutUrl = new URL(result.data.authorization_url)
		if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paystack.com') {
			await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending')
			return json(request, { error: 'Checkout destination was invalid' }, 502)
		}
		const { error: saveUrlError } = await admin
			.from('payment_orders')
			.update({ checkout_url: checkoutUrl.href })
			.eq('id', order.id)
			.eq('status', 'pending')
		if (saveUrlError) {
			console.error('Could not save checkout URL', saveUrlError)
			await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending')
			return json(request, { error: 'Checkout could not be started' }, 500)
		}

		return json(request, { order_id: order.id, authorization_url: checkoutUrl.href })
	} catch (error) {
		console.error('Checkout handler failed', error)
		return json(request, { error: 'Checkout could not be started' }, 500)
	}
})