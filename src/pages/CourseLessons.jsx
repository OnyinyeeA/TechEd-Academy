import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, LockKeyhole } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'
import { formatNaira } from '../lib/coursePresentation.js'

function getMediaKind(path) {
	const extension = path?.split('.').pop()?.toLowerCase()
	if (['mp4', 'webm'].includes(extension)) return 'video'
	if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(extension)) return 'image'
	if (extension === 'pdf') return 'pdf'
	return 'file'
}

export default function CourseLessons() {
	const { courseId } = useParams()
	const { user, supabase } = useAuth()
	const [course, setCourse] = useState(null)
	const [lessons, setLessons] = useState([])
	const [state, setState] = useState('loading')

	useEffect(() => {
		let active = true
		async function load() {
			const { data: courseRow, error: courseError } = await supabase
				.from('courses')
				.select('id, title, description, category, price_kobo, status')
				.eq('id', courseId)
				.maybeSingle()
			if (!active) return
			if (courseError || !courseRow) {
				setState('unavailable')
				return
			}
			setCourse(courseRow)

			const { data: enrollment, error: enrollmentError } = await supabase
				.from('enrollments')
				.select('id')
				.eq('student_id', user.id)
				.eq('course_id', courseId)
				.eq('status', 'active')
				.maybeSingle()
			if (!active) return
			if (enrollmentError || !enrollment) {
				setState('not-enrolled')
				return
			}

			const { data: rows, error: lessonError } = await supabase
				.from('course_lessons')
				.select('id, title, content, media_path, position')
				.eq('course_id', courseId)
				.order('position', { ascending: true })
			if (!active) return
			if (lessonError) {
				setState('unavailable')
				return
			}

			const lessonsWithUrls = await Promise.all((rows ?? []).map(async (lesson) => {
				if (!lesson.media_path) return { ...lesson, media_url: null }
				const { data, error } = await supabase.storage.from('course-materials').createSignedUrl(lesson.media_path, 3600)
				return { ...lesson, media_url: data?.signedUrl ?? null, media_error: Boolean(error || !data?.signedUrl) }
			}))
			if (!active) return
			setLessons(lessonsWithUrls)
			setState('ready')
		}
		void load()
		return () => { active = false }
	}, [courseId, supabase, user.id])

	if (state === 'loading') return <main className="course-lessons-page"><p className="notice-banner" role="status">Loading your course…</p></main>
	if (state === 'unavailable') return <main className="course-lessons-page"><section className="access-denied"><LockKeyhole size={22} /><h1>Course unavailable</h1><p>We could not load this course. Please return to your learning space.</p><Link className="button button-dark" to="/student/learning">My learning</Link></section></main>
	if (state === 'not-enrolled') return <main className="course-lessons-page"><section className="access-denied"><LockKeyhole size={22} /><h1>Enrollment required</h1><p>Purchase access to this course before viewing its lessons.</p><Link className="button button-dark" to="/student/catalog">Browse courses · {formatNaira(course.price_kobo)}</Link></section></main>

	return <main className="course-lessons-page"><header className="course-lessons-header"><Link className="text-link" to="/student/learning"><ArrowLeft size={16} /> Back to my learning</Link><span className="locked-note"><LockKeyhole size={14} /> Verified enrollment</span></header><section className="course-lessons-title"><p className="eyebrow">{course.category} · SECURE COURSE MATERIALS</p><h1>{course.title}</h1><p>{course.description}</p></section>{lessons.length ? <div className="lesson-list">{lessons.map((lesson) => <article className="lesson-panel" key={lesson.id}><div className="lesson-panel-heading"><span><BookOpen size={17} /> Lesson {lesson.position + 1}</span><h2>{lesson.title}</h2></div>{lesson.content && <p className="lesson-content">{lesson.content}</p>}{lesson.media_error && <p className="notice-banner" role="alert">This lesson material could not be loaded. Please refresh or contact the instructor.</p>}{lesson.media_url && getMediaKind(lesson.media_path) === 'video' && <video className="lesson-video" controls preload="metadata" src={lesson.media_url}>Your browser does not support video playback.</video>}{lesson.media_url && getMediaKind(lesson.media_path) === 'image' && <img className="lesson-image" src={lesson.media_url} alt={lesson.title} loading="lazy" />}{lesson.media_url && getMediaKind(lesson.media_path) === 'pdf' && <a className="button button-outline" href={lesson.media_url} target="_blank" rel="noreferrer">Open PDF lesson material</a>}{lesson.media_url && getMediaKind(lesson.media_path) === 'file' && <a className="button button-outline" href={lesson.media_url} target="_blank" rel="noreferrer">Open lesson material</a>}</article>)}</div> : <section className="empty-state"><span><BookOpen size={21} /></span><div><strong>Lessons are being prepared</strong><p>Your enrollment is active. The instructor has not published lessons yet.</p></div></section>}</main>
}