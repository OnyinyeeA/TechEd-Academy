import { useNavigate } from 'react-router-dom'
import AuthPage from '../pages/AuthPage.jsx'

export default function AuthRoute({ role, mode }) {
	const navigate = useNavigate()
	return <AuthPage role={role} mode={mode} onHome={() => navigate('/')} />
}