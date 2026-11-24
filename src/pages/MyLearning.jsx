import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { EmptyState } from '../components/AcademyUI.jsx'
import AccountActions from '../components/AccountActions.jsx'

export default function MyLearning() {
	const { enrolledCourses: courses, setView } = useOutletContext()
	const navigate = useNavigate()
	return <>
		<section className="page-title-row"><div><p className="eyebrow">YOUR PERSONAL LEARNING PATH</p><h1>My learning<span className="heading-period">.</span></h1><p className="subheading">Everything you’re learning, all in one place.</p></div><div className="learning-summary"><strong>{courses.length}</strong><span>active courses</span></div></section>
			{courses.length ? <div className="learning-list">{courses.map(({ course, progress, nextLesson }) => <article className="learning-row" key={course.id}><div className={`learning-cover image-${course.accent}`} style={{ backgroundImage: `url(${course.image})` }}><span>{course.category}</span></div><div className="learning-main"><div className="course-topline"><span className="course-label">{progress === 100 ? 'COMPLETED' : 'IN PROGRESS'}</span><span className="course-level">{course.level}</span></div><h3>{course.title}</h3><p>with {course.instructor}</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="learning-meta"><span>{progress}% complete</span><span>Next: {nextLesson}</span></div></div><div className="learning-actions"><span className="locked-note"><LockKeyhole size={14} /> Enrolled</span><button className="button button-dark" onClick={() => navigate(`/student/courses/${course.id}`)}>Open course <ArrowRight size={16} /></button></div></article>)}</div> : <EmptyState title="You haven’t enrolled in a course yet" action="Browse the catalog" onClick={() => setView('explore')} />}
		<div className="demo-explainer"><LockKeyhole size={19} /><div><strong>Course materials are protected in production</strong><p>This demo shows your learning list only. Real lesson access requires verified purchase records and server-side authorization.</p></div></div>
		<AccountActions role="student" />
	</>
}