import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, GraduationCap, LockKeyhole, Trash2, Users, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import { Metric } from '../components/AcademyUI.jsx'
import { formatNaira, presentCourse } from '../lib/coursePresentation.js'

const adminTabs = ['Students', 'Instructors', 'Courses', 'Payments', 'Deletion requests']
const adminTabIcons = {
	Students: Users,
	Instructors: GraduationCap,
	Courses: BookOpen,
	Payments: Wallet,
	'Deletion requests': Trash2,
}

export default function AdminConsole() {
	const { supabase } = useAuth()
	const navigate = useNavigate()
	const [activeTab, setActiveTab] = useState('Students')
	const [students, setStudents] = useState([])
	const [instructors, setInstructors] = useState([])
	const [courses, setCourses] = useState([])
	const [orders, setOrders] = useState([])
	const [revenue, setRevenue] = useState([])
	const [deletionRequests, setDeletionRequests] = useState([])
	const [priceMinimum, setPriceMinimum] = useState('')
	const [priceMaximum, setPriceMaximum] = useState('')
	const [notice, setNotice] = useState('')
	const [busy, setBusy] = useState(false)

	const loadAdminData = useCallback(async () => {
		const [profileResult, applicationResult, courseResult, orderResult, revenueResult, deletionResult, pricingResult] = await Promise.all([
			supabase.from('profiles').select('user_id, full_name, role, account_status, created_at').order('created_at', { ascending: false }),
			supabase.from('instructor_applications').select('id, user_id, status, created_at').order('created_at', { ascending: false }),
			supabase.from('courses').select('id, title, category, instructor_id, price_kobo, currency, status, created_at').order('created_at', { ascending: false }),
			supabase.from('payment_orders').select('id, student_id, instructor_id, course_id, amount_kobo, currency, status, provider_reference, created_at').order('created_at', { ascending: false }).limit(100),
			supabase.from('academy_revenue_entries').select('order_id, amount_kobo, currency, created_at').order('created_at', { ascending: false }).limit(100),
			supabase.from('account_deletion_requests').select('id, user_id, status, requested_at').order('requested_at', { ascending: false }),
			supabase.from('course_pricing_policy').select('minimum_price_kobo, maximum_price_kobo').single(),
		])
		const results = [profileResult, applicationResult, courseResult, orderResult, revenueResult, deletionResult, pricingResult]
		if (results.some((result) => result.error)) {
			setNotice('Some admin records could not be loaded. Confirm database setup and admin permissions.')
			return
		}
		const profiles = profileResult.data ?? []
		setStudents(profiles.filter((profile) => profile.role === 'student'))
		setInstructors((applicationResult.data ?? []).map((application) => ({
			...application,
			profile: profiles.find((profile) => profile.user_id === application.user_id),
		})))
		setCourses((courseResult.data ?? []).map(presentCourse))
		setOrders(orderResult.data ?? [])
		setRevenue(revenueResult.data ?? [])
		setDeletionRequests((deletionResult.data ?? []).map((request) => ({
			...request,
			profile: profiles.find((profile) => profile.user_id === request.user_id),
		})))
		setPriceMinimum(String((pricingResult.data?.minimum_price_kobo ?? 0) / 100))
		setPriceMaximum(pricingResult.data?.maximum_price_kobo == null ? '' : String(pricingResult.data.maximum_price_kobo / 100))
	}, [supabase])

	useEffect(() => {
		let active = true
		async function load() {
			await loadAdminData()
			if (!active) return
		}
		void load()
		return () => { active = false }
	}, [loadAdminData])

	async function review(type, targetId, approve) {
		setBusy(true)
		setNotice('')
		try {
			const { error } = await supabase.functions.invoke('admin-review', {
				body: {
					type,
					...(type === 'instructor' ? { user_id: targetId } : { course_id: targetId }),
					approve,
				},
			})
			if (error) {
				console.error('Admin review request failed', error)
				setNotice(await getFunctionErrorMessage(error))
				return
			}
			setNotice(`${type === 'instructor' ? 'Instructor application' : 'Course'} review saved.`)
			await loadAdminData()
		} catch (error) {
			console.error('Admin review request failed', error)
			setNotice('Could not complete the review. Check your connection and try again.')
		} finally {
			setBusy(false)
		}
	}

	async function runAdminAction(body, successMessage) {
		setBusy(true)
		setNotice('')
		try {
			const { data, error } = await supabase.functions.invoke('admin-review', { body })
			if (error) throw error
			setNotice(data?.warning || successMessage)
			await loadAdminData()
		} catch (error) {
			console.error('Admin action failed', error)
			setNotice(await getFunctionErrorMessage(error))
		} finally {
			setBusy(false)
		}
	}

	function deleteAccount(profile) {
		if (!window.confirm(`Permanently delete ${profile.full_name || 'this account'}? The database will block deletion if financial or other protected records depend on it.`)) return
		void runAdminAction({ type: 'delete_account', user_id: profile.user_id }, 'Account deleted.')
	}

	function reviewDeletionRequest(request, approve) {
		if (approve && !window.confirm('Approve this request and permanently delete the account? Deletion will be blocked if financial or other protected records depend on it.')) return
		void runAdminAction({
			type: 'account_deletion',
			request_id: request.id,
			approve,
		}, approve ? 'Account deleted.' : 'Account deletion request rejected.')
	}

	function deleteCourse(course) {
		if (!window.confirm(`Permanently delete "${course.title}"? The database will block deletion if payment or enrollment records depend on it.`)) return
		void runAdminAction({ type: 'delete_course', course_id: course.id }, 'Course deleted.')
	}

	async function savePricingPolicy(event) {
		event.preventDefault()
		const minimumKobo = Math.round(Number(priceMinimum) * 100)
		const maximumKobo = Math.round(Number(priceMaximum) * 100)
		if (!Number.isSafeInteger(minimumKobo) || !Number.isSafeInteger(maximumKobo) || minimumKobo < 100 || maximumKobo < minimumKobo) {
			setNotice('Enter a valid NGN minimum and maximum price.')
			return
		}
		setBusy(true)
		const { error } = await supabase.rpc('set_course_pricing_policy', { minimum_kobo: minimumKobo, maximum_kobo: maximumKobo })
		setBusy(false)
		if (error) {
			setNotice('Pricing policy could not be saved.')
			return
		}
		setNotice('Instructor course price range updated.')
		await loadAdminData()
	}

	const totalRevenueKobo = revenue.reduce((total, entry) => total + entry.amount_kobo, 0)

	return <main className="workspace-page admin-dashboard">
		<section className="page-title-row"><div className="workspace-heading"><button className="icon-button workspace-back" type="button" aria-label="Go back" title="Go back" onClick={() => {
			if (window.history.state?.idx > 0) navigate(-1)
			else navigate('/', { replace: true })
		}}><ArrowLeft size={18} /></button><div><p className="eyebrow">PLATFORM OPERATIONS</p><h1>Admin console<span className="heading-period">.</span></h1><p className="subheading">Manage academy records and financial operations.</p></div></div></section>
		{notice && <p className="notice-banner" role="status">{notice}</p>}
		<section className="admin-metrics"><Metric label="Students" value={String(students.filter((profile) => profile.account_status === 'active').length)} detail="Active accounts" icon={Users} /><Metric label="Instructors" value={String(instructors.filter((item) => item.status === 'approved' && item.profile?.account_status === 'active').length)} detail="Approved instructors" icon={GraduationCap} /><Metric label="Courses" value={String(courses.filter((course) => course.status === 'published').length)} detail="Published courses" icon={BookOpen} /><Metric label="Academy share" value={formatNaira(totalRevenueKobo)} detail="20% of verified gross sales" icon={Wallet} /></section>
		<section className="section-block admin-section">
			<div className="section-heading"><div><p className="eyebrow">ACADEMY MANAGEMENT</p><h2>Review and manage</h2></div></div>
			<div className="admin-tabs" role="tablist" aria-label="Admin records">{adminTabs.map((tab) => <button role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'admin-tab-active' : ''} onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}</div>
			{activeTab === 'Students' && <div className="admin-table"><div className="table-header student-table-header"><span>STUDENT</span><span>USER ID</span><span>STATUS</span><span>ACTIONS</span></div>{students.map((profile) => <div className="table-row student-table-row" key={profile.user_id}><span className="table-course"><strong>{profile.full_name || 'Student'}</strong></span><span>{profile.user_id}</span><span className={`status-badge ${profile.account_status === 'active' ? 'status-live' : 'status-pending'}`}><i />{profile.account_status}</span><span className="review-actions"><button className="delete-button" onClick={() => deleteAccount(profile)} disabled={busy}><Trash2 size={13} /> Delete</button></span></div>)}</div>}
			{activeTab === 'Instructors' && <div className="admin-table"><div className="table-header instructor-table-header"><span>INSTRUCTOR</span><span>APPLICATION</span><span>STATUS</span><span /></div>{instructors.map((application) => <div className="table-row instructor-table-row" key={application.id}><span className="table-course"><strong>{application.profile?.full_name || application.user_id}</strong></span><span>{new Date(application.created_at).toLocaleDateString('en-NG')}</span><span className={`status-badge ${application.profile?.account_status === 'archived' ? 'status-pending' : application.status === 'approved' ? 'status-live' : 'status-pending'}`}><i />{application.profile?.account_status === 'archived' ? 'archived' : application.status}</span><span className="review-actions">{application.status === 'pending' && application.profile?.account_status === 'active' && <><button className="approve-button" onClick={() => review('instructor', application.user_id, true)} disabled={busy}>Approve</button><button className="delete-button" onClick={() => review('instructor', application.user_id, false)} disabled={busy}>Reject</button></>}{application.profile && <button className="delete-button" onClick={() => deleteAccount({ ...application.profile, user_id: application.user_id })} disabled={busy}><Trash2 size={13} /> Delete</button>}</span></div>)}</div>}
			{activeTab === 'Courses' && <><form className="course-draft-form pricing-policy-form" onSubmit={savePricingPolicy}><label>Minimum price (NGN)<input type="number" min="1" step="0.01" required value={priceMinimum} onChange={(event) => setPriceMinimum(event.target.value)} /></label><label>Maximum price (NGN)<input type="number" min="1" step="0.01" required value={priceMaximum} onChange={(event) => setPriceMaximum(event.target.value)} /></label><button className="button button-dark" type="submit" disabled={busy}>Save pricing policy</button></form><div className="admin-table admin-course-table"><div className="table-header course-table-header"><span>COURSE</span><span>INSTRUCTOR</span><span>PRICE</span><span>STATUS</span><span>ACTIONS</span></div>{courses.map((course) => <div className="table-row course-table-row" key={course.id}><span className="table-course"><strong>{course.title}</strong></span><span>{course.instructor_id}</span><span>{formatNaira(course.price_kobo)}</span><span className={`status-badge ${course.status === 'published' ? 'status-live' : 'status-pending'}`}><i />{course.status}</span><span className="review-actions">{course.status === 'pending_review' && <><button className="approve-button" onClick={() => review('course', course.id, true)} disabled={busy}>Publish</button><button className="delete-button" onClick={() => review('course', course.id, false)} disabled={busy}>Reject</button></>}<button className="delete-button" onClick={() => deleteCourse(course)} disabled={busy}><Trash2 size={13} /> Delete</button></span></div>)}</div></>}
			{activeTab === 'Payments' && <><div className="admin-table"><div className="table-header payment-table-header"><span>REFERENCE</span><span>AMOUNT</span><span>STATUS</span><span>DATE</span></div>{orders.map((order) => <div className="table-row payment-table-row" key={order.id}><span>{order.provider_reference}</span><span>{formatNaira(order.amount_kobo)}</span><span>{order.status}</span><span>{new Date(order.created_at).toLocaleDateString('en-NG')}</span></div>)}</div><div className="admin-security-note"><LockKeyhole size={17} /><span>Displayed amounts are reconciled from server-verified payment records. Paystack fees are deducted from the academy’s 20% share.</span></div></>}
			{activeTab === 'Deletion requests' && <div className="admin-table"><div className="table-header deletion-table-header"><span>ACCOUNT</span><span>REQUESTED</span><span>STATUS</span><span>ACTIONS</span></div>{deletionRequests.map((request) => <div className="table-row deletion-table-row" key={request.id}><span className="table-course"><strong title={request.user_id}>{request.profile?.full_name || request.user_id}</strong></span><span>{new Date(request.requested_at).toLocaleDateString('en-NG')}</span><span className={`status-badge ${request.status === 'pending' ? 'status-pending' : 'status-live'}`}><i />{request.status}</span>{request.status === 'pending' ? <span className="review-actions"><button className="approve-button" onClick={() => reviewDeletionRequest(request, true)} disabled={busy}>Approve</button><button className="delete-button" onClick={() => reviewDeletionRequest(request, false)} disabled={busy}>Reject</button></span> : <span />}</div>)}</div>}
		</section>
		<div className="admin-security-note"><LockKeyhole size={17} /><span>Admin operations require a server-verified admin role. Keep changes auditable and never process payouts from browser-only state.</span></div>
		<nav className="workspace-bottom-nav" aria-label="Admin navigation">
			{adminTabs.map((tab) => {
				const Icon = adminTabIcons[tab]
				return <button type="button" key={tab} aria-label={tab} title={tab} aria-pressed={activeTab === tab} className={activeTab === tab ? 'workspace-bottom-nav-active' : ''} onClick={() => setActiveTab(tab)}><Icon size={20} /></button>
			})}
		</nav>
	</main>
}

async function getFunctionErrorMessage(error) {
	const response = error?.context
	if (response && typeof response.clone === 'function') {
		const body = await response.clone().json().catch(() => null)
		if (typeof body?.error === 'string') return body.error
	}
	return error?.message || 'Admin action failed. Please retry.'
}
