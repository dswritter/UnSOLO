'use client'

import { useState, useEffect, useRef, useMemo, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ImageUploadOverlay } from '@/components/ui/ImageUploadOverlay'
import { TripImageCropModal } from '@/components/hosting/TripImageCropModal'
import { TripDescriptionMarkdownToolbar } from '@/components/ui/TripDescriptionMarkdownToolbar'
import { toast } from 'sonner'
import { INTEREST_TAGS, UPLOAD_MAX_IMAGE_BYTES } from '@/lib/constants'
import { cn, formatPrice, formatFileSize } from '@/lib/utils'
import {
  createHostedTrip,
  updateHostedTrip,
  createHostDestination,
  getDestinationsPublic,
  getIncludesOptionsPublic,
  getHostTripDetail,
  checkIsHost,
} from '@/actions/hosting'
import type { JoinPreferences } from '@/types'
import {
  fetchNominatimIndiaDestinations,
  nominatimDebounceMs,
} from '@/lib/nominatim-destinations'
import { maxInclusiveSpanDays, packageDurationFullLabel } from '@/lib/package-trip-calendar'
import {
  minPricePaiseFromVariants,
  priceVariantsFromFormRows,
  type PriceVariant,
} from '@/lib/package-pricing'
import { splitInclusiveCommunityPayment } from '@/lib/community-payment'
import {
  deleteHostTripDraft,
  getHostTripDraftById,
  HOST_TRIP_DRAFT_MAX_AGE_MS,
  isHostTripCreateDraftNonEmpty,
  upsertHostTripDraft,
  type HostTripDraftPayload,
} from '@/lib/host-trip-create-draft'

const DRAFT_RETENTION_DAYS = Math.round(HOST_TRIP_DRAFT_MAX_AGE_MS / (24 * 60 * 60 * 1000))
import {
  TRIP_PREVIEW_HANDOFF_KEY,
  type HostTripPreviewPayload,
} from '@/lib/host-trip-preview-session'
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Image as ImageIcon,
  X,
  Plus,
  Loader2,
  Check,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  Tag,
  FileText,
   Eye,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'

/** Native <select> strips OS glossy styling so fields match <Input />. */
function FormSelect({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={cn(
          'h-8 w-full cursor-pointer appearance-none rounded-lg border border-border bg-secondary px-2.5 pr-8 text-sm text-foreground shadow-none outline-none transition-colors',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}

type Destination = { id: string; name: string; state: string }
type IncludesOption = { id: string; label: string }

const COVER_MENU_MIN_W = 200
const COVER_MENU_APPROX_H = 44
const COVER_LONG_PRESS_MS = 550

function clampCoverMenuPosition(clientX: number, clientY: number) {
  if (typeof window === 'undefined') return { x: clientX, y: clientY }
  const pad = 8
  return {
    x: Math.max(pad, Math.min(clientX, window.innerWidth - COVER_MENU_MIN_W - pad)),
    y: Math.max(pad, Math.min(clientY, window.innerHeight - COVER_MENU_APPROX_H - pad)),
  }
}

const STEPS = [
  { label: 'Basic Info', icon: FileText },
  { label: 'Details', icon: Calendar },
  { label: 'Images', icon: ImageIcon },
  { label: 'Preferences', icon: Users },
  { label: 'Review', icon: Check },
]

export function HostTripForm({
  editTripId,
  resumeDraftId,
}: {
  editTripId?: string
  /** When set, load this draft from local storage; plain `/host/create` always starts blank. */
  resumeDraftId?: string
}) {
  const router = useRouter()
  const isEdit = !!editTripId
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editModerationStatus, setEditModerationStatus] = useState<string | null>(null)
  const [editTripSlug, setEditTripSlug] = useState<string | null>(null)
  const [activePriceTierIndex, setActivePriceTierIndex] = useState(0)

  // Data
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [includesOptions, setIncludesOptions] = useState<IncludesOption[]>([])

  // Form state
  const [title, setTitle] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [description, setDescription] = useState('')
  const [shortDescription, setShortDescription] = useState('')

  const [priceRows, setPriceRows] = useState<{ rupees: string; facilities: string }[]>([
    { rupees: '', facilities: '' },
  ])
  const [tripDays, setTripDays] = useState('')
  const [tripNights, setTripNights] = useState('')
  const [excludeFirstTravel, setExcludeFirstTravel] = useState(true)
  const [departureTime, setDepartureTime] = useState<'morning' | 'evening'>('morning')
  const [returnTime, setReturnTime] = useState<'morning' | 'evening'>('morning')
  const [maxGroupSize, setMaxGroupSize] = useState('12')
  const [adminMaxGroupSize, setAdminMaxGroupSize] = useState(50)
  const [platformFeePercent, setPlatformFeePercent] = useState(15)
  const [standardFlow, setStandardFlow] = useState<'after_host_approval' | 'pay_on_booking'>(
    'pay_on_booking',
  )
  const [tokenDepositEnabled, setTokenDepositEnabled] = useState(false)
  const [tokenAmountRupees, setTokenAmountRupees] = useState('')
  const [difficulty, setDifficulty] = useState('moderate')
  const [scheduleRows, setScheduleRows] = useState<{ dep: string; ret: string }[]>([
    { dep: '', ret: '' },
  ])
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>([])

  const [images, setImages] = useState<string[]>([])
  const imagesRef = useRef(images)
  imagesRef.current = images
  const [coverMenu, setCoverMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  /** Files waiting for optional 16:9 crop (each has object URL for preview). */
  const [cropQueue, setCropQueue] = useState<{ file: File; url: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressCleanupRef = useRef<(() => void) | null>(null)
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const imageUrlGenerationRef = useRef(0)

  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [genderPreference, setGenderPreference] = useState<'all' | 'men' | 'women'>('all')
  const [minTripsCompleted, setMinTripsCompleted] = useState('')
  const [interestTags, setInterestTags] = useState<string[]>([])

  const [draftSessionId, setDraftSessionId] = useState<string | null>(null)
  const draftSaveNotifiedRef = useRef(false)

  useEffect(() => {
    if (!coverMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCoverMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [coverMenu])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      longPressCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    async function load() {
      const hostStatus = await checkIsHost()
      if (!hostStatus.authenticated) {
        router.push('/login')
        return
      }
      if (!hostStatus.isHost) {
        router.push('/host/verify')
        return
      }

      const [dests, includes] = await Promise.all([
        getDestinationsPublic(),
        getIncludesOptionsPublic(),
      ])
      setDestinations(dests)
      setIncludesOptions(includes)

      // Fetch admin-managed max group size
      const { createClient: cc } = await import('@/lib/supabase/client')
      const sb = cc()
      const { data: maxSetting } = await sb.from('platform_settings').select('value').eq('key', 'host_max_group_size').single()
      if (maxSetting) setAdminMaxGroupSize(parseInt(maxSetting.value) || 50)
      const { data: feeSetting } = await sb.from('platform_settings').select('value').eq('key', 'platform_fee_percent').single()
      if (feeSetting?.value != null) {
        const f = parseFloat(String(feeSetting.value).trim())
        if (Number.isFinite(f) && f >= 0 && f <= 100) setPlatformFeePercent(Math.round(f * 100) / 100)
      }

      if (editTripId) {
        const tripData = await getHostTripDetail(editTripId)
        if (!tripData) {
          toast.error('Trip not found')
          router.push('/host')
          setLoading(false)
          return
        }
        setEditModerationStatus(tripData.moderation_status ?? null)
        setEditTripSlug(typeof tripData.slug === 'string' ? tripData.slug : null)
        setTitle(tripData.title || '')
        setDestinationId(tripData.destination_id || '')
        setDescription(tripData.description || '')
        setShortDescription(tripData.short_description || '')
        const pv = tripData.price_variants as PriceVariant[] | null
        if (pv && Array.isArray(pv) && pv.length >= 2) {
          setPriceRows(pv.map((t) => ({ rupees: String(t.price_paise / 100), facilities: t.description })))
        } else {
          setPriceRows([{ rupees: String((tripData.price_paise || 0) / 100), facilities: '' }])
        }
        setTripDays(String(tripData.trip_days ?? tripData.duration_days ?? ''))
        setTripNights(String(tripData.trip_nights ?? 0))
        setExcludeFirstTravel(tripData.exclude_first_day_travel !== false)
        setDepartureTime((tripData.departure_time as 'morning' | 'evening') || 'morning')
        setReturnTime((tripData.return_time as 'morning' | 'evening') || 'morning')
        setMaxGroupSize(String(tripData.max_group_size || 12))
        setDifficulty((tripData.difficulty as string) || 'moderate')
        const deps = (tripData.departure_dates as string[] | null) || []
        const rets = (tripData.return_dates as string[] | null) || []
        if (deps.length > 0) {
          setScheduleRows(deps.map((dep, i) => ({ dep, ret: rets[i] || '' })))
        } else {
          setScheduleRows([{ dep: '', ret: '' }])
        }
        setSelectedIncludes(tripData.includes ? [...tripData.includes] : [])
        setImages(tripData.images ? [...tripData.images] : [])
        const jp = (tripData.join_preferences as JoinPreferences | null) || {}
        if (jp.min_age != null) setMinAge(String(jp.min_age))
        if (jp.max_age != null) setMaxAge(String(jp.max_age))
        setGenderPreference(
          jp.gender_preference === 'men' || jp.gender_preference === 'women' ? jp.gender_preference : 'all',
        )
        if (jp.min_trips_completed != null) setMinTripsCompleted(String(jp.min_trips_completed))
        setInterestTags(jp.interest_tags ? [...jp.interest_tags] : [])
        if (jp.payment_timing === 'pay_on_booking') {
          setStandardFlow('pay_on_booking')
          if (jp.token_deposit_enabled && jp.token_amount_paise != null && Number.isFinite(jp.token_amount_paise)) {
            setTokenDepositEnabled(true)
            setTokenAmountRupees(String(jp.token_amount_paise / 100))
          }
        } else if (jp.payment_timing === 'token_to_book') {
          setStandardFlow('pay_on_booking')
          setTokenDepositEnabled(true)
          if (jp.token_amount_paise != null && Number.isFinite(jp.token_amount_paise)) {
            setTokenAmountRupees(String(jp.token_amount_paise / 100))
          }
        } else {
          setStandardFlow('after_host_approval')
          if (jp.token_deposit_enabled && jp.token_amount_paise != null && Number.isFinite(jp.token_amount_paise)) {
            setTokenDepositEnabled(true)
            setTokenAmountRupees(String(jp.token_amount_paise / 100))
          }
        }
      } else {
        draftSaveNotifiedRef.current = false
        const resuming = resumeDraftId ? getHostTripDraftById(resumeDraftId) : null
        const newId =
          typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `draft-${Date.now()}`
        const sessionId = resuming ? resuming.id : newId
        setDraftSessionId(sessionId)

        if (resuming && isHostTripCreateDraftNonEmpty(resuming.payload)) {
          draftSaveNotifiedRef.current = true
          const draft = resuming.payload
          if (draft.destination && !dests.some((d) => d.id === draft.destination!.id)) {
            setDestinations([...dests, draft.destination].sort((a, b) => a.name.localeCompare(b.name)))
          }
          const maxStep = STEPS.length - 1
          setStep(Math.min(Math.max(0, draft.step), maxStep))
          setTitle(draft.title ?? '')
          setDestinationId(draft.destinationId ?? '')
          setDescription(draft.description ?? '')
          setShortDescription(draft.shortDescription ?? '')
          setPriceRows(
            Array.isArray(draft.priceRows) && draft.priceRows.length > 0
              ? draft.priceRows.map((r) => ({ rupees: r.rupees ?? '', facilities: r.facilities ?? '' }))
              : [{ rupees: '', facilities: '' }],
          )
          setTripDays(draft.tripDays ?? '')
          setTripNights(draft.tripNights ?? '')
          setExcludeFirstTravel(draft.excludeFirstTravel !== false)
          setDepartureTime(draft.departureTime === 'evening' ? 'evening' : 'morning')
          setReturnTime(draft.returnTime === 'evening' ? 'evening' : 'morning')
          setMaxGroupSize(draft.maxGroupSize ?? '12')
          if (draft.standardFlow === 'pay_on_booking' || draft.standardFlow === 'after_host_approval') {
            setStandardFlow(draft.standardFlow)
            setTokenDepositEnabled(!!draft.tokenDepositEnabled)
            if (draft.tokenAmountRupees) setTokenAmountRupees(draft.tokenAmountRupees)
          } else if (draft.paymentTiming === 'pay_on_booking') {
            setStandardFlow('pay_on_booking')
            setTokenDepositEnabled(!!draft.tokenDepositEnabled)
            if (draft.tokenAmountRupees) setTokenAmountRupees(draft.tokenAmountRupees)
          } else if (draft.paymentTiming === 'token_to_book') {
            setStandardFlow('pay_on_booking')
            setTokenDepositEnabled(true)
            if (draft.tokenAmountRupees) setTokenAmountRupees(draft.tokenAmountRupees)
          } else {
            setStandardFlow('after_host_approval')
            setTokenDepositEnabled(!!draft.tokenDepositEnabled)
            if (draft.tokenAmountRupees) setTokenAmountRupees(draft.tokenAmountRupees)
          }
          setDifficulty(draft.difficulty || 'moderate')
          setScheduleRows(
            Array.isArray(draft.scheduleRows) && draft.scheduleRows.length > 0
              ? draft.scheduleRows.map((r) => ({ dep: r.dep ?? '', ret: r.ret ?? '' }))
              : [{ dep: '', ret: '' }],
          )
          setSelectedIncludes(Array.isArray(draft.selectedIncludes) ? [...draft.selectedIncludes] : [])
          setImages(Array.isArray(draft.images) ? [...draft.images] : [])
          setMinAge(draft.minAge ?? '')
          setMaxAge(draft.maxAge ?? '')
          setGenderPreference(
            draft.genderPreference === 'men' || draft.genderPreference === 'women' ? draft.genderPreference : 'all',
          )
          setMinTripsCompleted(draft.minTripsCompleted ?? '')
          setInterestTags(Array.isArray(draft.interestTags) ? [...draft.interestTags] : [])
          toast.message('Continuing from your saved draft')
        } else if (resumeDraftId && !resuming) {
          toast.message('That draft was not found or may have expired. Starting a new trip.')
        }
      }

      setLoading(false)
    }
    load()
  }, [router, editTripId, resumeDraftId])

  // Tomorrow as minimum (trip can't start today)
  const tomorrow = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })()
  const today = tomorrow // alias for min attribute
  const maxDateStr = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 2)
    return d.toISOString().split('T')[0]
  })()

  const minListPricePaise = useMemo(() => {
    const amounts = priceRows
      .map((r) => Math.round(parseFloat(r.rupees || '0') * 100))
      .filter((n) => Number.isFinite(n) && n >= 100)
    if (amounts.length === 0) return null
    return Math.min(...amounts)
  }, [priceRows])

  useEffect(() => {
    setActivePriceTierIndex((i) => Math.min(i, Math.max(0, priceRows.length - 1)))
  }, [priceRows.length])

  const activeTierPricePaise = useMemo(() => {
    const idx = Math.min(Math.max(0, activePriceTierIndex), Math.max(0, priceRows.length - 1))
    const p = Math.round(parseFloat(priceRows[idx]?.rupees || '') * 100)
    if (!Number.isFinite(p) || p < 100) return null
    return p
  }, [priceRows, activePriceTierIndex])

  const activeTierSplit = useMemo(() => {
    if (activeTierPricePaise == null) return null
    return splitInclusiveCommunityPayment(activeTierPricePaise, platformFeePercent)
  }, [activeTierPricePaise, platformFeePercent])

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  const createDraftBody = useMemo((): HostTripDraftPayload => {
    const dest = destinations.find((d) => d.id === destinationId)
    return {
      step,
      title,
      destinationId,
      destination: dest ? { id: dest.id, name: dest.name, state: dest.state } : null,
      description,
      shortDescription,
      priceRows: priceRows.map((r) => ({ rupees: r.rupees, facilities: r.facilities })),
      tripDays,
      tripNights,
      excludeFirstTravel,
      departureTime,
      returnTime,
      maxGroupSize,
      standardFlow,
      tokenDepositEnabled,
      tokenAmountRupees,
      difficulty,
      scheduleRows: scheduleRows.map((r) => ({ dep: r.dep, ret: r.ret })),
      selectedIncludes: [...selectedIncludes],
      images: [...images],
      minAge,
      maxAge,
      genderPreference,
      minTripsCompleted,
      interestTags: [...interestTags],
    }
  }, [
    step,
    title,
    destinationId,
    destinations,
    description,
    shortDescription,
    priceRows,
    tripDays,
    tripNights,
    excludeFirstTravel,
    departureTime,
    returnTime,
    maxGroupSize,
    standardFlow,
    tokenDepositEnabled,
    tokenAmountRupees,
    difficulty,
    scheduleRows,
    selectedIncludes,
    images,
    minAge,
    maxAge,
    genderPreference,
    minTripsCompleted,
    interestTags,
  ])

  const createDraftRisky = useMemo(
    () => !isEdit && isHostTripCreateDraftNonEmpty(createDraftBody),
    [isEdit, createDraftBody],
  )

  const createDraftRiskyRef = useRef(false)
  createDraftRiskyRef.current = createDraftRisky

  useEffect(() => {
    if (isEdit || loading || !draftSessionId) return
    const t = window.setTimeout(() => {
      if (isHostTripCreateDraftNonEmpty(createDraftBody)) {
        upsertHostTripDraft(draftSessionId, createDraftBody)
        if (!draftSaveNotifiedRef.current) {
          draftSaveNotifiedRef.current = true
          toast.message(
            `Draft saved on this device. Drafts you do not open for ${DRAFT_RETENTION_DAYS} days are removed automatically.`,
            { duration: 6500 },
          )
        }
      } else {
        deleteHostTripDraft(draftSessionId)
        draftSaveNotifiedRef.current = false
      }
    }, 900)
    return () => clearTimeout(t)
  }, [isEdit, loading, draftSessionId, createDraftBody])

  useEffect(() => {
    if (isEdit) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!createDraftRiskyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isEdit])

  useEffect(() => {
    if (isEdit || loading) return
    const onClickCapture = (e: MouseEvent) => {
      if (!createDraftRiskyRef.current) return
      const el = e.target as HTMLElement | null
      if (!el) return
      const a = el.closest('a[href]') as HTMLAnchorElement | null
      if (!a) return
      if (a.target === '_blank' || a.hasAttribute('download')) return
      const hrefAttr = a.getAttribute('href')
      if (!hrefAttr || hrefAttr.startsWith('#')) return
      if (hrefAttr.startsWith('mailto:') || hrefAttr.startsWith('tel:')) return
      let url: URL
      try {
        url = new URL(hrefAttr, window.location.origin)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setPendingNavigation(url.pathname + url.search + url.hash)
      setLeaveDialogOpen(true)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [isEdit, loading])

  function requestNavigateAway(href: string) {
    if (isEdit || !createDraftRisky) {
      router.push(href)
      return
    }
    setPendingNavigation(href)
    setLeaveDialogOpen(true)
  }

  function confirmLeaveKeepDraft() {
    const href = pendingNavigation
    if (draftSessionId && isHostTripCreateDraftNonEmpty(createDraftBody)) {
      upsertHostTripDraft(draftSessionId, createDraftBody)
    }
    setLeaveDialogOpen(false)
    setPendingNavigation(null)
    if (href) router.push(href)
  }

  function confirmLeaveDiscardDraft() {
    const href = pendingNavigation
    if (draftSessionId) deleteHostTripDraft(draftSessionId)
    draftSaveNotifiedRef.current = false
    setLeaveDialogOpen(false)
    setPendingNavigation(null)
    if (href) router.push(href)
  }

  function cancelLeaveDialog() {
    setLeaveDialogOpen(false)
    setPendingNavigation(null)
  }

  useEffect(() => {
    if (!leaveDialogOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLeaveDialogOpen(false)
        setPendingNavigation(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leaveDialogOpen])

  function addPriceRow() {
    const nextIdx = priceRows.length
    setPriceRows((prev) => [...prev, { rupees: '', facilities: '' }])
    setActivePriceTierIndex(nextIdx)
  }

  function removePriceRow(i: number) {
    setPriceRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
    setActivePriceTierIndex((idx) => {
      if (i < idx) return idx - 1
      if (i === idx) return Math.max(0, idx - 1)
      return idx
    })
  }

  function updatePriceRow(i: number, field: 'rupees' | 'facilities', value: string) {
    setPriceRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)))
  }

  function cancelFileUpload() {
    uploadAbortRef.current?.abort()
  }

  function handleCropModalClose() {
    setCropQueue((q) => {
      if (q.length === 0) return q
      const [first, ...rest] = q
      URL.revokeObjectURL(first.url)
      return rest
    })
  }

  async function handleCropConfirm(file: File, source: { file: File; url: string }) {
    const ac = new AbortController()
    uploadAbortRef.current = ac
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('purpose', 'host_trip')
      const res = await fetch('/api/upload', { method: 'POST', body: fd, signal: ac.signal })
      const json = await res.json()
      if (json.url) {
        setImages((prev) => [...prev, json.url])
        URL.revokeObjectURL(source.url)
        setCropQueue((q) => q.slice(1))
      } else {
        toast.error(json.error || 'Upload failed')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.message('Upload cancelled')
      } else if (err instanceof Error && err.name === 'AbortError') {
        toast.message('Upload cancelled')
      } else {
        toast.error('Upload failed')
      }
    } finally {
      uploadAbortRef.current = null
      setUploading(false)
    }
  }

  /** Validate size/type, then open crop step for each file (sequential modals). */
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return

    const next: { file: File; url: string }[] = []
    for (const file of Array.from(files)) {
      if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
        toast.error(
          `${file.name}: ${formatFileSize(file.size)} — max ${formatFileSize(UPLOAD_MAX_IMAGE_BYTES)} per image.`,
        )
        continue
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not a supported image type (JPEG, PNG, or WebP).`)
        continue
      }
      next.push({ file, url: URL.createObjectURL(file) })
    }
    if (next.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setCropQueue((q) => [...q, ...next])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const [imageLoading, setImageLoading] = useState(false)

  function cancelImageUrlLoad() {
    imageUrlGenerationRef.current += 1
    setImageLoading(false)
  }

  async function addImageUrl() {
    const url = imageUrlInput.trim()
    if (!url) return

    const gen = ++imageUrlGenerationRef.current
    setImageLoading(true)
    let finalUrl = url

    // Convert Unsplash page URLs to direct image URLs
    if (url.includes('unsplash.com/photos/') && !url.includes('images.unsplash.com')) {
      const parts = url.split('/photos/')
      if (parts[1]) {
        const slug = parts[1].split('?')[0].split('/')[0]
        // Extract photo ID (last segment after last hyphen, or full slug if no hyphens)
        const photoId = slug.includes('-') ? slug.split('-').pop() : slug
        // Try multiple Unsplash URL formats
        const candidates = [
          `https://images.unsplash.com/photo-${photoId}?w=1200&q=80`,
          `https://images.unsplash.com/${photoId}?w=1200&q=80`,
        ]
        let found = false
        for (const candidate of candidates) {
          try {
            const img = new Image()
            const loaded = await new Promise<boolean>((resolve) => {
              img.onload = () => resolve(true)
              img.onerror = () => resolve(false)
              img.src = candidate
              setTimeout(() => resolve(false), 5000)
            })
            if (loaded) {
              finalUrl = candidate
              found = true
              break
            }
          } catch { /* try next */ }
        }
        if (!found) {
          toast.error('Could not load Unsplash image. Try right-clicking the image → "Copy image address" and paste that instead.')
          if (gen === imageUrlGenerationRef.current) setImageLoading(false)
          return
        }
      }
    }

    if (gen !== imageUrlGenerationRef.current) return

    // Validate that the URL loads as an image
    try {
      const img = new Image()
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = finalUrl
        setTimeout(() => resolve(false), 8000)
      })
      if (gen !== imageUrlGenerationRef.current) return
      if (!loaded) {
        toast.error('Image could not be loaded. Check the URL or try uploading instead.')
        setImageLoading(false)
        return
      }
    } catch {
      if (gen !== imageUrlGenerationRef.current) return
      toast.error('Invalid image URL')
      setImageLoading(false)
      return
    }

    if (gen !== imageUrlGenerationRef.current) return
    setImages(prev => [...prev, finalUrl])
    setImageUrlInput('')
    setImageLoading(false)
    toast.success('Image added!')
  }

  function removeImage(idx: number) {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  function clearCoverLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressCleanupRef.current?.()
    longPressCleanupRef.current = null
  }

  function moveImageToCover(idx: number) {
    if (idx <= 0 || idx >= imagesRef.current.length) return
    setImages(prev => {
      if (idx <= 0 || idx >= prev.length) return prev
      const next = [...prev]
      const [chosen] = next.splice(idx, 1)
      return [chosen, ...next]
    })
    toast.success('Cover image updated', { id: 'trip-cover-image-updated' })
  }

  function startCoverLongPress(i: number, e: React.PointerEvent) {
    if (e.button !== 0) return
    const n = imagesRef.current.length
    if (n < 2 || i === 0) return
    clearCoverLongPress()
    const onEnd = () => clearCoverLongPress()
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    longPressCleanupRef.current = () => {
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      longPressCleanupRef.current?.()
      longPressCleanupRef.current = null
      moveImageToCover(i)
    }, COVER_LONG_PRESS_MS)
  }

  function addScheduleRow() {
    setScheduleRows((prev) => [...prev, { dep: '', ret: '' }])
  }

  function updateScheduleRow(idx: number, field: 'dep' | 'ret', value: string) {
    if (value && value.length === 10 && value < tomorrow) {
      toast.error(field === 'dep' ? 'Departure date must be in the future' : 'Return date must be in the future')
      return
    }
    setScheduleRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    )
  }

  function removeScheduleRow(idx: number) {
    setScheduleRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  function toggleInclude(label: string) {
    setSelectedIncludes(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    )
  }

  function toggleInterestTag(tag: string) {
    setInterestTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  // Validation per step
  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!title.trim() && !!destinationId && !!description.trim()
      case 1: {
        const pairs = scheduleRows.filter((r) => r.dep && r.ret)
        if (!tripDays || !tripNights || pairs.length === 0) return false
        if (priceRows.length >= 2) {
          return priceRows.every((r) => {
            const p = Math.round(parseFloat(r.rupees) * 100)
            return r.facilities.trim() && Number.isFinite(p) && p >= 100
          })
        }
        const p0 = Math.round(parseFloat(priceRows[0]?.rupees || '') * 100)
        return Number.isFinite(p0) && p0 >= 100
      }
      case 2:
        return images.length > 0
      case 3: {
        if (!tokenDepositEnabled) return true
        const t = Math.round(parseFloat(tokenAmountRupees) * 100)
        if (!Number.isFinite(t) || t < 100) return false
        if (priceRows.length >= 2) {
          const tiers = priceRows.map((r) => Math.round(parseFloat(r.rupees) * 100))
          const minP = Math.min(...tiers)
          return Number.isFinite(minP) && t <= minP
        }
        const p0 = Math.round(parseFloat(priceRows[0]?.rupees || '') * 100)
        return Number.isFinite(p0) && t <= p0
      }
      case 4:
        return true
      default:
        return false
    }
  }

  function handleSubmit() {
    let pricePaise: number
    let price_variants: PriceVariant[] | null = null
    if (priceRows.length >= 2) {
      try {
        const rows = priceRows.map((r) => ({
          pricePaise: Math.round(parseFloat(r.rupees) * 100),
          facilities: r.facilities,
        }))
        const tiersBuilt = priceVariantsFromFormRows(rows)
        if (!tiersBuilt) throw new Error('Invalid price tiers')
        price_variants = tiersBuilt
        pricePaise = minPricePaiseFromVariants(tiersBuilt)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Invalid price tiers')
        return
      }
    } else {
      pricePaise = Math.round(parseFloat(priceRows[0]?.rupees || '') * 100)
      if (!Number.isFinite(pricePaise) || pricePaise < 100) {
        toast.error('Enter a valid price per person (minimum ₹1)')
        return
      }
    }

    const pairs = scheduleRows
      .filter((r) => r.dep && r.ret)
      .map((r) => ({ dep: r.dep, ret: r.ret }))
    if (pairs.length === 0) {
      toast.error('Add at least one departure date and return date')
      return
    }
    for (const p of pairs) {
      if (p.ret < p.dep) {
        toast.error('Return date must be on or after departure for every row')
        return
      }
    }
    const td = parseInt(tripDays, 10)
    const tn = parseInt(tripNights, 10)
    if (!Number.isFinite(td) || td < 1 || !Number.isFinite(tn) || tn < 0) {
      toast.error('Enter valid trip days (≥1) and nights (≥0)')
      return
    }
    const duration_days = maxInclusiveSpanDays(pairs)

    const join_preferences: JoinPreferences = {
      gender_preference: genderPreference !== 'all' ? genderPreference : undefined,
      min_trips_completed: minTripsCompleted ? parseInt(minTripsCompleted, 10) : undefined,
      interest_tags: interestTags.length > 0 ? interestTags : undefined,
      payment_timing: standardFlow,
    }
    if (tokenDepositEnabled) {
      const tokenPaise = Math.round(parseFloat(tokenAmountRupees) * 100)
      if (!Number.isFinite(tokenPaise) || tokenPaise < 100) {
        toast.error('Enter a valid token amount per person (minimum ₹1)')
        return
      }
      if (tokenPaise > pricePaise) {
        toast.error('Token amount cannot exceed your listed price per person')
        return
      }
      join_preferences.token_deposit_enabled = true
      join_preferences.token_amount_paise = tokenPaise
    }
    if (minAge.trim()) {
      const a = parseInt(minAge, 10)
      if (Number.isFinite(a)) join_preferences.min_age = a
    }
    if (maxAge.trim()) {
      const a = parseInt(maxAge, 10)
      if (Number.isFinite(a)) join_preferences.max_age = a
    }

    void (async () => {
      setIsSubmitting(true)
      try {
        if (isEdit && editTripId) {
          const result = await updateHostedTrip(editTripId, {
            title: title.trim(),
            destination_id: destinationId,
            description: description.trim(),
            short_description: shortDescription.trim() || null,
            price_paise: pricePaise,
            price_variants,
            duration_days,
            trip_days: td,
            trip_nights: tn,
            exclude_first_day_travel: excludeFirstTravel,
            departure_time: departureTime,
            return_time: returnTime,
            departure_dates: pairs.map((p) => p.dep),
            return_dates: pairs.map((p) => p.ret),
            max_group_size: parseInt(maxGroupSize, 10) || 12,
            difficulty,
            includes: selectedIncludes,
            images,
            join_preferences,
          })
          if (result.error) {
            toast.error(result.error)
          } else {
            if (result.needsReapproval) {
              toast.success('Saved. This update requires admin review; your trip stays visible.')
            } else {
              toast.success('Trip updated.')
            }
            router.push(`/host/${editTripId}`)
          }
          return
        }

        const result = await createHostedTrip({
          title: title.trim(),
          destination_id: destinationId,
          description: description.trim(),
          short_description: shortDescription.trim() || undefined,
          price_paise: pricePaise,
          price_variants,
          duration_days,
          trip_days: td,
          trip_nights: tn,
          exclude_first_day_travel: excludeFirstTravel,
          departure_time: departureTime,
          return_time: returnTime,
          departure_dates: pairs.map((p) => p.dep),
          return_dates: pairs.map((p) => p.ret),
          max_group_size: parseInt(maxGroupSize, 10) || 12,
          difficulty,
          includes: selectedIncludes,
          images,
          join_preferences,
        })

        if (result.error) {
          toast.error(result.error)
        } else {
          toast.success('Trip created! It will be reviewed by our team before going live.')
          if (draftSessionId) deleteHostTripDraft(draftSessionId)
          router.push('/host')
        }
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const selectedDest = destinations.find(d => d.id === destinationId)

  return (
    <div className="min-h-[100dvh] w-full">
      <ImageUploadOverlay
        open={uploading}
        message="Uploading images…"
        subMessage="Please keep this tab open."
        onCancel={cancelFileUpload}
      />
      <ImageUploadOverlay
        open={imageLoading}
        message="Loading image…"
        subMessage="Validating the image URL"
        onCancel={cancelImageUrlLoad}
      />
      {cropQueue[0] && !uploading && (
        <TripImageCropModal
          imageSrc={cropQueue[0].url}
          originalFile={cropQueue[0].file}
          onClose={handleCropModalClose}
          onConfirm={(f) => {
            const src = cropQueue[0]
            if (src) void handleCropConfirm(f, src)
          }}
        />
      )}
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              requestNavigateAway(isEdit && editTripId ? `/host/${editTripId}` : '/host')
            }
            className="text-muted-foreground mb-4 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            {isEdit ? 'Back to trip' : 'Back to Dashboard'}
          </Button>
          <h1 className="text-3xl font-black">
            {isEdit ? (
              <>
                Edit <span className="text-primary">Trip</span>
              </>
            ) : (
              <>
                Create a <span className="text-primary">Trip</span>
              </>
            )}
          </h1>
          {isEdit && (
            <p className="text-muted-foreground mt-1">
              Update any part of your listing. Operational changes (dates, capacity, trip length, times) go live without admin review on approved trips.
            </p>
          )}
          {isEdit && editModerationStatus === 'approved' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 mt-4">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                This trip is live. Adding dates, changing max group size, trip days/nights, or departure/return times
                saves immediately with no downtime. If you change title, description, price, photos, destination,
                difficulty, includes, or join settings, we may send it for a quick admin review while it stays visible.
              </p>
            </div>
          )}
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = i === step
            const isDone = i < step
            const canJump = isEdit || i < step
            return (
              <button
                key={i}
                type="button"
                title={isEdit ? `Go to ${s.label}` : isDone ? `Back to ${s.label}` : undefined}
                onClick={() => {
                  if (isEdit) setStep(i)
                  else if (i < step) setStep(i)
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                    ? 'bg-primary/10 text-primary cursor-pointer'
                    : canJump
                    ? 'bg-secondary text-muted-foreground hover:bg-muted cursor-pointer'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-70'
                }`}
              >
                {isDone ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            )
          })}
        </div>

        {/* Step Content */}
        <div className="rounded-xl border border-border bg-card p-6">
          {/* Step 1: Basic Info */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Basic Information</h2>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Trip Title *</label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Kasol Backpacking Adventure"
                  className="bg-secondary border-border"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Destination *</label>
                <DestinationSearch
                  destinations={destinations}
                  value={destinationId}
                  onChange={setDestinationId}
                  onDestinationCreated={(d) =>
                    setDestinations((prev) =>
                      prev.some((x) => x.id === d.id) ? prev : [...prev, d].sort((a, b) => a.name.localeCompare(b.name)),
                    )
                  }
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Short Description</label>
                <Input
                  value={shortDescription}
                  onChange={e => setShortDescription(e.target.value)}
                  placeholder="One-liner that appears on trip cards"
                  className="bg-secondary border-border"
                  maxLength={150}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Full Description *</label>
                <TripDescriptionMarkdownToolbar
                  textareaRef={descriptionTextareaRef}
                  value={description}
                  onChange={setDescription}
                  className="mb-2"
                />
                <textarea
                  ref={descriptionTextareaRef}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={8}
                  placeholder="Describe your trip in detail — what travelers can expect, itinerary highlights, etc."
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-y min-h-[120px]"
                />
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Trip Details</h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-sm text-muted-foreground">
                    Price per person (INR) *{priceRows.length >= 2 ? ' — accommodation / options' : ''}
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs"
                    onClick={addPriceRow}
                  >
                    <Plus className="h-3 w-3" />
                    Add price option
                  </Button>
                </div>
                <div className="space-y-3">
                  {priceRows.map((row, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg border bg-secondary/30 p-3 space-y-2 transition-shadow',
                        priceRows.length >= 2 && i === activePriceTierIndex
                          ? 'border-primary ring-2 ring-primary/35'
                          : 'border-border',
                      )}
                      onMouseDown={() => priceRows.length >= 2 && setActivePriceTierIndex(i)}
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[120px]">
                          <span className="text-[10px] text-muted-foreground block mb-1">Price (INR)</span>
                          <Input
                            type="number"
                            value={row.rupees}
                            onChange={(e) => updatePriceRow(i, 'rupees', e.target.value)}
                            onFocus={() => setActivePriceTierIndex(i)}
                            placeholder="8999"
                            className="bg-secondary border-border"
                            min="1"
                          />
                        </div>
                        {priceRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePriceRow(i)}
                            className="p-2 text-red-400 hover:text-red-300"
                            title="Remove tier"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {priceRows.length >= 2 && (
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-1">
                            What&apos;s included / accommodation type *
                          </span>
                          <Input
                            value={row.facilities}
                            onChange={(e) => updatePriceRow(i, 'facilities', e.target.value)}
                            onFocus={() => setActivePriceTierIndex(i)}
                            placeholder="e.g. Shared dorm · 4-bed · common washrooms"
                            className="bg-secondary border-border text-sm"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {priceRows.length === 1 && priceRows[0].rupees && (
                  <p className="text-xs text-muted-foreground">
                    Listed from {formatPrice(Math.round(parseFloat(priceRows[0].rupees || '0') * 100))} / person
                  </p>
                )}
                {priceRows.length >= 2 && (
                  <p className="text-xs text-muted-foreground">
                    Listing shows the lowest tier; travelers choose their option when booking.
                  </p>
                )}
                {activeTierSplit && activeTierPricePaise != null && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-1.5">
                    <p className="font-semibold text-foreground">How your list price splits</p>
                    <p className="text-xs text-muted-foreground">
                      Travelers pay the price you list — nothing extra is added at checkout. UnSOLO keeps a{' '}
                      {platformFeePercent}% platform fee from that amount; the rest is your estimated payout below.
                    </p>
                    {priceRows.length >= 2 && (
                      <p className="text-[10px] text-muted-foreground">
                        Showing the tier you&apos;re editing (click a tier to compare).
                      </p>
                    )}
                    <ul className="text-xs space-y-0.5 pt-1">
                      <li className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          Traveler pays (per person{priceRows.length >= 2 ? ', this tier' : ''})
                        </span>
                        <span className="font-medium tabular-nums">{formatPrice(activeTierPricePaise)}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Platform ({platformFeePercent}%)</span>
                        <span className="tabular-nums">{formatPrice(activeTierSplit.platformFeePaise)}</span>
                      </li>
                      <li className="flex justify-between gap-2 font-medium text-primary">
                        <span>Your estimated payout (per person)</span>
                        <span className="tabular-nums">{formatPrice(activeTierSplit.hostPaise)}</span>
                      </li>
                    </ul>
                    {priceRows.length >= 2 && (
                      <p className="text-[10px] text-muted-foreground pt-1">
                        Same logic applies to each tier: fee is taken from that tier&apos;s price.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Trip days (on trip) *</label>
                  <Input
                    type="number"
                    value={tripDays}
                    onChange={(e) => setTripDays(e.target.value)}
                    placeholder="e.g. 4"
                    className="bg-secondary border-border"
                    min="1"
                    max="60"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Trip nights (on trip) *</label>
                  <Input
                    type="number"
                    value={tripNights}
                    onChange={(e) => setTripNights(e.target.value)}
                    placeholder="e.g. 3"
                    className="bg-secondary border-border"
                    min="0"
                    max="60"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer text-foreground">
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary"
                      checked={excludeFirstTravel}
                      onChange={(e) => setExcludeFirstTravel(e.target.checked)}
                    />
                    <span>
                      Day 1 / night 1 is travel only — don&apos;t count it in the trip days &amp; nights above
                      <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                        On by default. Turn off if your first day/night is part of the advertised experience.
                      </span>
                    </span>
                  </label>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Departure time (leave)</label>
                  <FormSelect value={departureTime} onChange={e => setDepartureTime(e.target.value as 'morning' | 'evening')}>
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                  </FormSelect>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Return / arrival time</label>
                  <FormSelect value={returnTime} onChange={e => setReturnTime(e.target.value as 'morning' | 'evening')}>
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                  </FormSelect>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Max Group Size (limit: {adminMaxGroupSize})</label>
                  <Input
                    type="number"
                    value={maxGroupSize}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (v > adminMaxGroupSize) {
                        toast.error(`Maximum group size allowed is ${adminMaxGroupSize}`)
                        setMaxGroupSize(String(adminMaxGroupSize))
                      } else {
                        setMaxGroupSize(e.target.value)
                      }
                    }}
                    placeholder="12"
                    className="bg-secondary border-border"
                    min="2"
                    max={adminMaxGroupSize}
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Difficulty</label>
                  <FormSelect value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                    <option value="easy">Easy</option>
                    <option value="moderate">Moderate</option>
                    <option value="challenging">Challenging</option>
                  </FormSelect>
                </div>
              </div>

              {/* Duration summary */}
              {tripDays && tripNights && (
                <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm space-y-1">
                  <p className="font-bold text-primary">
                    {packageDurationFullLabel({
                      duration_days: Math.max(1, parseInt(tripDays, 10) || 1),
                      trip_days: parseInt(tripDays, 10) || 1,
                      trip_nights: parseInt(tripNights, 10) || 0,
                      exclude_first_day_travel: excludeFirstTravel,
                      departure_time: departureTime,
                      return_time: returnTime,
                    })}
                  </p>
                  {scheduleRows.some((r) => r.dep && r.ret) && (
                    <p className="text-xs text-muted-foreground">
                      Calendar span for bookings: up to{' '}
                      {maxInclusiveSpanDays(
                        scheduleRows.filter((r) => r.dep && r.ret).map((r) => ({ dep: r.dep, ret: r.ret })),
                      )}{' '}
                      day(s) inclusive (from your departure → return dates).
                    </p>
                  )}
                </div>
              )}

              {/* Departure + return (no auto end date) */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Offered departures *
                </label>
                <div className="space-y-3 mb-3">
                  {scheduleRows.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-1">Departure date</span>
                        <Input
                          type="date"
                          min={today}
                          max={maxDateStr}
                          value={row.dep}
                          onChange={(e) => updateScheduleRow(i, 'dep', e.target.value)}
                          className="bg-secondary border-border text-sm w-[160px]"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-1">Return / arrival date</span>
                        <Input
                          type="date"
                          min={row.dep || today}
                          max={maxDateStr}
                          value={row.ret}
                          onChange={(e) => updateScheduleRow(i, 'ret', e.target.value)}
                          className="bg-secondary border-border text-sm w-[160px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeScheduleRow(i)}
                        className="text-red-400 hover:text-red-300 p-2"
                        title="Remove row"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" type="button" onClick={addScheduleRow}>
                  <Plus className="h-3 w-3" /> Add another departure
                </Button>
              </div>

              {/* Includes */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  What&apos;s Included
                </label>
                <div className="flex flex-wrap gap-2">
                  {includesOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => toggleInclude(opt.label)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        selectedIncludes.includes(opt.label)
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {selectedIncludes.includes(opt.label) && (
                        <Check className="h-3 w-3 inline mr-1" />
                      )}
                      {opt.label}
                    </button>
                  ))}
                  {/* Custom includes that aren't in the standard list */}
                  {selectedIncludes.filter(s => !includesOptions.find(o => o.label === s)).map(custom => (
                    <button
                      key={custom}
                      onClick={() => toggleInclude(custom)}
                      className="px-3 py-1.5 rounded-lg text-sm border bg-primary/10 border-primary text-primary"
                    >
                      <Check className="h-3 w-3 inline mr-1" />{custom}
                    </button>
                  ))}
                </div>
                {/* Add custom include */}
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Add custom (e.g. Yoga Mats)"
                    className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm flex-1 max-w-[250px] focus:outline-none focus:border-primary"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = (e.target as HTMLInputElement).value.trim()
                        if (val && !selectedIncludes.includes(val)) {
                          setSelectedIncludes(prev => [...prev, val])
                          ;(e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground self-center">Press Enter</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Images */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Trip Images</h2>
              <p className="text-sm text-muted-foreground">
                Add at least one image. Use 16:9 ratio photos for best display (e.g. 1920×1080).
              </p>
              {images.length >= 2 && (
                <p className="text-xs text-muted-foreground">
                  First image is the cover. Right-click an image (desktop) or press and hold (mobile) on any other image to make it the cover.
                </p>
              )}

              {/* Current images */}
              {images.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {images.map((url, i) => (
                    <div key={`${url}-${i}`} className="relative group">
                      <div
                        className="relative touch-manipulation select-none rounded-lg overflow-hidden"
                        style={{ WebkitTouchCallout: 'none' }}
                        onContextMenu={e => {
                          if (images.length < 2 || i === 0) return
                          e.preventDefault()
                          const { x, y } = clampCoverMenuPosition(e.clientX, e.clientY)
                          setCoverMenu({ x, y, index: i })
                        }}
                        onPointerDown={e => startCoverLongPress(i, e)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          draggable={false}
                          className="h-24 w-36 rounded-lg object-cover border border-border pointer-events-none"
                        />
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                            Cover
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute -top-2 -right-2 z-10 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex h-24 w-36 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/20 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-secondary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Add image from device"
                  >
                    <Plus className="h-7 w-7" />
                    <span className="mt-1 text-[10px] font-medium">Add image</span>
                  </button>
                </div>
              )}

              <div className="flex gap-2 items-center flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3 w-3" />
                  {uploading ? 'Uploading...' : 'Upload from Device'}
                </Button>
                <span className="text-muted-foreground text-xs">or</span>
                <Input
                  value={imageUrlInput}
                  onChange={e => setImageUrlInput(e.target.value)}
                  placeholder="Paste image URL..."
                  className="bg-secondary border-border text-sm max-w-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addImageUrl()
                    }
                  }}
                />
                <Button size="sm" variant="outline" className="gap-1.5" onClick={addImageUrl} disabled={imageLoading || !imageUrlInput.trim()}>
                  {imageLoading ? (
                    <><span className="h-3 w-3 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Validating...</>
                  ) : (
                    <><ImageIcon className="h-3 w-3" /> Add URL</>
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Max {formatFileSize(UPLOAD_MAX_IMAGE_BYTES)} per file (JPEG, PNG, or WebP).
              </p>

              {coverMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[100] cursor-default bg-transparent"
                    aria-label="Close cover menu"
                    onClick={() => setCoverMenu(null)}
                  />
                  <div
                    role="menu"
                    className="fixed z-[101] min-w-[200px] rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
                    style={{ left: coverMenu.x, top: coverMenu.y }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center rounded-sm px-3 py-2 text-left text-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        const idx = coverMenu.index
                        setCoverMenu(null)
                        moveImageToCover(idx)
                      }}
                    >
                      Set as cover image
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Join Preferences */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Join Preferences</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Booking &amp; payment</label>
                </div>

                {/* Standard: join-request flow OR immediate full payment (choose one) */}
                <div className="rounded-xl border border-border bg-secondary/25 p-3 sm:p-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Either gate the trip with join requests, or let travelers book and pay from the trip page right away.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setStandardFlow('after_host_approval')}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        standardFlow === 'after_host_approval'
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="font-semibold block">Request first, pay after you approve</span>
                      <span className="text-xs mt-1 block opacity-90">
                        Travelers send a join request; they only pay once you approve (default).
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStandardFlow('pay_on_booking')}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        standardFlow === 'pay_on_booking'
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="font-semibold block">Book &amp; pay immediately</span>
                      <span className="text-xs mt-1 block opacity-90">
                        Open checkout: travelers pay from the trip page when they book.
                      </span>
                    </button>
                  </div>
                </div>

                {/* Token: optional add-on for either standard option */}
                <div className="rounded-xl border border-border bg-secondary/25 p-3 sm:p-4 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Token deposit — optional add-on
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Turn on to require a per-person deposit first; travelers settle the rest from My Trips or can pay in
                    full at checkout. Works with request-first or immediate booking.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTokenDepositEnabled((v) => !v)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                      tokenDepositEnabled
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="font-semibold block">Token to book</span>
                    <span className="text-xs mt-1 block opacity-90">
                      You set the token per person; UnSOLO handles balance reminders and checkout choices.
                    </span>
                  </button>
                </div>
              </div>
              {tokenDepositEnabled && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Token amount (per person)</label>
                  <div className="flex items-center gap-2 max-w-xs">
                    <span className="text-muted-foreground text-sm">₹</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 500"
                      value={tokenAmountRupees}
                      onChange={(e) => setTokenAmountRupees(e.target.value.replace(/[^\d.]/g, ''))}
                      className="bg-secondary border-border"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Charged once per guest at checkout. Wallet credits and promos apply to the full trip total.
                  </p>
                </div>
              )}
              {standardFlow === 'pay_on_booking' && (
                <p className="text-xs text-amber-600/90 dark:text-amber-400/90">
                  Note: gender and &quot;min trips completed&quot; filters only apply when you use request-first
                  booking. Immediate checkout does not enforce them yet.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Min Trips Completed
                  </label>
                  <Input
                    type="number"
                    value={minTripsCompleted}
                    onChange={e => setMinTripsCompleted(e.target.value)}
                    placeholder="e.g. 1"
                    className="bg-secondary border-border"
                    min="0"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Gender Preference
                  </label>
                  <div className="flex gap-2">
                    {(['all', 'men', 'women'] as const).map(g => (
                      <button
                        key={g}
                        onClick={() => setGenderPreference(g)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors capitalize ${
                          genderPreference === g
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-secondary border-border text-muted-foreground'
                        }`}
                      >
                        {g === 'all' ? 'Everyone' : g === 'men' ? 'Men Only' : 'Women Only'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Interest Tags */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Preferred Interest Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleInterestTag(tag)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        interestTags.includes(tag)
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {interestTags.includes(tag) && (
                        <Check className="h-3 w-3 inline mr-1" />
                      )}
                      {tag}
                    </button>
                  ))}
                  {/* Custom tags not in standard list */}
                  {interestTags.filter(t => !(INTEREST_TAGS as readonly string[]).includes(t)).map(custom => (
                    <button
                      key={custom}
                      onClick={() => toggleInterestTag(custom)}
                      className="px-3 py-1.5 rounded-lg text-sm border bg-primary/10 border-primary text-primary"
                    >
                      <Check className="h-3 w-3 inline mr-1" />{custom}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Add custom tag (e.g. Stargazing)"
                    className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm flex-1 max-w-[250px] focus:outline-none focus:border-primary"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = (e.target as HTMLInputElement).value.trim()
                        if (val && !interestTags.includes(val)) {
                          toggleInterestTag(val)
                          ;(e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground self-center">Press Enter</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Review Your Trip</h2>
              <p className="text-sm text-muted-foreground">
                Double-check everything before submitting. Your trip will be reviewed by our team.
              </p>

              <div className="space-y-4">
                {/* Basic Info */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" /> Basic Info
                    </h3>
                    <button
                      onClick={() => setStep(0)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-foreground font-medium">{title}</p>
                  {selectedDest && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {selectedDest.name}, {selectedDest.state}
                    </p>
                  )}
                  {shortDescription && (
                    <p className="text-sm text-muted-foreground">{shortDescription}</p>
                  )}
                </div>

                {/* Details */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" /> Details
                    </h3>
                    <button
                      onClick={() => setStep(1)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-1">
                        <IndianRupee className="h-3.5 w-3.5 text-primary" />
                        {(() => {
                          const amounts = priceRows
                            .map((r) => Math.round(parseFloat(r.rupees || '0') * 100))
                            .filter((n) => Number.isFinite(n) && n >= 100)
                          if (priceRows.length >= 2 && amounts.length > 0) {
                            return <>From {formatPrice(Math.min(...amounts))} / person</>
                          }
                          return <>{formatPrice(amounts[0] || 0)} / person</>
                        })()}
                      </span>
                      {priceRows.length >= 2 && (
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                          {priceRows.map((r, i) => (
                            <li key={i}>
                              {formatPrice(Math.round(parseFloat(r.rupees || '0') * 100))} — {r.facilities || '—'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </span>
                    <span>
                      {tripDays}D · {tripNights}N · departs {departureTime} · returns {returnTime}
                      {excludeFirstTravel ? ' · travel day excluded from counts' : ''}
                    </span>
                    <span>Max {maxGroupSize} people</span>
                    <span className="capitalize">{difficulty}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {scheduleRows
                      .filter((r) => r.dep && r.ret)
                      .map((r, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {new Date(r.dep + 'T00:00:00').toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          →{' '}
                          {new Date(r.ret + 'T00:00:00').toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Badge>
                      ))}
                  </div>
                  {selectedIncludes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedIncludes.map(inc => (
                        <Badge key={inc} variant="outline" className="text-xs">
                          {inc}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Images */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-primary" /> Images
                    </h3>
                    <button
                      onClick={() => setStep(2)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {images.map((url, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="h-16 w-24 rounded-lg object-cover border border-border"
                      />
                    ))}
                  </div>
                </div>

                {/* Preferences */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Join Preferences
                    </h3>
                    <button
                      onClick={() => setStep(3)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {standardFlow === 'pay_on_booking' ? 'Book & pay immediately' : 'Request first, pay after approval'}
                      {tokenDepositEnabled
                        ? ` · Token deposit${tokenAmountRupees.trim() ? ` (₹${tokenAmountRupees.trim()}/person)` : ''}`
                        : ''}
                    </span>
                    {genderPreference !== 'all' && (
                      <span className="capitalize">{genderPreference} only</span>
                    )}
                    {minTripsCompleted && <span>Min trips: {minTripsCompleted}</span>}
                    {genderPreference === 'all' && !minTripsCompleted && (
                      <span>Open to everyone</span>
                    )}
                  </div>
                  {interestTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {interestTags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="bg-primary text-primary-foreground font-bold gap-1.5"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    const dest = destinationId ? destinations.find((d) => d.id === destinationId) : null
                    const previewPayload: HostTripPreviewPayload = {
                      title,
                      shortDescription,
                      description,
                      priceRows,
                      tripDays,
                      tripNights,
                      maxGroupSize,
                      difficulty,
                      scheduleRows,
                      excludeFirstTravel,
                      departureTime,
                      returnTime,
                      selectedIncludes,
                      images,
                      interestTags,
                      destination: dest ? { id: dest.id, name: dest.name, state: dest.state } : null,
                      standardFlow,
                      tokenDepositEnabled,
                      tokenAmountRupees,
                      genderPreference,
                      minAge,
                      maxAge,
                      minTripsCompleted,
                      livePackageSlug: isEdit ? editTripSlug : null,
                    }
                    try {
                      localStorage.setItem(TRIP_PREVIEW_HANDOFF_KEY, JSON.stringify(previewPayload))
                    } catch {
                      toast.error('Could not open preview (storage blocked).')
                      return
                    }
                    window.open('/host/trip-preview', '_blank', 'noopener,noreferrer')
                  }}
                  className="gap-1.5"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="bg-primary text-primary-foreground font-bold gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isEdit ? 'Saving...' : 'Submitting...'}
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      {isEdit ? 'Save changes' : 'Submit for Review'}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {leaveDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-draft-title"
          onClick={cancelLeaveDialog}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="leave-draft-title" className="text-lg font-bold">
              Leave this page?
            </h2>
            <p className="text-sm text-muted-foreground">
              You have trip details in progress. Your draft is saved on this device (removed after {DRAFT_RETENTION_DAYS}{' '}
              days without updates) — choose whether to keep it or delete it before leaving.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button type="button" variant="ghost" className="order-3 sm:order-1" onClick={cancelLeaveDialog}>
                Continue editing
              </Button>
              <Button
                type="button"
                variant="outline"
                className="order-2 border-destructive/40 text-destructive hover:bg-destructive/10 sm:order-2"
                onClick={confirmLeaveDiscardDraft}
              >
                Discard draft
              </Button>
              <Button
                type="button"
                className="order-1 bg-primary text-primary-foreground sm:order-3"
                onClick={confirmLeaveKeepDraft}
                autoFocus
              >
                Keep draft &amp; leave
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Destination Search with Maps ────────────────────────────
function DestinationSearch({
  destinations,
  value,
  onChange,
  onDestinationCreated,
}: {
  destinations: Destination[]
  value: string
  onChange: (id: string) => void
  onDestinationCreated?: (d: Destination) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    { id: string; name: string; state: string; isNew?: boolean; detail?: string }[]
  >([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const nominatimReqIdRef = useRef(0)
  const nominatimAbortRef = useRef<AbortController | null>(null)

  // Set initial label if value exists
  useEffect(() => {
    if (value && !selectedLabel) {
      const d = destinations.find(d => d.id === value)
      if (d) setSelectedLabel(`${d.name}, ${d.state}`)
    }
  }, [value, destinations, selectedLabel])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function normalizeDestQuery(s: string) {
    return s.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)

    if (timerRef.current) clearTimeout(timerRef.current)

    // Match local DB: ignore commas (e.g. "Shoja, Himachal Pradesh")
    const qNorm = normalizeDestQuery(q)
    const tokens = qNorm.split(' ').filter(Boolean)
    const localMatches = destinations
      .filter((d) => {
        const hay = normalizeDestQuery(`${d.name} ${d.state}`)
        if (tokens.length === 0) return true
        if (hay.includes(qNorm)) return true
        return tokens.every((t) => hay.includes(t))
      })
      .slice(0, 5)
    setResults(localMatches)

    if (q.length < 3) {
      nominatimAbortRef.current?.abort()
      nominatimReqIdRef.current += 1
      setSearching(false)
      return
    }

    nominatimAbortRef.current?.abort()
    const debounceMs = nominatimDebounceMs(q.trim().length)

    // Debounce map search (longer debounce for short strings avoids Nominatim empty prefixes like "Shoj")
    timerRef.current = setTimeout(async () => {
      const reqId = ++nominatimReqIdRef.current
      const controller = new AbortController()
      nominatimAbortRef.current = controller
      setSearching(true)
      try {
        const mapHits = await fetchNominatimIndiaDestinations(q, controller.signal)
        if (reqId !== nominatimReqIdRef.current) return

        const mapResults = mapHits
          .map((h) => ({ ...h, isNew: true as const }))
          .filter(
            (m) =>
              !localMatches.find(
                (l) =>
                  l.name.toLowerCase() === m.name.toLowerCase() &&
                  l.state.toLowerCase() === m.state.toLowerCase(),
              ),
          )

        setResults([...localMatches, ...mapResults])
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        // Keep local results on error
      } finally {
        if (reqId === nominatimReqIdRef.current) setSearching(false)
      }
    }, debounceMs)
  }

  async function selectDestination(d: {
    id: string
    name: string
    state: string
    isNew?: boolean
  }) {
    if (d.isNew) {
      const res = await createHostDestination(d.name, d.state)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      onDestinationCreated?.({ id: res.id, name: res.name, state: res.state })
      onChange(res.id)
    } else {
      onChange(d.id)
    }

    setSelectedLabel(`${d.name}, ${d.state}`)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={query || (open ? '' : selectedLabel)}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { setOpen(true); if (selectedLabel) handleInput('') }}
        placeholder="Search any destination in India..."
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />
      {searching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      )}

      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => selectDestination(r)}
              className="flex items-center justify-between w-full text-left px-3 py-2.5 text-sm hover:bg-secondary/60 transition-colors border-b border-border/30 last:border-0"
            >
              <div className="min-w-0">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">, {r.state}</span>
                </div>
                {r.detail && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{r.detail}</p>
                )}
              </div>
              {r.isNew && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  New
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 3 && results.length === 0 && !searching && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl px-3 py-4 text-sm text-muted-foreground text-center">
          No destinations found for &quot;{query}&quot;
        </div>
      )}
    </div>
  )
}
