-- ============================================================
--  FIX: get_entries_for_code – Nur eigene Einträge zurückgeben
-- ============================================================
--  Problem: Die Funktion gibt möglicherweise Einträge ALLER User
--  zurück, was zu Duplikaten und Schneeball-Effekt führt.
--
--  Lösung: Strenger user_id-Filter + user_id im Response
--  für clientseitige Validierung.
--
--  ANLEITUNG: Im Supabase Dashboard → SQL Editor → Neue Query →
--  Diesen GESAMTEN Inhalt einfügen → Run klicken.
-- ============================================================

CREATE OR REPLACE FUNCTION get_entries_for_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- User-ID anhand Code ermitteln
  SELECT id INTO v_user_id FROM profiles WHERE code = lower(trim(p_code));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unbekannter Code';
  END IF;

  -- NUR Einträge des eigenen Users zurückgeben, mit user_id im Response
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',            e.id,
      'user_id',       e.user_id,
      'date',          e.date,
      'from_time',     e.from_time,
      'to_time',       e.to_time,
      'break_min',     e.break_min,
      'customer_id',   e.customer_id,
      'customer_name', e.customer_name,
      'location_id',   e.location_id,
      'location_name', e.location_name,
      'task',          e.task,
      'title',         e.title,
      'note',          e.note,
      'transferred',   e.transferred,
      'deleted',       e.deleted
    ))
    FROM entries e
    WHERE e.user_id = v_user_id
  ), '[]'::jsonb);
END;
$$;

-- ============================================================
--  BONUS: Bestehende Duplikate auf dem Server bereinigen
-- ============================================================
--  Löscht serverseitige Duplikate (gleicher User, gleiches Datum,
--  gleiche Zeiten) und behält nur den ältesten Eintrag.

-- Erst prüfen wieviele Duplikate es gibt:
-- SELECT count(*) FROM (
--   SELECT id, ROW_NUMBER() OVER (
--     PARTITION BY user_id, date, from_time, to_time, customer_name, task
--     ORDER BY created_at ASC, id ASC
--   ) as rn
--   FROM entries
--   WHERE deleted = false
-- ) sub WHERE rn > 1;

-- Duplikate löschen (behält den ältesten Eintrag pro Gruppe):
DELETE FROM entries
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, date, from_time, to_time, COALESCE(customer_name,''), COALESCE(task,'')
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) as rn
    FROM entries
    WHERE deleted = false
  ) sub
  WHERE rn > 1
);
