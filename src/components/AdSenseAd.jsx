import { useEffect, useRef } from 'react'

const clientId = import.meta.env.VITE_ADSENSE_CLIENT?.trim()
const adSlot = import.meta.env.VITE_ADSENSE_HOME_SLOT?.trim()
const scriptSelector = 'script[data-adsense-client]'

export default function AdSenseAd() {
	const adRef = useRef(null)

	useEffect(() => {
		if (!clientId || !adSlot) return

		let script = document.querySelector(scriptSelector)
		const requestAd = () => {
			const ad = adRef.current
			if (!ad || ad.dataset.adsbygoogleStatus) return

			try {
				window.adsbygoogle = window.adsbygoogle || []
				window.adsbygoogle.push({})
			} catch (error) {
				console.error('Google AdSense could not initialize this ad unit', error)
			}
		}
		const reportLoadError = () => console.error('Google AdSense script could not be loaded')

		if (!script) {
			script = document.createElement('script')
			script.async = true
			script.crossOrigin = 'anonymous'
			script.dataset.adsenseClient = clientId
			script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`
			script.addEventListener('load', requestAd, { once: true })
			script.addEventListener('error', reportLoadError, { once: true })
			document.head.appendChild(script)
		} else if (window.adsbygoogle) {
			requestAd()
		} else {
			script.addEventListener('load', requestAd, { once: true })
			script.addEventListener('error', reportLoadError, { once: true })
		}

		return () => {
			script?.removeEventListener('load', requestAd)
			script?.removeEventListener('error', reportLoadError)
		}
	}, [])

	if (!clientId || !adSlot) return null

	return (
		<aside className="public-ad-slot" aria-label="Advertisement">
			<span>Advertisement</span>
			<ins
				ref={adRef}
				className="adsbygoogle"
				style={{ display: 'block' }}
				data-ad-client={clientId}
				data-ad-slot={adSlot}
				data-ad-format="auto"
				data-full-width-responsive="true"
			/>
		</aside>
	)
}
