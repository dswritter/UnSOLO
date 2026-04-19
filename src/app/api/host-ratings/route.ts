import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { booking_id, rating, comment } = body

    // Validate
    if (!booking_id || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    // Get booking to find host_id
    const { data: booking } = await supabase
      .from('bookings')
      .select('*, package:packages(host_id)')
      .eq('id', booking_id)
      .single()

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Verify user is the booker
    if (booking.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get host_id from package
    const hostId = booking.package?.host_id
    if (!hostId) {
      return NextResponse.json({ error: 'Booking has no host' }, { status: 400 })
    }

    // Check if rating already exists
    const { data: existing } = await supabase
      .from('host_ratings')
      .select('id')
      .eq('booking_id', booking_id)
      .single()

    if (existing) {
      // Update existing rating
      const { data: updated, error } = await supabase
        .from('host_ratings')
        .update({
          rating,
          comment: comment || null,
        })
        .eq('booking_id', booking_id)
        .select('*')
        .single()

      if (error) {
        console.error('Error updating host rating:', error)
        return NextResponse.json({ error: 'Failed to update rating' }, { status: 500 })
      }

      return NextResponse.json(updated)
    }

    // Create new rating
    const { data: created, error } = await supabase
      .from('host_ratings')
      .insert([
        {
          host_id: hostId,
          booking_id,
          user_id: user.id,
          rating,
          comment: comment || null,
        },
      ])
      .select('*')
      .single()

    if (error) {
      console.error('Error creating host rating:', error)
      return NextResponse.json({ error: 'Failed to create rating' }, { status: 500 })
    }

    // Update host's average rating in profiles table
    const { data: allRatings } = await supabase
      .from('host_ratings')
      .select('rating')
      .eq('host_id', hostId)

    if (allRatings && allRatings.length > 0) {
      const avgRating = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
      await supabase
        .from('profiles')
        .update({ host_rating: avgRating })
        .eq('id', hostId)
    }

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/host-ratings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
