-- ============================================================
--  FIX: sync_locations_for_code – customer_id UUID-Cast
-- ============================================================
--  Problem: customer_id wurde als TEXT eingefügt statt als UUID.
--  Außerdem: Race-Condition wenn sync_customers DELETE+INSERT
--  vor sync_locations läuft und ein FK CASCADE die customer_id
--  auf NULL setzt.
--
--  Lösung:
--  1. Expliziter ::uuid Cast für customer_id
--  2. DEFERRABLE FK-Constraint (falls vorhanden)
--
--  ANLEITUNG: Im Supabase Dashboard → SQL Editor → Neue Query →
--  Diesen GESAMTEN Inhalt einfügen → Run klicken.
-- ============================================================

-- Schritt 1: FK-Constraint prüfen und ggf. auf DEFERRABLE umstellen
-- (Ignoriert Fehler falls kein FK existiert)
DO $$
BEGIN
  -- Versuche existierenden FK zu droppen und als DEFERRABLE neu zu erstellen
  BEGIN
    ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_customer_id_fkey;
    ALTER TABLE locations ADD CONSTRAINT locations_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  EXCEPTION WHEN OTHERS THEN
    -- Kein FK vorhanden oder anderer Fehler – ignorieren
    NULL;
  END;
END $$;

-- Schritt 2: sync_locations_for_code mit explizitem UUID-Cast
DROP FUNCTION IF EXISTS sync_locations_for_code(text, jsonb);

CREATE OR REPLACE FUNCTION sync_locations_for_code(p_code text, p_locations jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  loc jsonb;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE code = p_code;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unbekannter Code'; END IF;

  DELETE FROM locations WHERE user_id = v_user_id;

  FOR loc IN SELECT * FROM jsonb_array_elements(p_locations)
  LOOP
    INSERT INTO locations (id, user_id, customer_id, name)
    VALUES (
      (loc->>'id')::uuid,
      v_user_id,
      (NULLIF(loc->>'customer_id', ''))::uuid,
      loc->>'name'
    );
  END LOOP;
END;
$$;

-- Schritt 3: Bestehende Locations mit fehlender customer_id reparieren
-- (Versucht anhand des Namens den Kunden wiederherzustellen)
UPDATE locations l
SET customer_id = (
  SELECT c.id FROM customers c
  WHERE c.user_id = l.user_id
  AND c.name = (
    SELECT DISTINCT e.customer_name FROM entries e
    WHERE e.location_id = l.id AND e.customer_id IS NOT NULL
    LIMIT 1
  )
  LIMIT 1
)
WHERE l.customer_id IS NULL;
