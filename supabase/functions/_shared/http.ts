import { createClient } from '@supabase/supabase-js'

const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']

export function corsHeaders(request: Request) {
	const origin = request.headers.get('origin') ?? ''
	const configuredOrigin = Deno.env.get('ACADEMY_APP_ORIGIN')
	const allowed = localOrigins.includes(origin) || origin === configuredOrigin
	return {
		'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		...(allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
	}
}

export function preflight(request: Request) {
	const headers = corsHeaders(request)
	if (!headers['Access-Control-Allow-Origin']) return new Response('Origin not allowed', { status: 403 })
	return new Response('ok', { headers })
}

export function json(request: Request, body: unknown, status = 200) {
	return Response.json(body, { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
}

export function serviceClient() {
	const url = Deno.env.get('SUPABASE_URL')
	const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
	if (!url || !serviceKey) throw new Error('Supabase service configuration missing')
	return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function requireUser(request: Request) {
	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
	const url = Deno.env.get('SUPABASE_URL')
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
	if (!token || !url || !anonKey) return null
	const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
	const { data, error } = await client.auth.getUser(token)
	if (error || !data.user) return null
	return data.user
}

export async function getRole(userId: string) {
	const { data, error } = await serviceClient()
		.from('profiles')
		.select('role')
		.eq('user_id', userId)
		.eq('account_status', 'active')
		.maybeSingle()
	if (error) throw error
	return data?.role ?? null
}

export function isValidUuid(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isAllowedOrigin(request: Request) {
	const origin = request.headers.get('origin')
	return !origin || localOrigins.includes(origin) || origin === Deno.env.get('ACADEMY_APP_ORIGIN')
}