import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { installOfflineSupport } from './platform.ts'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
installOfflineSupport()
