import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpen, CircleHelp, LayoutDashboard, Plus, ShieldCheck, Users, Wallet } from 'lucide-react'
import { Upload } from 'tus-js-client'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import { EmptyState, Metric } from '../components/AcademyUI.jsx'
import AccountActions from '../components/AccountActions.jsx'
import { formatNaira, presentCourse } from '../lib/coursePresentation.js'

const MAX_MEDIA_SIZE = 50 * 1024 * 1024
const ALLOWED_MEDIA_TYPES = [
	'application/pdf',
	'video/mp4',
	'video/webm',
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/avif',
]
const MEDIA_EXTENSION_BY_TYPE = {
	'application/pdf': 'pdf',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
}
const STORAGE_BUCKET = 'course-materials'

async function uploadCourseMedia(supabase, file, storagePath, fingerprint, onProgress) {
	const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
	if (sessionError) throw sessionError
	if (!sessionData.session) throw new Error('Your session expired. Sign in again and retry the upload.')

	const projectUrl = import.meta.env.VITE_SUPABASE_URL
	const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
	if (!projectUrl || !publishableKey) throw new Error('Supabase upload configuration is missing.')

	const projectEndpoint = new URL(projectUrl)
	if (projectEndpoint.hostname.endsWith('.supabase.co') && !projectEndpoint.hostname.endsWith('.storage.supabase.co')) {
		projectEndpoint.hostname = projectEndpoint.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')
	}

	return new Promise((resolve, reject) => {
		const upload = new Upload(file, {
			endpoint: `${projectEndpoint.origin}/storage/v1/upload/resumable`,
			headers: {
				Authorization: `Bearer ${sessionData.session.access_token}`,
				apikey: publishableKey,
			},
			uploadDataDuringCreation: true,
			chunkSize: 6 * 1024 * 1024,
			retryDelays: [0, 3000, 5000, 10000, 20000],
			removeFingerprintOnSuccess: true,
			fingerprint: () => Promise.resolve(fingerprint),
			metadata: {
				bucketName: STORAGE_BUCKET,
				objectName: storagePath,
				contentType: file.type,
				cacheControl: '3600',
			},
			onError: reject,
			onProgress(bytesSent, bytesTotal) {
				onProgress(bytesSent, bytesTotal)
			},
			onSuccess: resolve,
		})
		upload.findPreviousUploads()
			.then((previousUploads) => {
				if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0])
				upload.start()
			})
			.catch(reject)
	})
}

async function fetchInstructorStudio(supabase, userId) {
	return Promise.all([
		supabase.from('courses').select('id, title, category, price_kobo, currency, status').eq('instructor_id', userId).order('created_at', { ascending: false }),
		supabase.from('instructor_wallets').select('available_kobo').eq('instructor_id', userId).maybeSingle(),
		supabase.from('instructor_payout_accounts').select('bank_name, account_last4').eq('user_id', userId).maybeSingle(),
		supabase.from('withdrawal_requests').select('id, amount_kobo, currency, status, created_at').eq('instructor_id', userId).order('created_at', { ascending: false }).limit(10),
		supabase.from('payment_orders').select('amount_kobo').eq('instructor_id', userId).eq('status', 'paid'),
		supabase.from('enrollments').select('id, courses!inner(instructor_id)', { count: 'exact', head: true }).eq('courses.instructor_id', userId).eq('status', 'active'),
	])
}

export default function InstructorStudio() {
	const { user, supabase } = useAuth()
	const navigate = useNavigate()
	const [courses, setCourses] = useState([])
	const [walletKobo, setWalletKobo] = useState(0)
	const [payoutAccount, setPayoutAccount] = useState(null)
	const [withdrawals, setWithdrawals] = useState([])
	const [grossSalesKobo, setGrossSalesKobo] = useState(0)
	const [learnerCount, setLearnerCount] = useState(0)
	const [activeCourse, setActiveCourse] = useState(null)
	const [lessons, setLessons] = useState([])
	const [showCourseForm, setShowCourseForm] = useState(false)
	const [showPayoutForm, setShowPayoutForm] = useState(false)
	const [banks, setBanks] = useState([])
	const [banksLoading, setBanksLoading] = useState(false)
	const [banksError, setBanksError] = useState('')
	const [notice, setNotice] = useState('')
	const [busy, setBusy] = useState(false)
	const [uploadProgress, setUploadProgress] = useState(null)
	const [withdrawalRetry, setWithdrawalRetry] = useState(null)

	const applyStudioData = ([courseResult, walletResult, payoutResult, withdrawalResult, orderResult, learnerResult]) => {
		setCourses((courseResult.data ?? []).map(presentCourse))
		setWalletKobo(walletResult.data?.available_kobo ?? 0)
		setPayoutAccount(payoutResult.data ?? null)
		setWithdrawals(withdrawalResult.data ?? [])
		setGrossSalesKobo((orderResult.data ?? []).reduce((total, order) => total + order.amount_kobo, 0))
		setLearnerCount(learnerResult.count ?? 0)
	}

	const loadStudio = useCallback(async () => {
		const results = await fetchInstructorStudio(supabase, user.id)
		if (results.some((result) => result.error)) {
			setNotice('Some instructor information is unavailable. Please refresh and retry.')
			return
		}
		applyStudioData(results)
	}, [supabase, user.id])

	const loadBanks = useCallback(async () => {
		setBanksLoading(true)
		setBanksError('')
		try {
			const { data, error } = await supabase.functions.invoke('list-banks')
			if (error) {
				console.error('Paystack bank list could not be loaded', error)
				let message = ''
				if (error.context instanceof Response) {
					const responseBody = await error.context.clone().json().catch(() => null)
					if (typeof responseBody?.error === 'string') message = responseBody.error
				}
				throw new Error(message || error.message)
			}
			if (!Array.isArray(data?.banks) || data.banks.length === 0) {
				throw new Error('No supported banks were returned. Please try again later.')
			}
			setBanks(data.banks)
		} catch (error) {
			console.error('Bank list request failed', error)
			setBanksError(error instanceof Error ? error.message : 'Bank list could not be loaded.')
		} finally {
			setBanksLoading(false)
		}
	}, [supabase])

	useEffect(() => {
		let active = true
		fetchInstructorStudio(supabase, user.id).then((results) => {
			if (!active) return
			if (results.some((result) => result.error)) {
				setNotice('Some instructor information is unavailable. Please refresh and retry.')
				return
			}
			applyStudioData(results)
		})
		return () => { active = false }
	}, [supabase, user.id])

	async function createCourse(event) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const title = String(form.get('title') ?? '').trim()
		const priceNaira = Number(form.get('price_naira'))
		if (!title || !Number.isFinite(priceNaira) || priceNaira <= 0) return
		setBusy(true)
		setNotice('')
		const { error } = await supabase.from('courses').insert({
			instructor_id: user.id,
			title,
			description: String(form.get('description') ?? '').trim(),
			category: String(form.get('category')),
			price_kobo: Math.round(priceNaira * 100),
		})
		setBusy(false)
		if (error) {
			setNotice('The course could not be saved. Check that your account is approved and the price is within the admin-approved range.')
			return
		}
		setShowCourseForm(false)
		setNotice('Course draft saved.')
		await loadStudio()
	}

	async function submitForReview(courseId) {
		setBusy(true)
		const { error } = await supabase.rpc('submit_course_for_review', { target_course_id: courseId })
		setBusy(false)
		if (error) {
			setNotice('Course could not be submitted for review.')
			return
		}
		setNotice('Course submitted for admin review.')
		await loadStudio()
	}

	async function openCourseMaterials(course) {
		setActiveCourse(course)
		setLessons([])
		const { data, error } = await supabase.from('course_lessons')
			.select('id, title, content, media_path, position')
			.eq('course_id', course.id)
			.order('position', { ascending: true })
		if (error) {
			setNotice('Course materials could not be loaded.')
			return
		}
		setLessons(data ?? [])
	}

	async function saveLesson(event) {
		event.preventDefault()
		if (!activeCourse) return
		const form = new FormData(event.currentTarget)
		const title = String(form.get('title') ?? '').trim()
		const content = String(form.get('content') ?? '').trim()
		const file = form.get('file')
		if (!title || !(file instanceof File) || file.size === 0) {
			setNotice('Add a lesson title and select a PDF, video, or image file.')
			return
		}
		if (!ALLOWED_MEDIA_TYPES.includes(file.type) || file.size > MAX_MEDIA_SIZE) {
			setNotice('Choose a PDF, MP4, WebM, JPEG, PNG, WebP, GIF, or AVIF file up to 50 MiB.')
			return
		}
		setBusy(true)
		setUploadProgress({ percent: 0, sent: 0, total: file.size, bytesPerSecond: 0, secondsRemaining: null })
		const extension = MEDIA_EXTENSION_BY_TYPE[file.type]
		const fingerprint = `teched-course-upload:${JSON.stringify([user.id, activeCourse.id, file.name, file.size, file.lastModified])}`
		const resumeKey = `teched-course-upload-path:${fingerprint}`
		let storagePath
		try {
			storagePath = localStorage.getItem(resumeKey) || `${user.id}/${activeCourse.id}/${crypto.randomUUID()}.${extension}`
			localStorage.setItem(resumeKey, storagePath)
		} catch (storageError) {
			setBusy(false)
			setUploadProgress(null)
			console.error('Course upload could not be prepared for resuming', storageError)
			setNotice('Browser storage is unavailable, so the file upload cannot be started safely.')
			return
		}
		try {
			const uploadStartedAt = performance.now()
			await uploadCourseMedia(supabase, file, storagePath, fingerprint, (sent, total) => {
				const elapsedSeconds = (performance.now() - uploadStartedAt) / 1000
				const bytesPerSecond = elapsedSeconds > 0 ? sent / elapsedSeconds : 0
				setUploadProgress({
					percent: Math.round((sent / total) * 100),
					sent,
					total,
					bytesPerSecond,
					secondsRemaining: bytesPerSecond > 0 ? Math.ceil((total - sent) / bytesPerSecond) : null,
				})
			})
		} catch (uploadError) {
			setBusy(false)
			setUploadProgress(null)
			console.error('Course material upload failed', uploadError)
			setNotice(uploadError instanceof Error
				? `Lesson file upload failed: ${uploadError.message}`
				: 'Lesson file could not be uploaded. Check your connection and Supabase upload limit, then retry.')
			return
		}
		const { error } = await supabase.from('course_lessons').insert({
			course_id: activeCourse.id,
			title,
			content,
			media_path: storagePath,
			position: lessons.length,
		})
		if (error) {
			await supabase.storage.from('course-materials').remove([storagePath])
			localStorage.removeItem(resumeKey)
			setBusy(false)
			setUploadProgress(null)
			setNotice('Lesson details could not be saved.')
			return
		}
		localStorage.removeItem(resumeKey)
		setBusy(false)
		setUploadProgress(null)
		setNotice('Lesson published to this course.')
		await openCourseMaterials(activeCourse)
	}

	async function savePayoutAccount(event) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const bankCode = String(form.get('bank_code') ?? '').trim()
		const selectedBank = banks.find((bank) => bank.code === bankCode)
		if (!selectedBank) {
			setNotice('Choose a bank from the list before verifying your account.')
			return
		}
		setBusy(true)
		const { data, error } = await supabase.functions.invoke('set-payout-account', {
			body: {
				account_number: String(form.get('account_number') ?? '').trim(),
				bank_code: bankCode,
			},
		})
		setBusy(false)
		if (error) {
			console.error('Payout account verification failed', error)
			let message = ''
			if (error.context instanceof Response) {
				const responseBody = await error.context.clone().json().catch(() => null)
				if (typeof responseBody?.error === 'string') message = responseBody.error
			}
			setNotice(message || 'Payout account could not be verified. Check the bank and account number.')
			return
		}
		setPayoutAccount({ bank_name: data.bank_name, account_last4: data.account_last4 })
		setShowPayoutForm(false)
		setNotice(`Verified payout account saved for ${selectedBank.name}.`)
	}

	function togglePayoutForm() {
		const opening = !showPayoutForm
		setShowPayoutForm(opening)
		if (opening && banks.length === 0 && !banksLoading) void loadBanks()
	}

	async function requestWithdrawal(event) {
		event.preventDefault()
		const amountNaira = Number(new FormData(event.currentTarget).get('amount_naira'))
		const amountKobo = Math.round(amountNaira * 100)
		if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0 || amountKobo > walletKobo) {
			setNotice('Enter a withdrawal amount within your available balance.')
			return
		}
		setBusy(true)
		setNotice('')
		const requestKey = withdrawalRetry?.amountKobo === amountKobo ? withdrawalRetry.key : crypto.randomUUID()
		setWithdrawalRetry({ key: requestKey, amountKobo })
		try {
			const { data, error } = await supabase.functions.invoke('request-withdrawal', {
				body: { amount_kobo: amountKobo, idempotency_key: requestKey },
			})
			if (error) {
				console.error('Withdrawal request failed', error)
				let serverMessage = ''
				if (error.context instanceof Response) {
					const responseBody = await error.context.clone().json().catch(() => null)
					if (typeof responseBody?.error === 'string') serverMessage = responseBody.error
				}
				setNotice(serverMessage || `Withdrawal request failed: ${error.message}. Retry the same amount to safely check its status.`)
				return
			}
			if (!data || typeof data.status !== 'string') {
				setNotice('The withdrawal response was incomplete. Retry the same amount to safely check its status.')
				return
			}
			setWithdrawalRetry(null)
			setNotice(data.status === 'processing'
				? data.message || 'Withdrawal is processing with Paystack. Do not submit another request; the status will update when Paystack confirms it.'
				: `Withdrawal ${data.status}.`)
			await loadStudio()
		} catch (error) {
			console.error('Withdrawal request could not be completed', error)
			setNotice('The withdrawal service could not be reached. Retry the same amount to safely check its status.')
		} finally {
			setBusy(false)
		}
	}

	return <main className="workspace-page instructor-dashboard" id="instructor-overview">
		<section className="instructor-heading"><div className="workspace-heading"><button className="icon-button workspace-back" type="button" aria-label="Go back" title="Go back" onClick={() => {
			if (window.history.state?.idx > 0) navigate(-1)
			else navigate('/', { replace: true })
		}}><ArrowLeft size={18} /></button><div><p className="eyebrow">CREATE. TEACH. GROW.</p><h1>Instructor studio<span className="heading-period">.</span></h1><p className="subheading">Your teaching workspace, all in one place.</p></div></div><button className="button button-dark" onClick={() => setShowCourseForm((shown) => !shown)}><Plus size={17} /> Create a course</button></section>
		<div className="demo-callout"><span className="callout-icon"><ShieldCheck size={17} /></span><span><strong>Verified payouts only.</strong> Course earnings become available after Paystack confirms payment.</span><button aria-label="Payout information"><CircleHelp size={16} /></button></div>
		{notice && <p className="notice-banner" role="status">{notice}</p>}
		{showCourseForm && <form className="course-draft-form" onSubmit={createCourse}><label>Course title<input name="title" required maxLength="120" placeholder="e.g. JavaScript for the Modern Web" /></label><label>Learning area<select name="category"><option>Frontend</option><option>Backend</option><option>Frameworks</option></select></label><label>Proposed price (NGN)<input name="price_naira" type="number" min="1" step="0.01" required placeholder="25000" /></label><label>Course description<textarea name="description" rows="2" maxLength="5000" placeholder="What will students learn?" /></label><p>Course prices must fall within the range approved by the academy administrator.</p><button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save course draft'}</button></form>}
		<section className="instructor-metrics"><Metric label="Total learners" value={String(learnerCount)} detail="Active enrollments" icon={Users} /><Metric label="Gross sales" value={formatNaira(grossSalesKobo)} detail="Verified paid course orders" icon={ArrowUpRight} /><Metric label="Instructor share · 80%" value={formatNaira(walletKobo)} detail="Available balance" icon={Wallet} /><Metric label="Available to withdraw" value={formatNaira(walletKobo)} detail="Server-calculated ledger balance" icon={ArrowDownToLine} /></section>
		<section className="section-block" id="instructor-courses"><div className="section-heading"><div><p className="eyebrow">YOUR TEACHING LIBRARY</p><h2>Your courses</h2></div><span className="table-count">{courses.length} courses</span></div>{courses.length ? <div className="instructor-course-list">{courses.map((course) => <article className="instructor-course-row" key={course.id}><div className={`mini-course-image image-${course.accent}`} /><div className="instructor-course-title"><strong>{course.title}</strong><span>{course.category} · {formatNaira(course.price_kobo)}</span></div><span className={`status-badge ${course.status === 'published' ? 'status-live' : 'status-pending'}`}><i />{course.status}</span>{course.status === 'archived' ? <span>Archived by the academy</span> : <div className="review-actions"><button className="approve-button" onClick={() => openCourseMaterials(course)}>Manage lessons</button>{['draft', 'rejected'].includes(course.status) && <button className="approve-button" onClick={() => submitForReview(course.id)} disabled={busy}>Submit for review</button>}</div>}</article>)}</div> : <EmptyState title="Your first course starts here" action="Create a course" onClick={() => setShowCourseForm(true)} />}</section>
		{activeCourse && <section className="section-block lesson-editor"><div className="section-heading"><div><p className="eyebrow">COURSE MATERIALS</p><h2>{activeCourse.title}</h2></div><span className="table-count">{lessons.length} lessons</span></div><form className="lesson-editor-form" onSubmit={saveLesson}><label>Lesson title<input name="title" required maxLength="160" placeholder="e.g. Building your first responsive layout" /></label><label>Lesson notes<textarea name="content" rows="4" maxLength="20000" placeholder="Write plain-text notes for your students." /></label><label>PDF, video, or image file<input name="file" type="file" accept="application/pdf,video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif,image/avif" required /></label><p>Private course storage. PDF, video, and image files up to 50 MiB. Large uploads can be resumed if interrupted.</p>{uploadProgress && <div className="lesson-upload-progress" role="status" aria-live="polite"><div><span>{(uploadProgress.sent / (1024 * 1024)).toFixed(1)} MB of {(uploadProgress.total / (1024 * 1024)).toFixed(1)} MB</span><span>{uploadProgress.bytesPerSecond > 0 ? `${(uploadProgress.bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s` : 'Starting upload…'}</span></div><progress max="100" value={uploadProgress.percent}>{uploadProgress.percent}%</progress><span>{uploadProgress.secondsRemaining === null ? `${uploadProgress.percent}% uploaded` : `${uploadProgress.percent}% · about ${Math.floor(uploadProgress.secondsRemaining / 60)}m ${uploadProgress.secondsRemaining % 60}s remaining`}</span></div>}<button className="button button-dark" type="submit" disabled={busy}>{busy ? `Uploading ${uploadProgress?.percent ?? 0}%…` : 'Publish lesson material'}</button></form>{lessons.length > 0 && <div className="instructor-course-list">{lessons.map((lesson) => <article className="instructor-course-row" key={lesson.id}><div className="instructor-course-title"><strong>{lesson.position + 1}. {lesson.title}</strong><span>{lesson.media_path ? 'Private media attached' : 'Text lesson'}</span></div></article>)}</div>}</section>}
		<section className="section-block" id="instructor-payouts"><div className="section-heading"><div><p className="eyebrow">PAYOUT DESTINATION</p><h2>Bank account</h2></div><button className="button button-outline" onClick={togglePayoutForm}>{payoutAccount ? 'Change account' : 'Add account'}</button></div>{payoutAccount && <p className="payout-account-summary">{payoutAccount.bank_name} ·•••• {payoutAccount.account_last4}</p>}{showPayoutForm && <form className="course-draft-form" onSubmit={savePayoutAccount}>{banksError ? <div className="auth-form-error" role="alert">{banksError} <button type="button" className="button button-outline" onClick={loadBanks} disabled={banksLoading}>{banksLoading ? 'Loading…' : 'Try again'}</button></div> : <label>Bank<select name="bank_code" required disabled={banksLoading || !banks.length}><option value="">{banksLoading ? 'Loading banks…' : 'Select your bank'}</option>{banks.map((bank) => <option key={`${bank.code}-${bank.name}`} value={bank.code}>{bank.name}</option>)}</select></label>}<label>Account number<input name="account_number" required inputMode="numeric" pattern="[0-9]{10}" maxLength="10" placeholder="10-digit account number" /></label><p>Select your bank from Paystack’s list—no need to find or enter its bank code. We verify the account before saving; the account number is not stored in the academy database.</p><button className="button button-dark" type="submit" disabled={busy || banksLoading || !banks.length}>{busy ? 'Verifying…' : 'Verify and save account'}</button></form>}</section>
		<section className="section-block"><div className="section-heading"><div><p className="eyebrow">WITHDRAWALS</p><h2>Request payout</h2></div><span className="table-count">Available {formatNaira(walletKobo)}</span></div><form className="course-draft-form withdrawal-form" onSubmit={requestWithdrawal}><label>Amount (NGN)<input name="amount_naira" type="number" min="1" step="0.01" max={walletKobo / 100} required placeholder="0.00" /></label><button className="button button-dark" type="submit" disabled={busy || walletKobo <= 0 || !payoutAccount}>{busy ? 'Submitting…' : 'Request withdrawal'}</button></form>{!payoutAccount && <p className="notice-banner">To enable withdrawals, add and verify your bank account in the Payout destination section above.</p>}{payoutAccount && walletKobo <= 0 && <p className="notice-banner">There is no available balance to withdraw yet. Verified course earnings will appear here after payment.</p>}{withdrawals.length > 0 && <div className="instructor-course-list">{withdrawals.map((withdrawal) => <article className="instructor-course-row" key={withdrawal.id}><div className="instructor-course-title"><strong>{formatNaira(withdrawal.amount_kobo)}</strong><span>{new Date(withdrawal.created_at).toLocaleDateString('en-NG')}</span></div><span className="status-badge status-pending"><i />{withdrawal.status}</span></article>)}</div>}</section>
		<AccountActions role="instructor" />
		<nav className="workspace-bottom-nav" aria-label="Instructor navigation">
			<a href="#instructor-overview" aria-label="Overview" title="Overview"><LayoutDashboard size={20} /></a>
			<a href="#instructor-courses" aria-label="Courses" title="Courses"><BookOpen size={20} /></a>
			<a href="#instructor-payouts" aria-label="Payouts" title="Payouts"><Wallet size={20} /></a>
		</nav>
	</main>
}
