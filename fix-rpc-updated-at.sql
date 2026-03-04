-- ============================================================
--  FIX: upsert_entries_for_code – updated_at Typ-Fehler beheben
-- ============================================================
--  Problem: Die Funktion extrahierte updated_at als TEXT aus dem
--  JSON-Payload. PostgreSQL kann text nicht in timestamptz casten.
--
--  Lösung: updated_at wird NICHT mehr aus dem Payload gelesen.
--  Stattdessen setzt der DB-Trigger `entries_set_updated_at`
--  den Wert automatisch auf NOW().
--
--  ANLEITUNG: Im Supabase Dashboard → SQL Editor → Neue Query →
--  Diesen Inhalt einfügen → Run klicken.
-- ============================================================

-- Schritt 1: Trigger sicherstellen (falls noch nicht vorhanden)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entries_set_updated_at ON entries;
CREATE TRIGGER entries_set_updated_at
  BEFORE INSERT OR UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Schritt 2: updated_at Spalte sicherstellen
ALTER TABLE entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Schritt 3: RPC-Funktion neu erstellen (ohne updated_at aus Payload)
CREATE OR REPLACE FUNCTION upsert_entries_for_code(p_code text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  entry jsonb;
BEGIN
  -- User-ID anhand Code ermitteln
  SELECT id INTO v_user_id FROM profiles WHERE code = p_code;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unbekannter Code';
  END IF;

  -- Jeden Eintrag upserten (updated_at wird vom Trigger gesetzt)
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO entries (
      id, user_id, date, from_time, to_time, break_min,
      customer_id, customer_name, location_id, location_name,
      task, title, note, transferred, deleted
    ) VALUES (
      (entry->>'id')::uuid,
      v_user_id,
      (entry->>'date')::date,
      COALESCE(entry->>'from_time', '00:00'),
      COALESCE(entry->>'to_time', '00:00'),
      COALESCE((entry->>'break_min')::int, 0),
      NULLIF(entry->>'customer_id', ''),
      entry->>'customer_name',
      NULLIF(entry->>'location_id', ''),
      entry->>'location_name',
      entry->>'task',
      entry->>'title',
      entry->>'note',
      COALESCE((entry->>'transferred')::boolean, false),
      COALESCE((entry->>'deleted')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE SET
      date        = EXCLUDED.date,
      from_time   = EXCLUDED.from_time,
      to_time     = EXCLUDED.to_time,
      break_min   = EXCLUDED.break_min,
      customer_id = EXCLUDED.customer_id,
      customer_name = EXCLUDED.customer_name,
      location_id = EXCLUDED.location_id,
      location_name = EXCLUDED.location_name,
      task        = EXCLUDED.task,
      title       = EXCLUDED.title,
      note        = EXCLUDED.note,
      transferred = EXCLUDED.transferred,
      deleted     = EXCLUDED.deleted;
  END LOOP;
END;
$$;
