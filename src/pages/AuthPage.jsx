import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import AcademyLogo from '../components/AcademyLogo.jsx'
import '../App.css'

function getAuthErrorMessage(error, registering) {
	const message = String(error?.message ?? '').toLowerCase()
	if (message.includes('invalid login credentials')) return 'Email or password is incorrect. Check your details and try again.'
	if (message.includes('email not confirmed')) return 'Please verify your email address before signing in.'
	if (message.includes('too many requests') || message.includes('rate limit')) return 'There have been too many attempts. Wait a few minutes, then try again.'
	if (message.includes('failed to fetch') || message.includes('network')) return 'Could not reach the sign-in service. Check your internet connection and try again.'
	if (message.includes('user already registered')) return 'An account already exists with this email. Try signing in instead.'
	if (message.includes('password should be') || message.includes('password is')) return 'Your password does not meet the requirements. Use at least 8 characters.'
	if (registering) return 'Your account could not be created. Check your details and try again.'
	return 'Sign-in failed. Check your email and password, confirm your email address, and try again.'
}

export default function AuthPage({ role, mode, onHome }) {
	const { supabase } = useAuth()
	const navigate = useNavigate()
	const isAdmin = role === 'admin'
	const registering = mode === 'register'
	const [submitting, setSubmitting] = useState(false)
	const [message, setMessage] = useState('')
	const [showPassword, setShowPassword] = useState(false)
	const roleLabel = role === 'instructor' ? 'Instructor' : isAdmin ? 'Administrator' : 'Student'
	const title = isAdmin ? 'Admin sign in' : registering ? role === 'instructor' ? 'Apply to teach' : 'Start learning here' : `${roleLabel} sign in`
	const switchMode = registering ? 'login' : 'register'
	const submit = async (event) => {
		event.preventDefault()
		setMessage('')
		if (!supabase) {
			setMessage('We could not complete that request. Please try again later.')
			return
		}

		const form = new FormData(event.currentTarget)
		const email = String(form.get('email') ?? '').trim()
		const password = String(form.get('password') ?? '')
		let authenticated = false
		let failureMessage = ''
		setSubmitting(true)
		try {
			if (registering) {
				const { data, error } = await supabase.auth.signUp({
					email,
					password,
					options: {
						data: { full_name: String(form.get('name') ?? '').trim(), requested_role: role },
						emailRedirectTo: `${window.location.origin}/auth/verify`,
					},
				})
				if (error) throw error
				if (!data.session) {
					setMessage('Check your email to verify your account before signing in.')
					return
				}
				authenticated = true
			} else {
				const { error } = await supabase.auth.signInWithPassword({ email, password })
				if (error) throw error
				authenticated = true
			}

			const { data: userData, error: userError } = await supabase.auth.getUser()
			if (userError || !userData.user) {
				failureMessage = 'You signed in, but we could not confirm your account. Please try again.'
				throw userError ?? new Error('Signed-in user unavailable')
			}
			if (!userData.user.email_confirmed_at) {
				const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
				if (signOutError) throw signOutError
				authenticated = false
				setMessage('Check your email to verify your account before signing in.')
				return
			}
			const { data: profile, error: profileError } = await supabase
				.from('profiles')
				.select('role, account_status')
				.eq('user_id', userData.user.id)
				.maybeSingle()
			if (profileError || !profile) {
				failureMessage = 'You signed in, but your account profile could not be loaded. Please try again or contact support.'
				throw profileError ?? new Error('Profile unavailable')
			}
			if (profile.account_status !== 'active') {
				const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
				if (signOutError) throw signOutError
				authenticated = false
				setMessage('This account has been archived and is no longer active. Contact the academy if you need help.')
				return
			}
			if (role === 'instructor' && profile.role === 'student') {
				const { data: application, error: applicationError } = await supabase
					.from('instructor_applications')
					.select('status')
					.eq('user_id', userData.user.id)
					.maybeSingle()
				if (applicationError) {
					failureMessage = 'You signed in, but your instructor application status could not be loaded. Please try again.'
					throw applicationError
				}
				if (application?.status === 'pending') {
					navigate('/instructor/pending', { replace: true })
					return
				}
				if (application?.status === 'rejected') {
					await supabase.auth.signOut({ scope: 'local' })
					authenticated = false
					setMessage('Your instructor application was not approved. Contact the academy if you believe this is a mistake.')
					return
				}
			}
			if (profile.role !== role) {
				await supabase.auth.signOut({ scope: 'local' })
				authenticated = false
				setMessage(`This account is registered as a ${profile.role}. Sign in using the matching account page.`)
				return
			}
			navigate(role === 'admin' ? '/admin' : role === 'instructor' ? '/instructor' : '/student', { replace: true })
		} catch (error) {
			console.error('Authentication request failed', error)
			if (authenticated) {
				const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
				if (signOutError) console.error('Could not clear the incomplete sign-in session', signOutError)
			}
			setMessage(failureMessage || getAuthErrorMessage(error, registering))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<main className="auth-page">
			<section className="auth-visual"><AcademyLogo className="auth-brand" /><div className="auth-photo" role="img" aria-label="A developer learning with a laptop" /><div className="auth-visual-copy"><p className="public-eyebrow"><span /> YOUR NEXT CHAPTER STARTS HERE</p><h1>Learn a skill.<br />Build a future.</h1><p>Practical web development education, from the first line of code to your next big idea.</p></div></section>
			<section className="auth-panel"><button className="auth-back" onClick={onHome}><ArrowRight size={15} /> Back to home</button><div className="auth-form-wrap"><p className="public-eyebrow public-eyebrow-dark"><span /> {isAdmin ? 'COMPANY ADMINISTRATION' : `TECHED ACADEMY · ${roleLabel.toUpperCase()}`}</p><h2>{title}</h2><p className="auth-subtitle">{isAdmin ? 'Use the administrator credentials issued by your company.' : registering ? role === 'instructor' ? 'Share your experience and apply to teach at Teched Academy.' : 'Create your account and start building practical skills.' : 'Welcome back. Sign in to continue your learning journey.'}</p>
				<form className="auth-form" onSubmit={submit}>
					{registering && <label>Full name<input name="name" required autoComplete="name" placeholder="Your full name" /></label>}
					<label>{isAdmin ? 'Company-issued email' : 'Email address'}<input name="email" type="email" required autoComplete={registering ? 'email' : 'username'} placeholder={isAdmin ? 'admin@youracademy.com' : 'you@example.com'} /></label>
					<label>Password<span className="password-input-wrap"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={registering || !isAdmin ? 8 : undefined} autoComplete={registering ? 'new-password' : 'current-password'} placeholder={registering ? 'At least 8 characters' : 'Enter your password'} /><button className="password-visibility-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
					{isAdmin && <p className="admin-credentials-note"><LockKeyhole size={15} /> Admin accounts are created and issued by the company. Public registration is not available.</p>}
					<button className="button button-dark auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : registering ? role === 'instructor' ? 'Submit instructor application' : 'Create student account' : 'Sign in'} <ArrowRight size={16} /></button>
				</form>
				{message && <p className="auth-form-error" role="alert">{message}</p>}
				{!isAdmin && <div className="auth-alternate">{registering ? 'Already have an account?' : role === 'instructor' ? 'New to teaching here?' : 'New to Teched Academy?'} <a href={`/${role}/${switchMode}`}>{registering ? 'Sign in' : role === 'instructor' ? 'Apply as an instructor' : 'Create an account'}</a></div>}
			</div><div className="auth-panel-footer">© 2026 Teched Academy <span>Privacy · Terms</span></div></section>
		</main>
	)
}