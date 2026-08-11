import './style.css'

const host = document.querySelector<HTMLDivElement>('#app')

if (!host) throw new Error('Missing #app mount point')

const stop = await import('./model-browser/browser.ts').then(({ startModelBrowser }) =>
  startModelBrowser(host),
)

if (import.meta.hot) {
  import.meta.hot.dispose(stop)
}
