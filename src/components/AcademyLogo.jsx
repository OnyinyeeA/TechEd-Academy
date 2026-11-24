import { Code2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AcademyLogo({ className = '', to = '/' }) {
	return (
		<Link className={`brand ${className}`.trim()} to={to} aria-label="TechEd Academy home">
			<span className="brand-mark"><Code2 size={21} strokeWidth={2.6} /></span>
			<span className="brand-name">TechEd<span>Academy</span></span>
		</Link>
	)
}
