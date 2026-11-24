import { courses as artwork } from '../data/courses.js'

const artworkByCategory = new Map(artwork.map((course) => [course.category, course]))

export function presentCourse(course) {
	const art = artworkByCategory.get(course.category)
	return {
		...course,
		price: course.price_kobo / 100,
		currency: 'NGN',
		instructor: 'Teched Academy instructor',
		lessons: course.lessons ?? 0,
		accent: art?.accent ?? 'mint',
		image: art?.image ?? '',
	}
}

export function formatNaira(amountKobo) {
	return new Intl.NumberFormat('en-NG', {
		style: 'currency',
		currency: 'NGN',
		maximumFractionDigits: 0,
	}).format(amountKobo / 100)
}