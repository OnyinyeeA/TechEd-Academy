import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Code2, GraduationCap } from 'lucide-react'
import { useAuth } from './auth/AuthContext.js'
import AdSenseAd from './components/AdSenseAd.jsx'
import AcademyLogo from './components/AcademyLogo.jsx'
import { formatNaira, presentCourse } from './lib/coursePresentation.js'
import './App.css'

export default function App() {
	const navigate = useNavigate()
	const { supabase, user } = useAuth()
	const [courses, setCourses] = useState([])
	const [approvedInstructorCount, setApprovedInstructorCount] = useState(0)
	const [coursesLoading, setCoursesLoading] = useState(true)
	const [coursesError, setCoursesError] = useState(false)
	const openAuth = (path) => navigate(path)
	const openStudentCourses = () => navigate(user ? '/student/catalog' : '/student/register')

	useEffect(() => {
		let active = true
		async function loadCourses() {
			if (!supabase) {
				setCoursesError(true)
				setCoursesLoading(false)
				return
			}
			const [coursesResult, instructorsResult] = await Promise.all([
				supabase
					.from('courses')
					.select('id, title, category, description, price_kobo')
					.eq('status', 'published')
					.order('created_at', { ascending: false }),
				supabase.rpc('approved_instructor_count'),
			])
			if (!active) return
			if (coursesResult.error) {
				console.error('Published courses could not be loaded for the homepage', coursesResult.error)
				setCoursesError(true)
			} else {
				setCourses((coursesResult.data ?? []).map(presentCourse))
			}
			if (instructorsResult.error) {
				console.error('Approved instructor count could not be loaded for the homepage', instructorsResult.error)
			} else {
				setApprovedInstructorCount(Number(instructorsResult.data))
			}
			setCoursesLoading(false)
		}
		void loadCourses()
		return () => { active = false }
	}, [supabase])

	return (
		<div className="public-site">
			<header className="public-header">
				<AcademyLogo to="/#top" />
				<nav className="public-nav" aria-label="Website navigation"><a href="#courses">Courses</a><a href="#method">How it works</a><a href="#teach">Teach with us</a></nav>
				<div className="public-header-actions"><button className="public-login-link" onClick={() => openAuth('/student/login')}>Student sign in</button><button className="button button-dark" onClick={() => openAuth('/student/register')}>Get started <ArrowRight size={15} /></button></div>
			</header>

			<main id="top">
				<section className="public-hero">
					<div className="public-hero-photo" role="img" aria-label="A collaborative technology learning session" />
					<div className="public-hero-content"><p className="public-eyebrow"><span /> PRACTICAL TECH EDUCATION, BUILT AROUND YOU</p><h1>TechEd Academy<span>.</span><br /><em>Learn to build.</em></h1><p className="public-hero-copy">Turn curiosity into capability with practical tech courses, thoughtful instructors, and projects you can put to work to become a software developer.</p><div className="public-hero-actions"><button className="button button-lime" onClick={() => openAuth('/student/register')}>Create a student account <ArrowRight size={16} /></button><button className="public-text-action" onClick={() => openAuth('/instructor/register')}>I want to teach <ArrowUpRight size={15} /></button></div><div className="public-hero-proof">{approvedInstructorCount > 0 && <span className="proof-avatars" aria-label="Approved instructors"><i>AO</i><i>DM</i><i>TA</i></span>}<span>Learn with people who build for a living</span></div></div>
				</section>
				<AdSenseAd />

				<section className="public-intro" id="method"><div className="intro-heading"><p className="public-eyebrow public-eyebrow-dark"><span /> SKILLS THAT MOVE WITH YOU</p><h2>From first tag<br />to full-stack thinking.</h2></div><p className="intro-copy">A focused path through the tools and ideas shaping the modern web. Learn the why, practice the how, and leave with work that proves it.</p><div className="intro-mark"><Code2 size={31} /></div></section>

				<section className="public-courses" id="courses">
					<div className="public-section-heading"><div><p className="public-eyebrow public-eyebrow-dark"><span /> START WITH THE FOUNDATIONS</p><h2>Build a skill. Then build on it.</h2></div></div>
					{coursesLoading ? <p className="public-courses-message" role="status">Loading available courses…</p>
						: coursesError ? <div className="public-courses-message" role="alert"><p>Available courses could not be loaded right now.</p><button className="button button-dark" onClick={openStudentCourses}>Sign in to explore courses <ArrowRight size={15} /></button></div>
							: courses.length ? <div className="public-course-grid">{courses.map((course, index) => <article className="public-course-card" key={course.id}>
								<div className={`public-course-image image-${course.accent}`} style={{ backgroundImage: course.image ? `url(${course.image})` : undefined }}><span>{String(index + 1).padStart(2, '0')}</span><span>{course.category}</span></div>
								<div className="public-course-body"><div className="public-course-meta"><span>{course.category}</span><span>Available now</span></div><h3>{course.title}</h3><p>{course.description || 'Explore this practical course and start building new skills.'}</p><div className="public-course-bottom"><strong>{formatNaira(course.price_kobo)}</strong><button aria-label={`${user ? 'Sign in to explore' : 'Register to explore'} ${course.title}`} onClick={openStudentCourses}><ArrowUpRight size={18} /></button></div></div>
							</article>)}</div>
								: <div className="public-courses-message"><p>There are no published courses available yet. Check back soon.</p><button className="button button-dark" onClick={() => openAuth('/student/register')}>Create a student account <ArrowRight size={15} /></button></div>}
				</section>

				<section className="public-method"><div className="method-photo" role="img" aria-label="Student practicing web development on a laptop" /><div className="method-content"><p className="public-eyebrow"><span /> HOW LEARNING HAPPENS</p><h2>Made to be used,<br />not just watched.</h2><div className="method-steps"><div><span>01</span><p><strong>Choose your path</strong><small>Start with the fundamentals or go deeper into a specialty.</small></p></div><div><span>02</span><p><strong>Learn by doing</strong><small>Follow guided lessons and practice on real projects.</small></p></div><div><span>03</span><p><strong>Keep your momentum</strong><small>Track progress and build a portfolio one skill at a time.</small></p></div></div><button className="button button-lime" onClick={() => openAuth('/student/register')}>Find your starting point <ArrowRight size={16} /></button></div></section>

				<section className="public-teach" id="teach"><div><p className="public-eyebrow public-eyebrow-dark"><span /> FOR THE PEOPLE WHO BUILD</p><h2>Good work deserves<br />good teachers.</h2><p>Share what you know, shape a course, and help the next generation find their way into tech.</p></div><button className="button button-dark" onClick={() => openAuth('/instructor/register')}>Apply to teach <ArrowUpRight size={16} /></button><span className="teach-stamp"><GraduationCap size={27} /></span></section>
				<footer className="public-footer"><AcademyLogo to="/#top" /><span>Learn to build what comes next.</span><div className="public-footer-links"><button onClick={() => openAuth('/student/login')}>Student sign in</button><button onClick={() => openAuth('/instructor/login')}>Instructor sign in</button></div></footer>
			</main>
		</div>
	)
}
