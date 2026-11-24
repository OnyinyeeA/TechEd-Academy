import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import AcademyLogo from '../components/AcademyLogo.jsx'
import '../App.css'

export default function EmailVerificationPage() {
	const { loading, supabase, user } = useAuth()
	const userId = user?.id
	const [verification, setVerification] = useState('checking')
	const linkError = new URLSearchParams(window.location.search).has('error')

	useEffect(() => {
		if (loading) return undefined

		let active = true
		const verifyEmail = async () => {
			if (!supabase || !userId) {
				setVerification('failed')
				return
			}

			const { data, error } = await supabase.auth.getUser()
			if (!active) return
			if (error) {
				console.error('Email verification status could not be confirmed', error)
				setVerification('failed')
				return
			}
			setVerification(data.user?.email_confirmed_at ? 'verified' : 'pending')
		}

		void verifyEmail()
		return () => { active = false }
	}, [loading, supabase, userId])

	const accountRole = user?.user_metadata?.requested_role === 'instructor' ? 'instructor' : 'student'
	const verified = verification === 'verified'
	const pending = verification === 'pending'
	const checking = loading || verification === 'checking'

	return (
		<main className="auth-page">
			<section className="auth-visual">
				<AcademyLogo className="auth-brand" />
				<div className="auth-photo" role="img" aria-label="A developer learning with a laptop" />
				<div className="auth-visual-copy"><p className="public-eyebrow"><span /> YOUR NEXT CHAPTER STARTS HERE</p><h1>Learn a skill.<br />Build a future.</h1><p>Practical web development education, from the first line of code to your next big idea.</p></div>
			</section>
			<section className="auth-panel">
				<Link className="auth-back" to="/"><ArrowRight size={15} /> Back to home</Link>
				<div className="auth-form-wrap">
					<p className="public-eyebrow public-eyebrow-dark"><span /> TECHED ACADEMY · EMAIL VERIFICATION</p>
					{checking ? <>
						<h2>Verifying your email…</h2>
						<p className="auth-subtitle" role="status">Please wait while we confirm your email address with Supabase.</p>
					</> : verified ? <>
						<CheckCircle2 size={34} aria-hidden="true" style={{ color: '#426a4a', marginBottom: 12 }} />
						<h2>Email verified successfully</h2>
						<p className="auth-subtitle">We confirmed that <strong>{user.email}</strong> belongs to you. You can now sign in to your account.</p>
						<Link className="button button-dark auth-submit" to={`/${accountRole}/login`}>Continue to sign in <ArrowRight size={16} /></Link>
					</> : <>
						<h2>{linkError ? 'Verification link not valid' : pending ? 'Check your email' : 'Email not verified'}</h2>
						<p className="auth-subtitle" role={pending ? 'status' : 'alert'}>{linkError
							? 'This verification link is invalid or has expired. Open the latest link from your inbox, then try again.'
							: pending
								? `We sent a verification link to ${user.email}. Open it before signing in.`
							: 'We could not confirm your email address. Open the verification link from your inbox to prove that you own this email address.'}</p>
						{!pending && <Link className="button button-dark auth-submit" to={`/${accountRole}/login`}>Go to sign in <ArrowRight size={16} /></Link>}
					</>}
				</div>
				<div className="auth-panel-footer">© 2026 Teched Academy <span>Privacy · Terms</span></div>
			</section>
		</main>
	)
}
