update public.app_users
set buyer_verification_status = 'verified',
    updated_at = timezone('utc', now())
where upper(stellar_public_key) = 'GDQM3R3UTY7M4QJGNANWZ4QXQYADQCMM65FZFAD3Y6Y7UOCKFYNFDI3J';

