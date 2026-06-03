import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import './index.css'

function Root() {
  const path = window.location.pathname
  if (path === '/reset-password') return <ResetPassword />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />)
