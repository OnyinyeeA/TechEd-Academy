import { AccessDeniedView } from '../components/AcademyUI.jsx'
import AdminMfaGate from '../components/AdminMfaGate.jsx'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'

export default function ProtectedRoute({ role, children }) {
	const { user, role: userRole, profile, loading, authConfigured } = useAuth()
	if (loading) return <div className="access-checking" role="status">Checking your account…</div>
	if (!authConfigured) return <AccessDeniedView role="account setup" />
	if (!user) return <Navigate to={`/${role}/login`} replace />
	if (!user.email_confirmed_at) return <Navigate to="/auth/verify" replace />
	if (profile?.account_status === 'archived') return <AccessDeniedView role="archived account" />
	if (!userRole) return <Navigate to="/" replace />
	if (userRole !== role) {
		return <Navigate to={userRole === 'instructor' ? '/instructor/pending' : `/${userRole}`} replace />
	}

	return role === 'admin' ? <AdminMfaGate>{children}</AdminMfaGate> : children
}