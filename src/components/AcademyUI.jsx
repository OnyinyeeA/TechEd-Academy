import { ArrowRight, ArrowUpRight, BookOpen, Check, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatNaira } from '../lib/coursePresentation.js'

export function CourseGrid({ courses, openCourse, enrolled = [] }) {
	const navigate = useNavigate()
	return <div className="course-grid">{courses.map((course) => {
		const isEnrolled = enrolled.some((item) => item.courseId === course.id)
		const open = () => isEnrolled ? navigate(`/student/courses/${course.id}`) : openCourse(course)
		return <article className="course-card" key={course.id}>
			<button className={`course-cover image-${course.accent}`} style={{ backgroundImage: `url(${course.image})` }} onClick={open} aria-label={`${isEnrolled ? 'Continue learning' : 'View'} ${course.title}`}><span className="cover-category">{course.category}</span><span className="cover-arrow"><ArrowUpRight size={18} /></span></button>
			<div className="course-card-body"><div className="course-card-meta"><span>{course.level}</span><span><BookOpen size={13} /> {course.lessons || 'New'} lessons</span></div><h3>{course.title}</h3><p className="course-instructor">{course.instructor}</p><div className="course-card-bottom"><span className="course-price">{formatNaira(course.price_kobo)}</span><button className={`button ${isEnrolled ? 'button-enrolled' : 'button-dark'}`} onClick={open}>{isEnrolled ? 'Continue learning' : 'View course'}{isEnrolled ? <Check size={15} /> : <ArrowRight size={15} />}</button></div></div>
		</article>
	})}</div>
}

export function EmptyState({ title, action, onClick }) {
	return <div className="empty-state"><span><BookOpen size={21} /></span><div><strong>{title}</strong><p>Explore practical courses designed to help you build your next skill.</p></div><button className="button button-dark" onClick={onClick}>{action}<ArrowRight size={15} /></button></div>
}

export function StatCard({ label, value, detail, icon: Icon, color }) {
	return <article className="stat-card"><span className={`stat-icon stat-${color}`}><Icon size={18} /></span><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><ArrowUpRight className="stat-arrow" size={16} /></article>
}

export function Metric({ label, value, detail, icon: Icon }) {
	return <article className="metric-card"><div className="metric-label"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{detail}</small></article>
}

export function AccessDeniedView({ role = 'workspace' }) {
	const archived = role === 'archived account'
	return <section className="access-denied"><span><LockKeyhole size={22} /></span><p className="eyebrow">{archived ? 'ACCOUNT INACTIVE' : 'VERIFIED ACCOUNT REQUIRED'}</p><h1>{archived ? 'This account has been archived' : `${role} access is locked`}<span className="heading-period">.</span></h1><p>{archived ? 'This account is no longer active. Contact the academy if you need help.' : 'This workspace is available only after a trusted server verifies your account and role.'}</p><span className="access-denied-note"><ShieldCheck size={15} /> Protected routes fail closed in this demo.</span></section>
}