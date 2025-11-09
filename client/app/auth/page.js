'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const token = localStorage.getItem('token')
    if (token) router.replace('/')
  }, [router])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password }

      const { data } = await axios.post(`${API_BASE}${endpoint}`, payload)

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      router.replace('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <>
      <style jsx>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f3f4f6;
        }
        .auth-card {
          background: white;
          width: 100%;
          max-width: 384px;
          padding: 32px;
          border-radius: 12px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        .auth-title {
          font-size: 24px;
          font-weight: 700;
          text-align: center;
          margin-bottom: 24px;
          color: #111827;
        }
        .error-box {
          background-color: #fee2e2;
          color: #dc2626;
          font-size: 14px;
          padding: 12px;
          margin-bottom: 16px;
          border-radius: 8px;
          border: 1px solid #fecaca;
        }
        .form-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .input-field {
          width: 100%;
          padding: 8px 16px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          outline: none;
          font-size: 14px;
          transition: all 0.2s;
        }
        .input-field:focus {
          ring: 2px;
          ring-color: #111827;
          border-color: #111827;
        }
        .submit-button {
          width: 100%;
          background-color: #111827;
          color: white;
          padding: 8px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }
        .submit-button:hover {
          background-color: #1f2937;
        }
        .submit-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .footer-text {
          text-align: center;
          margin-top: 16px;
          font-size: 14px;
          color: #6b7280;
        }
        .link-button {
          background: none;
          border: none;
          color: #1f2937;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
        }
        .link-button:hover {
          text-decoration: underline;
        }
      `}</style>
      
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">
            {mode === 'login' ? 'Login' : 'Register'}
          </h1>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="form-container" suppressHydrationWarning>
            {mode === 'register' && (
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                value={form.name}
                onChange={handleChange}
                required
                suppressHydrationWarning
                className="input-field"
              />
            )}

            <input
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              required
              suppressHydrationWarning
              className="input-field"
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              required
              suppressHydrationWarning
              className="input-field"
            />

            <button
              type="submit"
              disabled={loading}
              suppressHydrationWarning
              className="submit-button"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>

          <div className="footer-text">
            {mode === 'login' ? (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register')
                    setError('')
                  }}
                  suppressHydrationWarning
                  className="link-button"
                >
                  Register
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setError('')
                  }}
                  suppressHydrationWarning
                  className="link-button"
                >
                  Login
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}