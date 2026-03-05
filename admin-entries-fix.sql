-- ============================================================
-- Migration: Fix get_all_entries_admin to return user_id and user_name
-- ============================================================
-- Problem: The original get_all_entries_admin returns all entries but without
-- user_id and user_name fields. This causes entries from all users to be
-- mixed together in the admin's local data, leading to:
--   1. Incorrect Saldo calculations (other users' hours counted as own)
--   2. Duplicate entries when syncPush re-uploads all entries under admin's ID
--   3. No way to distinguish own entries from others'
--
-- Solution: JOIN profiles table to include user_id and user_name,
-- following the same pattern as get_team_entries_admin.
--
-- IMPORTANT: Run this migration in your Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION get_all_entries_admin(p_admin_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE code = p_admin_code;
  IF v_role IS NULL OR v_role != 'admin' THEN
    RAISE EXCEPTION 'Keine Admin-Berechtigung';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'date', e.date, 'from_time', e.from_time, 'to_time', e.to_time,
      'break_min', e.break_min, 'customer_id', e.customer_id, 'customer_name', e.customer_name,
      'location_id', e.location_id, 'location_name', e.location_name,
      'task', e.task, 'title', e.title, 'note', e.note,
      'transferred', e.transferred, 'deleted', e.deleted,
      'user_id', e.user_id, 'user_name', p.name
    ))
    FROM entries e
    JOIN profiles p ON p.id = e.user_id
  ), '[]'::jsonb);
END;
$$;
