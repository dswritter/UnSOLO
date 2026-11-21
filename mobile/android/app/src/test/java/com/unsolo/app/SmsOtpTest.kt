package com.unsolo.app

import com.unsolo.app.core.auth.SMS_OTP_LENGTH
import com.unsolo.app.core.auth.SmsOtp
import org.junit.Assert.*
import org.junit.Test

class SmsOtpTest {
    @Test fun lengthIsFour() = assertEquals(4, SMS_OTP_LENGTH)

    @Test fun extractsFromTheRealTemplate() {
        assertEquals("4821", SmsOtp.extract("Your OTP for Phone Verification is 4821. Valid for 5 mins"))
        assertEquals("0042", SmsOtp.extract("Your OTP for Phone Verification is 0042. Valid for 5 mins"))
    }

    @Test fun ignoresLongerNumbersAndPhoneNumbers() {
        assertEquals("4821", SmsOtp.extract("Hi 9876543210, your OTP for Phone Verification is 4821. Valid for 5 mins"))
        assertEquals("4821", SmsOtp.extract("Ref 123456 +919876543210 code 4821"))
        assertNull(SmsOtp.extract("Order 123456 shipped to 9876543210"))
        assertNull(SmsOtp.extract("Your code is 12345"))
        assertNull(SmsOtp.extract(null))
    }

    @Test fun validationAndFilter() {
        assertTrue(SmsOtp.isValid("1234"))
        assertFalse(SmsOtp.isValid("123")); assertFalse(SmsOtp.isValid("12345")); assertFalse(SmsOtp.isValid("12a4")); assertFalse(SmsOtp.isValid(""))
        assertEquals("1234", SmsOtp.filter("12-34 56"))
    }
}
