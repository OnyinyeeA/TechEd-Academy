import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, ChevronRight, Compass, LayoutDashboard, LockKeyhole, Search } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import AcademyLogo from '../components/AcademyLogo.jsx'
import { presentCourse } from '../lib/coursePresentation.js'

export default function StudentWorkspace() {
	const { user, supabase } = useAuth()
	const [courses, setCourses] = useState([])
	const [enrolledCourses, setEnrolledCourses] = useState([])
	const [search, setSearch] = useState('')
	const [category, setCategory] = useState('All courses')
	const [notice, setNotice] = useState('')
	const [selectedCourse, setSelectedCourse] = useState(null)
	const [checkoutBusy, setCheckoutBusy] = useState(false)
	const location = useLocation()
	const navigate = useNavigate()

	useEffect(() => {
		let active = true

		async function loadCourses() {
			const { data, error } = await supabase
				.from('courses')
				.select('id, title, category, price_kobo, currency, status, instructor_id')
				.eq('status', 'published')
				.order('created_at', { ascending: false })
			if (!active) return
			if (error) {
				setNotice('Courses are temporarily unavailable. Please retry.')
				return
			}
			setCourses((data ?? []).map(presentCourse))
		}

		async function loadEnrollments() {
			const { data: enrollments, error } = await supabase
				.from('enrollments')
				.select('course_id, progress')
				.eq('student_id', user.id)
				.eq('status', 'active')
			if (!active) return
			if (error || !enrollments?.length) {
				if (error) setNotice('Your learning data is temporarily unavailable. Please retry.')
				setEnrolledCourses([])
				return
			}

			const courseIds = enrollments.map((enrollment) => enrollment.course_id)
			const { data: rows, error: courseError } = await supabase
				.from('courses')
				.select('id, title, category, price_kobo, currency, status, instructor_id')
				.in('id', courseIds)
			if (!active) return
			if (courseError) {
				setNotice('Your course access is temporarily unavailable. Please retry.')
				return
			}

			const courseById = new Map((rows ?? []).map((course) => [course.id, presentCourse(course)]))
			setEnrolledCourses(enrollments.flatMap((enrollment) => {
				const course = courseById.get(enrollment.course_id)
				return course ? [{ course, progress: enrollment.progress, nextLesson: 'Continue your next lesson' }] : []
			}))
		}

		void loadCourses()
		void loadEnrollments()
		return () => { active = false }
	}, [supabase, user.id])

	const visibleCourses = useMemo(() => courses.filter((course) => {
		const searchText = `${course.title} ${course.category} ${course.instructor}`.toLowerCase()
		return searchText.includes(search.toLowerCase()) && (category === 'All courses' || course.category === category)
	}), [category, courses, search])
	const enrolledIds = new Set(enrolledCourses.map((item) => item.course.id))
	const recommendations = courses.filter((course) => !enrolledIds.has(course.id)).slice(0, 3)
	const activePath = location.pathname === '/student' ? 'dashboard' : location.pathname.split('/')[2]

	const setView = (view) => navigate(view === 'dashboard' ? '/student' : `/student/${view === 'explore' ? 'catalog' : view}`)

	async function beginCheckout() {
		if (!selectedCourse || checkoutBusy) return
		setCheckoutBusy(true)
		setNotice('')
		const controller = new AbortController()
		const timeoutId = window.setTimeout(() => controller.abort(), 30000)
		try {
			const { data, error } = await supabase.functions.invoke('create-checkout', {
				body: { course_id: selectedCourse.id },
				signal: controller.signal,
			})
			if (error) {
				if (error.context instanceof Response) {
					const responseText = await error.context.clone().text().catch(() => '')
					let responseBody = null
					try {
						responseBody = JSON.parse(responseText)
					} catch {
						responseBody = null
					}
					if (typeof responseBody?.error === 'string') throw new Error(responseBody.error)
					if (responseText.trim()) throw new Error(responseText.trim())
				}
				throw error
			}
			if (typeof data?.authorization_url !== 'string') {
				throw new Error('Checkout service did not return a payment link.')
			}
			const checkout = new URL(data.authorization_url)
			if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paystack.com') {
				throw new Error('Unexpected checkout destination')
			}
			window.location.assign(checkout.href)
		} catch (error) {
			console.error('Checkout could not be started', error)
			setNotice(controller.signal.aborted
				? 'Checkout is taking too long to respond. Please retry shortly; if it continues, contact support.'
				: error instanceof Error ? error.message : 'Checkout is temporarily unavailable. Please retry.')
			setCheckoutBusy(false)
		} finally {
			window.clearTimeout(timeoutId)
		}
	}

	return (
		<div className="app-shell">
			<aside className="sidebar">
				<AcademyLogo />
				<div className="sidebar-label">LEARN</div>
				<nav className="side-nav" aria-label="Student navigation">
					<Link className={`nav-link ${activePath === 'dashboard' ? 'nav-link-active' : ''}`} to="/student" aria-label="Overview" title="Overview" aria-current={activePath === 'dashboard' ? 'page' : undefined}><LayoutDashboard size={19} /><span>Overview</span></Link>
					<Link className={`nav-link ${activePath === 'catalog' ? 'nav-link-active' : ''}`} to="/student/catalog" aria-label="Explore courses" title="Explore courses" aria-current={activePath === 'catalog' ? 'page' : undefined}><Compass size={19} /><span>Explore courses</span></Link>
					<Link className={`nav-link ${activePath === 'learning' ? 'nav-link-active' : ''}`} to="/student/learning" aria-label={`My learning, ${enrolledCourses.length} courses`} title="My learning" aria-current={activePath === 'learning' ? 'page' : undefined}><BookOpen size={19} /><span>My learning</span><span className="nav-count">{enrolledCourses.length}</span></Link>
				</nav>
				<div className="sidebar-label workspace-label">WORKSPACE</div>
				<div className="workspace-locked"><LockKeyhole size={16} /><span>Instructor and admin access requires separate verified accounts.</span></div>
			</aside>

			<main className="main-area">
				<header className="topbar">
					<button className="icon-button topbar-back" type="button" aria-label="Go back" title="Go back" onClick={() => {
						if (window.history.state?.idx > 0) navigate(-1)
						else navigate('/student', { replace: true })
					}}><ArrowLeft size={18} /></button>
					<div className="crumb"><span>STUDENT</span><ChevronRight size={14} /><strong>{activePath === 'catalog' ? 'COURSE CATALOG' : activePath === 'learning' ? 'MY LEARNING' : 'OVERVIEW'}</strong></div>
					<div className="topbar-actions">
						<label className="global-search"><Search size={17} /><input aria-label="Search courses" placeholder="Search courses" value={search} onChange={(event) => { setSearch(event.target.value); if (event.target.value) navigate('/student/catalog') }} /></label>
					</div>
				</header>
				<div className="page-content">
					{notice && <div className="notice-banner" role="status">{notice}</div>}
					<Outlet context={{ courses, visibleCourses, enrolled: enrolledCourses.map((item) => ({ courseId: item.course.id })), enrolledCourses, recommendations, category, setCategory, setSearch, setView, openCourse: setSelectedCourse, setNotice }} />
					<footer className="page-footer"><span>© 2026 Teched Academy</span><span><LockKeyhole size={13} /> Secure checkout · NGN</span></footer>
				</div>
			</main>

			{selectedCourse && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCourse(null) }}>
				<section className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="student-course-title">
					<button className="modal-close" onClick={() => setSelectedCourse(null)} aria-label="Close course preview">×</button>
					<p className="eyebrow">{selectedCourse.category} · {selectedCourse.level}</p>
					<h2 id="student-course-title">{selectedCourse.title}</h2>
					<p className="modal-description">Course materials unlock after Paystack confirms your payment.</p>
					<div className="demo-modal-note"><LockKeyhole size={16} /><span>Payment will open securely on Paystack. Your account is enrolled only after server verification.</span></div>
					<button className="button button-dark modal-primary" onClick={beginCheckout} disabled={checkoutBusy}>
						{checkoutBusy ? 'Opening secure checkout…' : `Continue to checkout · ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(selectedCourse.price)}`}
						<ChevronRight size={16} />
					</button>
				</section>
			</div>}
		</div>
	)
}
