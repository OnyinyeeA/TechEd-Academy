import { ArrowRight, Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function InstructorPending() {
	return <main className="access-denied"><span><Clock3 size={22} /></span><p className="eyebrow">APPLICATION RECEIVED</p><h1>We’re reviewing your instructor application<span className="heading-period">.</span></h1><p>Instructor tools open after an administrator approves your application.</p><Link className="button button-dark" to="/">Back to academy <ArrowRight size={16} /></Link></main>
}