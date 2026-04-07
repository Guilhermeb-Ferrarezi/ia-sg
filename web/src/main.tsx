import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PublicLandingPage from './components/PublicLandingPage.tsx'

const isPublicLanding = window.location.pathname.startsWith('/ofertas/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicLanding ? <PublicLandingPage /> : <App />}
  </StrictMode>,
)
