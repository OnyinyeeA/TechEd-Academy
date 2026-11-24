import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import AdminConsole from './pages/AdminConsole.jsx'
import CourseCatalog from './pages/CourseCatalog.jsx'
import CourseLessons from './pages/CourseLessons.jsx'
import InstructorStudio from './pages/InstructorStudio.jsx'
import MyLearning from './pages/MyLearning.jsx'
import PaymentResult from './pages/PaymentResult.jsx'
import StudentDashboard from './pages/StudentDashboard.jsx'
import InstructorPending from './pages/InstructorPending.jsx'
import EmailVerificationPage from './pages/EmailVerificationPage.jsx'
import ProtectedRoute from './routes/ProtectedRoute.jsx'
import AuthRoute from './routes/AuthRoute.jsx'
import StudentWorkspace from './layouts/StudentWorkspace.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/auth/verify" element={<EmailVerificationPage />} />
          <Route path="/student/login" element={<AuthRoute role="student" mode="login" />} />
          <Route path="/student/register" element={<AuthRoute role="student" mode="register" />} />
          <Route path="/instructor/login" element={<AuthRoute role="instructor" mode="login" />} />
          <Route path="/instructor/register" element={<AuthRoute role="instructor" mode="register" />} />
          <Route path="/instructor/pending" element={<InstructorPending />} />
          <Route path="/admin/login" element={<AuthRoute role="admin" mode="login" />} />
          <Route path="/admin/register" element={<Navigate to="/admin/login" replace />} />
          <Route path="/student" element={<ProtectedRoute role="student"><StudentWorkspace /></ProtectedRoute>}>
            <Route index element={<StudentDashboard />} />
            <Route path="catalog" element={<CourseCatalog />} />
            <Route path="learning" element={<MyLearning />} />
            <Route path="courses/:courseId" element={<CourseLessons />} />
            <Route path="payment-result" element={<PaymentResult />} />
          </Route>
          <Route path="/instructor/*" element={<ProtectedRoute role="instructor"><InstructorStudio /></ProtectedRoute>} />
          <Route path="/admin/*" element={<ProtectedRoute role="admin"><AdminConsole /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
