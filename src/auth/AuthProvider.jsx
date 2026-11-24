import { useEffect, useRef, useState } from 'react'
import { AuthContext } from './AuthContext.js'
import { supabase } from '../lib/supabase.js'

const idleTimeoutMs = 5 * 60 * 1000
const activityCheckIntervalMs = 15 * 1000
const activityWriteIntervalMs = 10 * 1000

export default function AuthProvider({ children }) {
	const [session, setSession] = useState(null)
	const [role, setRole] = useState(null)
	const [profile, setProfile] = useState(null)
	const [loading, setLoading] = useState(Boolean(supabase))
	const [authConfigured] = useState(Boolean(supabase))
	const currentUserId = useRef(null)

	useEffect(() => {
		if (!supabase) return undefined

		let active = true
		let roleRequest = 0
		const loadRole = async (currentSession) => {
			const requestId = ++roleRequest
			currentUserId.current = currentSession?.user?.id ?? null
			if (!currentSession?.user) {
				if (active) {
					setSession(null)
					setRole(null)
					setProfile(null)
					setLoading(false)
				}
				return
			}
			const { data, error } = await supabase
				.from('profiles')
				.select('role, full_name, account_status')
				.eq('user_id', currentSession.user.id)
				.maybeSingle()
			if (!active || requestId !== roleRequest) return
			setSession(currentSession)
			setRole(error || data?.account_status !== 'active' ? null : data.role)
			setProfile(error ? null : data ?? null)
			setLoading(false)
		}

		supabase.auth.getSession().then(({ data }) => loadRole(data.session))
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
			if (event === 'SIGNED_IN' && nextSession?.user?.id) {
				try {
					window.localStorage.setItem(`teched-academy:last-activity:${nextSession.user.id}`, String(Date.now()))
				} catch (error) {
					console.warn('Could not initialize signed-in session activity', error)
				}
			}
			if (nextSession?.user?.id && nextSession.user.id === currentUserId.current) {
				setSession(nextSession)
				return
			}
			setLoading(true)
			queueMicrotask(() => loadRole(nextSession))
		})

		return () => {
			active = false
			subscription.unsubscribe()
		}
	}, [])

	useEffect(() => {
		const userId = session?.user?.id
		if (!supabase || !userId) return undefined

		const activityKey = `teched-academy:last-activity:${userId}`
		let lastActivity = Date.now()
		let lastStorageWrite = 0
		let signingOut = false

		const recordActivity = () => {
			lastActivity = Date.now()
			if (lastActivity - lastStorageWrite < activityWriteIntervalMs) return
			lastStorageWrite = lastActivity
			try {
				window.localStorage.setItem(activityKey, String(lastActivity))
			} catch (error) {
				console.warn('Could not synchronize session activity across tabs', error)
			}
		}

		try {
			const storedActivity = Number(window.localStorage.getItem(activityKey))
			if (Number.isFinite(storedActivity) && storedActivity > 0) lastActivity = storedActivity
			window.localStorage.setItem(activityKey, String(lastActivity))
			lastStorageWrite = lastActivity
		} catch (error) {
			console.warn('Could not initialize session activity tracking', error)
		}

		const checkInactivity = async () => {
			let mostRecentActivity = lastActivity
			try {
				const storedActivity = Number(window.localStorage.getItem(activityKey))
				if (Number.isFinite(storedActivity) && storedActivity > mostRecentActivity) {
					mostRecentActivity = storedActivity
					lastActivity = storedActivity
				}
			} catch (error) {
				console.warn('Could not read session activity from storage', error)
			}

			if (signingOut || Date.now() - mostRecentActivity < idleTimeoutMs) return
			signingOut = true
			try {
				const { error } = await supabase.auth.signOut({ scope: 'local' })
				if (error) throw error
			} catch (error) {
				console.error('Automatic sign-out after inactivity failed', error)
				signingOut = false
			}
		}

		const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove']
		for (const eventName of activityEvents) {
			window.addEventListener(eventName, recordActivity, { passive: true })
		}
		const intervalId = window.setInterval(() => { void checkInactivity() }, activityCheckIntervalMs)
		document.addEventListener('visibilitychange', checkInactivity)

		return () => {
			for (const eventName of activityEvents) {
				window.removeEventListener(eventName, recordActivity)
			}
			window.clearInterval(intervalId)
			document.removeEventListener('visibilitychange', checkInactivity)
		}
	}, [session?.user?.id])

	const value = {
		session,
		user: session?.user ?? null,
		role,
		profile,
		loading,
		authConfigured,
		supabase,
		signOut: async () => {
			if (!supabase) throw new Error('Auth unavailable')
			const { error } = await supabase.auth.signOut()
			if (error) throw error
		},
	}

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
