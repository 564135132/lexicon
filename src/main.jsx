import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FloatingApp } from './FloatingApp'
import './styles.css'

const isFloatingWindow = new URLSearchParams(window.location.search).get('mode') === 'float'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isFloatingWindow ? <FloatingApp /> : <App />}
  </StrictMode>,
)
