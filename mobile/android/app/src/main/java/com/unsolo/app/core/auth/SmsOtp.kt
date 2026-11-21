package com.unsolo.app.core.auth

/** SMS codes (phone sign-in and phone verification) are 4 digits (DLT template). Email codes stay 6 (Supabase). */
const val SMS_OTP_LENGTH = 4
const val EMAIL_OTP_LENGTH = 6

object SmsOtp {
    private val code = Regex("(?<!\\d)\\d{$SMS_OTP_LENGTH}(?!\\d)")

    /** Keeps digits only, at most [SMS_OTP_LENGTH]. */
    fun filter(input: String): String = input.filter { it.isDigit() }.take(SMS_OTP_LENGTH)

    fun isValid(input: String): Boolean = input.length == SMS_OTP_LENGTH && input.all { it in '0'..'9' }

    /**
     * The code in an incoming SMS ("Your OTP for Phone Verification is 1234. Valid for 5 mins"):
     * the first run of exactly 4 digits that is not part of a longer number (phone numbers, amounts).
     */
    fun extract(message: String?): String? = message?.let { code.find(it)?.value }
}
