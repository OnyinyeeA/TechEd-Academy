import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { CourseGrid, EmptyState } from '../components/AcademyUI.jsx'

export default function CourseCatalog() {
	const { visibleCourses: courses, category, setCategory, setSearch, openCourse, enrolled } = useOutletContext()
	const categories = ['All courses', 'Frontend', 'Backend', 'Frameworks']
	return <>
		<section className="page-title-row"><div><p className="eyebrow">LEARN SOMETHING THAT MOVES YOU</p><h1>Course catalog<span className="heading-period">.</span></h1><p className="subheading">Practical paths for your next chapter in web development.</p></div><div className="catalog-count"><strong>{courses.length.toString().padStart(2, '0')}</strong><span>courses<br />to explore</span></div></section>
		<div className="catalog-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter courses">{categories.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'filter-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span className="catalog-note"><LockKeyhole size={14} /> Enroll to unlock course materials</span></div>
		{courses.length ? <CourseGrid courses={courses} openCourse={openCourse} enrolled={enrolled} /> : <EmptyState title="No courses match that search" action="Clear filters" onClick={() => { setCategory('All courses'); setSearch('') }} />}
		<div className="demo-explainer"><LockKeyhole size={18} /><div><strong>Course access requires a verified enrollment</strong><p>Course previews are public. Lessons and downloadable resources must be authorized by the server after payment confirmation.</p></div><ArrowRight size={16} /></div>
	</>
}