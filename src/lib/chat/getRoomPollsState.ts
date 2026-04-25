import type { SupabaseClient } from '@supabase/supabase-js'

export type ChatPollState = {
  pollId: string
  messageId: string
  question: string
  allowMultiple: boolean
  endsAt: string | null
  options: {
    id: string
    position: number
    label: string
    voteCount: number
    /** Recent voters (up to 8) for avatars, newest first */
    voterUserIds: string[]
  }[]
  myOptionIds: string[]
}

/** Shown in poll bars; merge logic keeps the same cap */
export const CHAT_POLL_MAX_VOTER_ICONS = 8

function orderVoterUserIds(
  byOption: Map<string, string[]>,
  optionId: string,
): string[] {
  return (byOption.get(optionId) || []).slice(0, CHAT_POLL_MAX_VOTER_ICONS)
}

/**
 * Load poll data for poll messages in a room (options, counts, current user's votes).
 */
export async function getRoomPollsState(
  supabase: SupabaseClient,
  _roomId: string,
  messageIds: string[],
  viewerUserId: string,
): Promise<Record<string, ChatPollState>> {
  if (messageIds.length === 0) return {}
  const { data: polls, error } = await supabase
    .from('chat_polls')
    .select('id, message_id, question, allow_multiple, ends_at')
    .in('message_id', messageIds)
  if (error || !polls?.length) return {}

  const pollIds = polls.map(p => p.id)
  const { data: optionRows } = await supabase
    .from('chat_poll_options')
    .select('id, poll_id, position, label')
    .in('poll_id', pollIds)

  const { data: allVotes } = await supabase
    .from('chat_poll_votes')
    .select('poll_id, option_id, user_id, created_at')
    .in('poll_id', pollIds)
    .order('created_at', { ascending: false })

  const byMessage: Record<string, ChatPollState> = {}
  const votes = allVotes || []
  const optionsByPoll = new Map<string, { id: string; position: number; label: string }[]>()
  for (const o of optionRows || []) {
    const list = optionsByPoll.get(o.poll_id) || []
    list.push({ id: o.id, position: o.position, label: o.label })
    optionsByPoll.set(o.poll_id, list)
  }

  for (const p of polls as {
    id: string
    message_id: string
    question: string
    allow_multiple: boolean
    ends_at: string | null
  }[]) {
    const optionsRaw = (optionsByPoll.get(p.id) || []).slice().sort((a, b) => a.position - b.position)
    const counts = new Map<string, number>()
    for (const o of optionsRaw) counts.set(o.id, 0)
    /** per option: unique user ids, newest vote first (for avatars) */
    const byOptionVoters = new Map<string, string[]>()
    for (const o of optionsRaw) {
      byOptionVoters.set(o.id, [])
    }
    for (const v of votes) {
      if (v.poll_id !== p.id) continue
      counts.set(v.option_id, (counts.get(v.option_id) || 0) + 1)
      const list = byOptionVoters.get(v.option_id) || []
      if (!list.includes(v.user_id)) list.push(v.user_id)
      byOptionVoters.set(v.option_id, list)
    }
    const myOptionIds = votes.filter(v => v.poll_id === p.id && v.user_id === viewerUserId).map(v => v.option_id)
    byMessage[p.message_id] = {
      pollId: p.id,
      messageId: p.message_id,
      question: p.question,
      allowMultiple: p.allow_multiple,
      endsAt: p.ends_at,
      options: optionsRaw.map(o => ({
        id: o.id,
        position: o.position,
        label: o.label,
        voteCount: counts.get(o.id) || 0,
        voterUserIds: orderVoterUserIds(byOptionVoters, o.id),
      })),
      myOptionIds,
    }
  }
  return byMessage
}
