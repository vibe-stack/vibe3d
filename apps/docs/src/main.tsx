import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app.tsx'
import './styles.css'

const root = document.querySelector<HTMLDivElement>('#root')
if (!root) throw new Error('Missing application root')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
