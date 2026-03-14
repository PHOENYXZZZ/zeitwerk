-- ============================================================
--  BLITZ – KONSOLIDIERTES SQL-UPDATE (alle RPC-Funktionen)
-- ============================================================
--  Ersetzt ALLE bisherigen SQL-Fixes in einer einzigen Datei.
--
--  ANLEITUNG: Im Supabase Dashboard → SQL Editor → Neue Query →
--  Diesen GESAMTEN Inhalt einfügen → Run klicken.
--
--  Behebt:
--  ✓ "operator does not exist: text = uuid" (fehlende ::uuid Casts)
--  ✓ Fahrtzeit/km geht beim Sync verloren (fehlende Felder in get_entries)
--  ✓ Race-Condition bei Kunden/Standort-Sync (atomare Transaktion)
--  ✓ Duplikate durch fehlenden user_id-Filter
--
--  Voraussetzungen (müssen vorher existieren):
--  - profiles Tabelle mit: id, code, name, role, weekly_hours
--  - entries Tabelle mit: id, user_id, date, from_time, to_time,
--    break_min, customer_id, customer_name, location_id, location_name,
--    task, title, note, transferred, deleted, travel_min, travel_km, updated_at
--  - customers Tabelle mit: id, user_id, name
--  - locations Tabelle mit: id, user_id, customer_id, name
-- ============================================================


-- ─────────────────────────────────────────────────
--  1. SPALTEN SICHERSTELLEN (idempotent)
-- ─────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_hours NUMERIC DEFAULT 39;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS travel_min INTEGER DEFAULT 0;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS travel_km NUMERIC(8,1) DEFAULT 0;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- updated_at Trigger
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


-- ─────────────────────────────────────────────────
--  2. FK-CONSTRAINT: DEFERRABLE für atomare Sync
-- ─────────────────────────────────────────────────

DO $$
BEGIN
  BEGIN
    ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_customer_id_fkey;
    ALTER TABLE locations ADD CONSTRAINT locations_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Kein FK vorhanden – ignorieren
  END;
END $$;


-- ─────────────────────────────────────────────────
--  3. LOGIN
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION login_with_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE code = lower(trim(p_code));
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id',           v_profile.id,
    'name',         v_profile.name,
    'role',         v_profile.role,
    'code',         v_profile.code,
    'weekly_hours', COALESCE(v_profile.weekly_hours, 39)
  );
END;
$$;


-- ─────────────────────────────────────────────────
--  4. ENTRIES LESEN (mit travel + user_id)
-- ─────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_entries_for_code(text);

CREATE OR REPLACE FUNCTION get_entries_for_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE code = lower(trim(p_code));
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unbekannter Code'; END IF;

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
      'deleted',       e.deleted,
      'travel_min',    COALESCE(e.travel_min, 0),
      'travel_km',     COALESCE(e.travel_km, 0)
    ))
    FROM entries e
    WHERE e.user_id = v_user_id
  ), '[]'::jsonb);
END;
$$;


-- ─────────────────────────────────────────────────
--  5. ENTRIES SCHREIBEN (upsert mit ::uuid Casts)
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_entries_for_code(p_code text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  e jsonb;
BEGIN
  SELECT id INTO v_uid FROM profiles WHERE code = p_code;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;

  FOR e IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    IF (e->>'deleted')::boolean = true THEN
      DELETE FROM entries WHERE id = (e->>'id')::uuid AND user_id = v_uid;
    ELSE
      INSERT INTO entries (id, user_id, date, from_time, to_time, break_min,
        customer_id, customer_name, location_id, location_name,
        task, title, note, transferred, travel_min, travel_km, updated_at)
      VALUES (
        (e->>'id')::uuid, v_uid, (e->>'date')::date,
        (e->>'from_time')::time, (e->>'to_time')::time,
        COALESCE((e->>'break_min')::int, 0),
        (NULLIF(e->>'customer_id', ''))::uuid,       -- EXPLIZITER ::uuid CAST
        e->>'customer_name',
        (NULLIF(e->>'location_id', ''))::uuid,        -- EXPLIZITER ::uuid CAST
        e->>'location_name',
        e->>'task', e->>'title', e->>'note',
        COALESCE((e->>'transferred')::boolean, false),
        COALESCE((e->>'travel_min')::int, 0),
        COALESCE((e->>'travel_km')::numeric, 0),
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        date = EXCLUDED.date,
        from_time = EXCLUDED.from_time,
        to_time = EXCLUDED.to_time,
        break_min = EXCLUDED.break_min,
        customer_id = EXCLUDED.customer_id,
        customer_name = EXCLUDED.customer_name,
        location_id = EXCLUDED.location_id,
        location_name = EXCLUDED.location_name,
        task = EXCLUDED.task,
        title = EXCLUDED.title,
        note = EXCLUDED.note,
        transferred = EXCLUDED.transferred,
        travel_min = EXCLUDED.travel_min,
        travel_km = EXCLUDED.travel_km,
        updated_at = now()
      WHERE entries.user_id = v_uid;
    END IF;
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────
--  6. STAMMDATEN ATOMAR SYNCHRONISIEREN
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_masterdata_for_code(
  p_code text,
  p_customers jsonb,
  p_locations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  cust jsonb;
  loc jsonb;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE code = p_code;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unbekannter Code'; END IF;

  SET CONSTRAINTS locations_customer_id_fkey DEFERRED;

  -- Abhängige zuerst löschen
  DELETE FROM locations WHERE user_id = v_user_id;
  DELETE FROM customers WHERE user_id = v_user_id;

  -- Kunden einfügen (referenzierte Tabelle)
  FOR cust IN SELECT * FROM jsonb_array_elements(p_customers)
  LOOP
    INSERT INTO customers (id, user_id, name)
    VALUES (
      (cust->>'id')::uuid,
      v_user_id,
      cust->>'name'
    );
  END LOOP;

  -- Standorte mit customer_id-Referenz
  FOR loc IN SELECT * FROM jsonb_array_elements(p_locations)
  LOOP
    INSERT INTO locations (id, user_id, customer_id, name)
    VALUES (
      (loc->>'id')::uuid,
      v_user_id,
      (NULLIF(loc->>'customer_id', ''))::uuid,      -- EXPLIZITER ::uuid CAST
      loc->>'name'
    );
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────
--  7. ALTE EINZELFUNKTIONEN ÜBERSCHREIBEN (Safety)
--     Falls der JS-Code sie nie aufruft, schaden sie nicht.
--     Aber sie müssen korrekte Casts haben falls irgendetwas
--     sie doch noch triggert.
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_customers_for_code(p_code text, p_customers jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  cust jsonb;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE code = p_code;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unbekannter Code'; END IF;

  DELETE FROM customers WHERE user_id = v_user_id;

  FOR cust IN SELECT * FROM jsonb_array_elements(p_customers)
  LOOP
    INSERT INTO customers (id, user_id, name)
    VALUES (
      (cust->>'id')::uuid,
      v_user_id,
      cust->>'name'
    );
  END LOOP;
END;
$$;

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
      (NULLIF(loc->>'customer_id', ''))::uuid,      -- FIX: vorher fehlte ::uuid
      loc->>'name'
    );
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────
--  8. KUNDEN/STANDORTE LESEN
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_customers_for_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE code = p_code;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unbekannter Code'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name))
    FROM customers c WHERE c.user_id = v_user_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION get_locations_for_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE code = p_code;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unbekannter Code'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', l.id, 'customer_id', l.customer_id, 'name', l.name))
    FROM locations l WHERE l.user_id = v_user_id
  ), '[]'::jsonb);
END;
$$;


-- ─────────────────────────────────────────────────
--  9. ADMIN-FUNKTIONEN
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_all_users_admin(p_admin_code text)
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
      'id', p.id, 'name', p.name, 'code', p.code, 'role', p.role,
      'weekly_hours', COALESCE(p.weekly_hours, 39)
    ) ORDER BY p.name)
    FROM profiles p
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_user(p_admin_code text, p_code text, p_name text, p_role text, p_weekly_hours numeric DEFAULT 39)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_new_id uuid;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE code = p_admin_code;
  IF v_role IS NULL OR v_role != 'admin' THEN
    RAISE EXCEPTION 'Keine Admin-Berechtigung';
  END IF;

  INSERT INTO profiles (code, name, role, weekly_hours)
  VALUES (lower(trim(p_code)), trim(p_name), p_role, COALESCE(p_weekly_hours, 39))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id, 'code', p_code, 'name', p_name, 'role', p_role, 'weekly_hours', COALESCE(p_weekly_hours, 39));
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_user(p_admin_code text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
  v_role text;
BEGIN
  SELECT id, role INTO v_admin_id, v_role FROM profiles WHERE code = p_admin_code;
  IF v_role IS NULL OR v_role != 'admin' THEN
    RAISE EXCEPTION 'Keine Admin-Berechtigung';
  END IF;
  IF v_admin_id = p_user_id THEN
    RAISE EXCEPTION 'Du kannst dich nicht selbst löschen';
  END IF;

  DELETE FROM entries   WHERE user_id = p_user_id;
  DELETE FROM locations WHERE user_id = p_user_id;
  DELETE FROM customers WHERE user_id = p_user_id;
  DELETE FROM profiles  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_user_hours(p_admin_code text, p_user_id uuid, p_weekly_hours numeric)
RETURNS void
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
  UPDATE profiles SET weekly_hours = p_weekly_hours WHERE id = p_user_id;
END;
$$;


-- ─────────────────────────────────────────────────
--  10. TEAM-ENTRIES (Admin + Moderator)
-- ─────────────────────────────────────────────────

-- Moderator-Tabelle sicherstellen
CREATE TABLE IF NOT EXISTS moderator_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(moderator_id, worker_id)
);
ALTER TABLE moderator_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_team_entries_admin(p_admin_code text, p_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_role text;
BEGIN
  SELECT id, role INTO v_uid, v_role FROM profiles WHERE code = p_admin_code;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;

  IF v_role = 'admin' THEN
    RETURN (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT e.*, p.name AS user_name, p.weekly_hours
        FROM entries e
        JOIN profiles p ON p.id = e.user_id
        WHERE to_char(e.date, 'YYYY-MM') = p_month
          AND e.deleted = false
        ORDER BY e.date, e.from_time
      ) r
    );
  ELSIF v_role = 'moderator' THEN
    RETURN (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT e.*, p.name AS user_name, p.weekly_hours
        FROM entries e
        JOIN profiles p ON p.id = e.user_id
        JOIN moderator_assignments ma ON ma.worker_id = e.user_id AND ma.moderator_id = v_uid
        WHERE to_char(e.date, 'YYYY-MM') = p_month
          AND e.deleted = false
        ORDER BY e.date, e.from_time
      ) r
    );
  ELSE
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_assign_moderator(p_admin_code text, p_moderator_id uuid, p_worker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_role text;
BEGIN
  SELECT id, role INTO v_uid, v_role FROM profiles WHERE code = p_admin_code;
  IF v_uid IS NULL OR v_role != 'admin' THEN RAISE EXCEPTION 'Keine Admin-Berechtigung'; END IF;

  INSERT INTO moderator_assignments (moderator_id, worker_id)
  VALUES (p_moderator_id, p_worker_id)
  ON CONFLICT (moderator_id, worker_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION admin_remove_moderator_assignment(p_admin_code text, p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_role text;
BEGIN
  SELECT id, role INTO v_uid, v_role FROM profiles WHERE code = p_admin_code;
  IF v_uid IS NULL OR v_role != 'admin' THEN RAISE EXCEPTION 'Keine Admin-Berechtigung'; END IF;

  DELETE FROM moderator_assignments WHERE id = p_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_moderator_assignments(p_admin_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_role text;
BEGIN
  SELECT id, role INTO v_uid, v_role FROM profiles WHERE code = p_admin_code;
  IF v_uid IS NULL OR v_role != 'admin' THEN RAISE EXCEPTION 'Keine Admin-Berechtigung'; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    FROM (
      SELECT ma.id, ma.moderator_id, pm.name AS moderator_name,
             ma.worker_id, pw.name AS worker_name
      FROM moderator_assignments ma
      JOIN profiles pm ON pm.id = ma.moderator_id
      JOIN profiles pw ON pw.id = ma.worker_id
      ORDER BY pm.name, pw.name
    ) r
  );
END;
$$;


-- ─────────────────────────────────────────────────
--  FERTIG! Alle Funktionen sind auf dem neuesten Stand.
-- ─────────────────────────────────────────────────
