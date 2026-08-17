/** Copy text on secure origins and on the LAN-hosted recorder fallback alike. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }

  const carrier = document.createElement('textarea')
  carrier.value = text
  carrier.readOnly = true
  carrier.style.position = 'fixed'
  carrier.style.opacity = '0'
  document.body.append(carrier)
  carrier.select()
  const copied = document.execCommand('copy')
  carrier.remove()
  if (!copied) throw new Error('The browser refused the copy')
}
