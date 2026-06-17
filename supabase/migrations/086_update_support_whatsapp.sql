-- ============================================================
-- 086: Correct the default UnSOLO support WhatsApp number
-- ============================================================
-- New official support/WhatsApp number. Digits only, country code first.

insert into public.platform_settings (key, value, description)
values ('support_whatsapp_number', '919211451355', 'Default WhatsApp number shown on bookings, receipts and listings.')
on conflict (key) do update set value = excluded.value;
