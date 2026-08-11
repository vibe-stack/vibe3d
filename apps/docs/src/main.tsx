import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './app.tsx'
import './styles.css'

const root = document.querySelector<HTMLDivElement>('#root')
if (!root) throw new Error('Missing application root')

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
