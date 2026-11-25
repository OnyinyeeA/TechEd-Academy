import { ArrowRight, BookOpen, Check, Compass, Play, Sparkles } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { CourseGrid, EmptyState, StatCard } from '../components/AcademyUI.jsx'
import AccountActions from '../components/AccountActions.jsx'
import { useAuth } from '../auth/AuthContext.js'

export default function StudentDashboard() {
	const { enrolledCourses: courses, recommendations, setView, openCourse } = useOutletContext()
	const { profile } = useAuth()
	const activeCourse = courses[0]
	const completedCourses = courses.filter((course) => course.progress === 100).length
	const averageProgress = courses.length ? Math.round(courses.reduce((total, course) => total + course.progress, 0) / courses.length) : 0
	const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'there'

	return <div className="student-dashboard">
		<section className="welcome-row">
			<div>
				<p className="eyebrow">YOUR LEARNING SPACE</p>
				<h1>Welcome, {firstName}<span className="heading-period">.</span></h1>
				<p className="subheading">Small steps today. A whole new skill set tomorrow.</p>
			</div>
			<button className="button button-outline" onClick={() => setView('explore')}>
				<Compass size={17} /> Browse catalog
			</button>
		</section>

		<section className="hero-panel">
			<div className="hero-content">
				<div className="hero-kicker">
					YOUR NEXT CHAPTER
				</div>
				<h2>Make your next<br />move in tech.</h2>
				<p>Learn by building real projects, one focused lesson at a time.</p>
				<button className="button button-lime" onClick={() => setView(activeCourse ? 'learning' : 'explore')}>{activeCourse ? 'Continue learning' : 'Explore your first course'}<ArrowRight size={17} /></button>
			</div>
			<div className="hero-art" aria-label="A developer working at a computer" role="img">
				<div className="hero-image" />
			</div>
		</section>
		<section className="stat-grid" aria-label="Learning statistics">
			<StatCard label="Courses in progress" value={String(courses.length).padStart(2, '0')} detail="Active enrollments" icon={BookOpen} color="green" />
			<StatCard label="Average progress" value={`${averageProgress}%`} detail="Across active courses" icon={Sparkles} color="blue" />
			<StatCard label="Completed courses" value={String(completedCourses)} detail="Based on verified progress" icon={Check} color="orange" />
			<StatCard label="Suggested courses" value={String(recommendations.length)} detail="Available in the catalog" icon={Compass} color="lime" />
		</section>
		<section className="section-block">
			<div className="section-heading">
				<div>
					<p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
					<h2>Continue learning</h2>
				</div>
				<button className="text-link" onClick={() => setView('learning')}>All courses <ArrowRight size={16} /></button>
			</div>{activeCourse ? 
			<div className="continue-card">
				<div className={`continue-image image-${activeCourse.course.accent}`} style={{ backgroundImage: `url(${activeCourse.course.image})` }}>
					<span className="image-course-tag">{activeCourse.course.category}</span>
					<button className="play-button" onClick={() => setView('learning')} aria-label="Continue course">
						<Play size={17} fill="currentColor" />
					</button>
				</div>
				<div className="continue-details">
					<div className="course-topline">
						<span className="course-label">IN PROGRESS</span>
						<span className="course-level">{activeCourse.course.level}</span>
					</div>
					<h3>{activeCourse.course.title}</h3>
					<p className="instructor-line">with {activeCourse.course.instructor}</p>
					<div className="progress-label">
						<span>Course progress</span>
						<strong>{activeCourse.progress}%</strong>
					</div>
					<div className="progress-track">
						<span style={{ width: `${activeCourse.progress}%` }} />
					</div>
					<div className="next-lesson">
						<span className="next-icon"><Play size={13} fill="currentColor" /></span>
						<span><small>NEXT LESSON</small><strong>{activeCourse.nextLesson}</strong></span>
						<button aria-label="Open next lesson" onClick={() => setView('learning')}>
							<ArrowRight size={17} />
						</button>
					</div>
				</div>
			</div> : <EmptyState title="Your first course is waiting" action="Explore courses" onClick={() => setView('explore')} />}
		</section>
		<section className="section-block recommendations-block">
			<div className="section-heading">
				<div>
					<p className="eyebrow">CURATED FOR YOUR PATH</p>
					<h2>Good next steps</h2>
				</div>
				<button className="text-link" onClick={() => setView('explore')}>View catalog
					<ArrowRight size={16} />
				</button>
			</div>
			<CourseGrid courses={recommendations} openCourse={openCourse} />
		</section>
		<AccountActions role="student" />
	</div>
}