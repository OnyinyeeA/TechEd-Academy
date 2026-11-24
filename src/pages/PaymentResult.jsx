import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleHelp, LoaderCircle, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.js'

export default function PaymentResult() {
	const [searchParams] = useSearchParams()
	const { supabase } = useAuth()
	const [result, setResult] = useState(null)
	const [retryCount, setRetryCount] = useState(0)
	const reference = searchParams.get('reference')
	const status = !reference || !supabase ? 'unavailable' : result ?? 'checking'

	useEffect(() => {
		let active = true
		async function checkPayment() {
			if (!reference || !supabase) return
			const { data, error } = await supabase.functions.invoke('verify-payment', { body: { reference } })
			if (!active) return
			if (error) {
				setResult('unavailable')
				return
			}
			setResult(data?.status === 'paid' ? 'paid' : data?.status === 'failed' ? 'failed' : 'processing')
		}
		void checkPayment()
		return () => { active = false }
	}, [reference, retryCount, supabase])

	const copy = {
		checking: ['Confirming payment', 'We’re securely checking the payment with Paystack.'],
		processing: ['Payment processing', 'Your course access will appear after Paystack confirms settlement.'],
		paid: ['You’re enrolled', 'Your payment is verified and the course is in your learning space.'],
		failed: ['Payment not completed', 'No enrollment was created. You can return to the course catalogue and try again.'],
		unavailable: ['Could not confirm payment', 'Your course access has not changed. Try checking again shortly.'],
	}[status]
	const Icon = status === 'paid' ? CheckCircle2 : status === 'failed' ? XCircle : status === 'checking' ? LoaderCircle : CircleHelp

	return <main className="payment-result"><section className={`payment-result-panel payment-${status}`}><span className="payment-result-icon"><Icon size={23} /></span><p className="eyebrow">PAYSTACK · NGN</p><h1>{copy[0]}</h1><p>{copy[1]}</p>{status === 'processing' || status === 'unavailable' ? <button className="button button-outline" onClick={() => { setResult(null); setRetryCount((count) => count + 1) }}>Check again</button> : null}<Link className="button button-dark" to={status === 'paid' ? '/student/learning' : '/student/catalog'}>{status === 'paid' ? 'Go to my learning' : 'Back to courses'} <ArrowRight size={16} /></Link></section></main>
}