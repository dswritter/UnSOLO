'use client'

import { useEffect, useState } from 'react'

const MOBILE_CHAT_COMPOSER_EVENT = 'unsolo:mobile-chat-composer'
const MOBILE_CHAT_COMPOSER_ATTR = 'data-mobile-chat-composer'

function readComposerState() {
  if (typeof document === 'undefined') return false
  return document.documentElement.getAttribute(MOBILE_CHAT_COMPOSER_ATTR) === 'active'
}

export function setMobileChatComposerActive(active: boolean) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (active) {
    root.setAttribute(MOBILE_CHAT_COMPOSER_ATTR, 'active')
  } else {
    root.removeAttribute(MOBILE_CHAT_COMPOSER_ATTR)
  }
  window.dispatchEvent(new CustomEvent(MOBILE_CHAT_COMPOSER_EVENT, { detail: { active } }))
}

export function useMobileChatComposerActive() {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    function syncState() {
      setIsActive(readComposerState())
    }

    syncState()
    window.addEventListener(MOBILE_CHAT_COMPOSER_EVENT, syncState as EventListener)

    const observer = new MutationObserver(syncState)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [MOBILE_CHAT_COMPOSER_ATTR],
    })

    return () => {
      window.removeEventListener(MOBILE_CHAT_COMPOSER_EVENT, syncState as EventListener)
      observer.disconnect()
    }
  }, [])

  return isActive
}
