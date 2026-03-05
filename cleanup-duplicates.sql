-- ============================================================
-- Cleanup: Remove duplicate entries caused by admin sync bug
-- ============================================================
-- The admin sync bug caused entries from other users to be re-uploaded
-- under the admin's user_id, creating duplicates in the database.
--
-- This script identifies and soft-deletes duplicate entries where:
-- - Same date, from_time, to_time, customer_name, and task
-- - But different user_id (the copy assigned to the wrong user)
--
-- IMPORTANT: Review the results of the SELECT query first before
-- running the DELETE. Run this in your Supabase SQL Editor.
-- ============================================================

-- Step 1: Find potential duplicates (REVIEW FIRST)
-- Shows entries that exist under multiple user_ids with the same content
SELECT
  e1.id AS duplicate_id,
  e1.user_id AS wrong_user_id,
  e2.id AS original_id,
  e2.user_id AS original_user_id,
  p1.name AS wrong_user_name,
  p2.name AS original_user_name,
  e1.date, e1.from_time, e1.to_time, e1.customer_name, e1.task
FROM entries e1
JOIN entries e2 ON
  e1.date = e2.date
  AND e1.from_time = e2.from_time
  AND e1.to_time = e2.to_time
  AND COALESCE(e1.customer_name, '') = COALESCE(e2.customer_name, '')
  AND COALESCE(e1.task, '') = COALESCE(e2.task, '')
  AND e1.user_id != e2.user_id
  AND e1.id != e2.id
  AND e1.deleted = false
  AND e2.deleted = false
JOIN profiles p1 ON p1.id = e1.user_id
JOIN profiles p2 ON p2.id = e2.user_id
WHERE p1.role = 'admin'  -- The duplicate is under the admin's account
ORDER BY e1.date DESC, e1.from_time;

-- Step 2: Soft-delete the duplicates (UNCOMMENT AFTER REVIEW)
-- UPDATE entries SET deleted = true
-- WHERE id IN (
--   SELECT e1.id
--   FROM entries e1
--   JOIN entries e2 ON
--     e1.date = e2.date
--     AND e1.from_time = e2.from_time
--     AND e1.to_time = e2.to_time
--     AND COALESCE(e1.customer_name, '') = COALESCE(e2.customer_name, '')
--     AND COALESCE(e1.task, '') = COALESCE(e2.task, '')
--     AND e1.user_id != e2.user_id
--     AND e1.id != e2.id
--     AND e1.deleted = false
--     AND e2.deleted = false
--   JOIN profiles p1 ON p1.id = e1.user_id
--   WHERE p1.role = 'admin'
-- );
