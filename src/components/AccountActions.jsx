import { useState } from 'react'
import { LogOut, ShieldAlert, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'

export default function AccountActions({ role }) {
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)
	const navigate = useNavigate()
	const { signOut, supabase } = useAuth()

	const logout = async () => {
		setBusy(true)
		try {
			await signOut()
			navigate('/', { replace: true })
		} catch {
			setMessage('Unable to sign out right now. Please retry.')
		} finally {
			setBusy(false)
		}
	}

	const requestDeletion = async () => {
		if (!window.confirm('Request permanent account deletion? The academy may be unable to approve it if financial or other protected records depend on your account.')) return
		setBusy(true)
		try {
			const { data, error } = await supabase.functions.invoke('delete-account')
			if (error) throw error
			setMessage(data?.message ?? 'Your account deletion request was submitted.')
		} catch {
			setMessage('Unable to submit the request right now. Please retry.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<section className="account-actions" aria-labelledby="account-actions-title">
			<div className="account-actions-copy"><p className="eyebrow">ACCOUNT</p><h2 id="account-actions-title">Manage your {role} account</h2><p>Permanent deletion requests are reviewed by the academy. Financial and legal records may prevent deletion.</p></div>
			<div className="account-action-buttons"><button className="button button-outline" onClick={logout} disabled={busy}><LogOut size={16} /> Log out</button><button className="button button-danger" onClick={requestDeletion} disabled={busy}><Trash2 size={16} /> Request account deletion</button></div>
			{message && <p className="account-action-message" role="status"><ShieldAlert size={15} />{message}</p>}
		</section>
	)
}