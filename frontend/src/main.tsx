import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BUILD_VERSION } from './build-version'

// eslint-disable-next-line no-console
console.log('[Aegis] build', BUILD_VERSION)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
