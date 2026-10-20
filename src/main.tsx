import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { projectStorage } from './features/project/projectStorage'
import './styles/index.css'

const container = document.getElementById('root')!
container.className = 'h-[100dvh]'
container.textContent = '正在读取手稿…'
try {
  const initialProject = await projectStorage.load()
  createRoot(container).render(<StrictMode><App initialProject={initialProject} /></StrictMode>)
} catch (error) {
  const message = document.createElement('p')
  message.textContent = `读取手稿失败：${error instanceof Error ? error.message : '请检查本地服务'}`
  const retry = document.createElement('button')
  retry.textContent = '重试'
  retry.onclick = () => location.reload()
  container.className = 'min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-8 text-sm'
  container.replaceChildren(message, retry)
}
