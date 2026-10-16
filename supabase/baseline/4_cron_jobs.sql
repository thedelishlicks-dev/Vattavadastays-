select cron.schedule('expire-stale-pending-bookings', '*/15 * * * *', ' select public.expire_stale_pending_bookings(); ');
