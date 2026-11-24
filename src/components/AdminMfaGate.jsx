import { useEffect, useState } from 'react'
import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.js'

export default function AdminMfaGate({ children }) {
	const { supabase } = useAuth()
	const [stage, setStage] = useState('loading')
	const [factorId, setFactorId] = useState('')
	const [challengeId, setChallengeId] = useState('')
	const [qrCode, setQrCode] = useState('')
	const [secret, setSecret] = useState('')
	const [code, setCode] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')

	useEffect(() => {
		let active = true
		async function loadMfaState() {
			try {
				const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
					supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
					supabase.auth.mfa.listFactors(),
				])
				if (!active) return
				if (assuranceError || factorsError) throw assuranceError ?? factorsError
				if (assurance.currentLevel === 'aal2') {
					setStage('ready')
					return
				}

				const verifiedFactor = factors.totp.find((factor) => factor.status === 'verified')
				if (verifiedFactor) {
					const { data, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id })
					if (!active) return
					if (challengeError) throw challengeError
					setFactorId(verifiedFactor.id)
					setChallengeId(data.id)
					setStage('challenge')
					return
				}

				setStage(factors.totp.length ? 'restart-setup' : 'setup')
			} catch (loadError) {
				if (!active) return
				console.error('Admin MFA status check failed', loadError)
				setError('Admin security settings could not be loaded. Please refresh and try again.')
				setStage('error')
			}
		}
		void loadMfaState()
		return () => { active = false }
	}, [supabase])

	async function startSetup() {
		setBusy(true)
		setError('')
		try {
			const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
			if (listError) throw listError
			for (const factor of factors.totp.filter((item) => item.status !== 'verified')) {
				const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
				if (removeError) throw removeError
			}

			const { data, error: enrollError } = await supabase.auth.mfa.enroll({
				factorType: 'totp',
				friendlyName: `TechEd Academy admin ${Date.now()}`,
			})
			if (enrollError) throw enrollError
			const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id })
			if (challengeError) throw challengeError
			setFactorId(data.id)
			setChallengeId(challenge.id)
			setQrCode(data.totp.qr_code)
			setSecret(data.totp.secret)
			setCode('')
			setStage('verify-setup')
		} catch (setupError) {
			console.error('Admin MFA setup failed', setupError)
			setError(setupError instanceof Error ? setupError.message : 'Authenticator setup could not be started.')
		} finally {
			setBusy(false)
		}
	}

	async function verifyCode(event) {
		event.preventDefault()
		if (!factorId || !challengeId || !/^\d{6}$/.test(code)) {
			setError('Enter the six-digit code from your authenticator app.')
			return
		}
		setBusy(true)
		setError('')
		try {
			const { error: verifyError } = await supabase.auth.mfa.verify({
				factorId,
				challengeId,
				code,
			})
			if (verifyError) throw verifyError
			const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
			if (assuranceError) throw assuranceError
			if (assurance.currentLevel !== 'aal2') throw new Error('Multi-factor verification did not complete. Please try again.')
			setQrCode('')
			setSecret('')
			setStage('ready')
		} catch (verificationError) {
			console.error('Admin MFA verification failed', verificationError)
			setError(verificationError instanceof Error ? verificationError.message : 'The code could not be verified.')
			const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
			if (challengeError) {
				setStage('error')
			} else {
				setChallengeId(challenge.id)
				setCode('')
			}
		} finally {
			setBusy(false)
		}
	}

	if (stage === 'ready') return children

	return <main className="admin-mfa-page">
		<section className="admin-mfa-card">
			<span className="admin-mfa-icon"><ShieldCheck size={23} /></span>
			<p className="eyebrow">ADMIN ACCOUNT SECURITY</p>
			<h1>Verify it’s you<span className="heading-period">.</span></h1>
			<p className="admin-mfa-copy">Administrator access requires a time-based code from an authenticator app.</p>
			{stage === 'loading' && <p role="status">Checking your security setup…</p>}
			{stage === 'error' && <p className="auth-form-error" role="alert">{error}</p>}
			{stage === 'setup' && <>
				<p className="admin-mfa-copy">Set up an authenticator app such as 1Password, Google Authenticator, or Microsoft Authenticator.</p>
				{error && <p className="auth-form-error" role="alert">{error}</p>}
				<button className="button button-dark" onClick={startSetup} disabled={busy}>{busy ? 'Preparing setup…' : error ? 'Try again' : 'Set up authenticator'} <LockKeyhole size={16} /></button>
			</>}
			{stage === 'restart-setup' && <>
				<p className="admin-mfa-copy">An unfinished authenticator setup was found. Start setup again to replace it.</p>
				{error && <p className="auth-form-error" role="alert">{error}</p>}
				<button className="button button-dark" onClick={startSetup} disabled={busy}>{busy ? 'Preparing setup…' : error ? 'Try again' : 'Restart setup'} <LockKeyhole size={16} /></button>
			</>}
			{stage === 'verify-setup' && <>
				<p className="admin-mfa-copy">Scan this code in your authenticator app, then enter its six-digit code to finish setup.</p>
				<img className="admin-mfa-qr" src={qrCode} alt="Authenticator setup QR code" />
				<details className="admin-mfa-secret"><summary>Can’t scan the QR code?</summary><code>{secret}</code></details>
				<form className="admin-mfa-form" onSubmit={verifyCode}>
					<label htmlFor="admin-mfa-code">Authenticator code</label>
					<input id="admin-mfa-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
					{error && <p className="auth-form-error" role="alert">{error}</p>}
					<button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and open admin'}</button>
				</form>
			</>}
			{stage === 'challenge' && <>
				<p className="admin-mfa-copy">Enter the current six-digit code from your authenticator app.</p>
				<form className="admin-mfa-form" onSubmit={verifyCode}>
					<label htmlFor="admin-mfa-code">Authenticator code</label>
					<input id="admin-mfa-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
					{error && <p className="auth-form-error" role="alert">{error}</p>}
					<button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and open admin'}</button>
				</form>
			</>}
			{error && stage === 'error' && <button className="button button-outline" onClick={() => window.location.reload()}>Refresh security setup</button>}
		</section>
	</main>
}
