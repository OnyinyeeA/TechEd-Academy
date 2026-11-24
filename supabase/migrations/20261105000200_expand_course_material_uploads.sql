update storage.buckets
set
	file_size_limit = 524288000,
	allowed_mime_types = array[
		'application/pdf',
		'video/mp4',
		'video/webm',
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/gif',
		'image/avif'
	]
where id = 'course-materials';
