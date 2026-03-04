-- ============================================================
--  BLITZ v53 – SICHERHEITSUPDATE
-- ============================================================
--  ANLEITUNG: Im Supabase Dashboard → SQL Editor → Neue Query →
--  Diesen GESAMTEN Inhalt einfügen → Run klicken.
--
--  Was dieses Update macht:
--  1. RLS (Row Level Security) auf ALLEN Tabellen aktivieren
--  2. Login über sichere RPC-Funktion statt direktem Tabellenzugriff
--  3. Admin-Operationen serverseitig absichern
--  4. Entries/Customers/Locations nur für eigene User sichtbar
-- ============================================================


-- ─────────────────────────────────────────────────
--  SCHRITT 1: RLS auf allen Tabellen aktivieren
-- ─────────────────────────────────────────────────

ALTER TABLE profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Alte Policies entfernen (falls vorhanden)
DROP POLICY IF EXISTS "profiles_no_direct_read"  ON profiles;
DROP POLICY IF EXISTS "profiles_no_direct_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_no_direct_update" ON profiles;
DROP POLICY IF EXISTS "profiles_no_direct_delete" ON profiles;
DROP POLICY IF EXISTS "entries_no_direct_access"  ON entries;
DROP POLICY IF EXISTS "customers_no_direct_read"  ON customers;
DROP POLICY IF EXISTS "customers_no_direct_write" ON customers;
DROP POLICY IF EXISTS "customers_no_direct_delete" ON customers;
DROP POLICY IF EXISTS "locations_no_direct_read"  ON locations;
DROP POLICY IF EXISTS "locations_no_direct_write" ON locations;
DROP POLICY IF EXISTS "locations_no_direct_delete" ON locations;

-- Profiles: kein direkter Zugriff über Anon-Key
-- (Zugriff nur über SECURITY DEFINER RPCs)
CREATE POLICY "profiles_no_direct_read"   ON profiles FOR SELECT USING (false);
CREATE POLICY "profiles_no_direct_insert" ON profiles FOR INSERT WITH CHECK (false);
CREATE POLICY "profiles_no_direct_update" ON profiles FOR UPDATE USING (false);
CREATE POLICY "profiles_no_direct_delete" ON profiles FOR DELETE USING (false);

-- Entries: kein direkter Zugriff (nur über RPCs)
CREATE POLICY "entries_no_direct_access"  ON entries  FOR ALL USING (false);

-- Customers: kein direkter Zugriff (nur über RPCs)
CREATE POLICY "customers_no_direct_read"   ON customers FOR SELECT USING (false);
CREATE POLICY "customers_no_direct_write"  ON customers FOR INSERT WITH CHECK (false);
CREATE POLICY "customers_no_direct_delete" ON customers FOR DELETE USING (false);

-- Locations: kein direkter Zugriff (nur über RPCs)
CREATE POLICY "locations_no_direct_read"   ON locations FOR SELECT USING (false);
CREATE POLICY "locations_no_direct_write"  ON locations FOR INSERT WITH CHECK (false);
CREATE POLICY "locations_no_direct_delete" ON locations FOR DELETE USING (false);


-- ─────────────────────────────────────────────────
--  SCHRITT 2: Sichere Login-RPC
-- ─────────────────────────────────────────────────
-- Ersetzt den direkten profiles-Tabellenzugriff.
-- Gibt nur die nötigen Felder zurück, nie den ganzen Datensatz.

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
    'id',   v_profile.id,
    'name', v_profile.name,
    'role', v_profile.role,
    'code', v_profile.code
  );
END;
$$;


-- ─────────────────────────────────────────────────
--  SCHRITT 3: Sichere Kunden/Standort-RPCs
-- ─────────────────────────────────────────────────
-- Ersetzt den direkten customers/locations-Tabellenzugriff.

-- Kunden abrufen (nur eigene)
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

-- Standorte abrufen (nur eigene)
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

-- Kunden speichern (löscht alte, fügt neue ein – nur eigene)
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

-- Standorte speichern (löscht alte, fügt neue ein – nur eigene)
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
      NULLIF(loc->>'customer_id', ''),
      loc->>'name'
    );
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────
--  SCHRITT 4: Admin-RPCs absichern
-- ─────────────────────────────────────────────────

-- Admin: Alle User abrufen (nur wenn Aufrufer Admin ist)
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
      'id', p.id, 'name', p.name, 'code', p.code, 'role', p.role
    ) ORDER BY p.name)
    FROM profiles p
  ), '[]'::jsonb);
END;
$$;

-- Admin: User anlegen (nur wenn Aufrufer Admin ist)
CREATE OR REPLACE FUNCTION admin_create_user(p_admin_code text, p_code text, p_name text, p_role text)
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

  INSERT INTO profiles (code, name, role)
  VALUES (lower(trim(p_code)), trim(p_name), p_role)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id, 'code', p_code, 'name', p_name, 'role', p_role);
END;
$$;

-- Admin: User löschen (nur wenn Aufrufer Admin ist, nicht sich selbst)
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

  -- Einträge des Users löschen
  DELETE FROM entries   WHERE user_id = p_user_id;
  DELETE FROM customers WHERE user_id = p_user_id;
  DELETE FROM locations WHERE user_id = p_user_id;
  DELETE FROM profiles  WHERE id = p_user_id;
END;
$$;

-- Admin: Team-Einträge abrufen (nur wenn Aufrufer Admin ist)
CREATE OR REPLACE FUNCTION get_team_entries_admin(p_admin_code text, p_month text)
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
      'break_min', e.break_min, 'customer_name', e.customer_name,
      'transferred', e.transferred, 'user_name', p.name
    ))
    FROM entries e
    JOIN profiles p ON p.id = e.user_id
    WHERE e.deleted = false
      AND e.date >= (p_month || '-01')::date
      AND e.date <= (p_month || '-31')::date
  ), '[]'::jsonb);
END;
$$;
