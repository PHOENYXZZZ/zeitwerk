-- BLITZ v63: Moderator-Rolle
-- Neue Tabelle für Moderator-Zuweisungen
CREATE TABLE IF NOT EXISTS moderator_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(moderator_id, worker_id)
);

-- RLS
ALTER TABLE moderator_assignments ENABLE ROW LEVEL SECURITY;

-- Moderator-Rolle in profiles erlauben (falls CHECK constraint existiert)
-- profiles.role kann jetzt 'worker', 'moderator' oder 'admin' sein

-- get_team_entries_admin: Auch für Moderatoren (nur zugewiesene Mitarbeiter)
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
    -- Admin sieht alle Mitarbeiter
    RETURN (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT e.*, p.name AS user_name, p.weekly_hours
        FROM entries e
        JOIN profiles p ON p.id = e.user_id
        WHERE to_char(e.date, 'YYYY-MM') = p_month
        ORDER BY e.date, e.from_time
      ) r
    );
  ELSIF v_role = 'moderator' THEN
    -- Moderator sieht nur zugewiesene Mitarbeiter
    RETURN (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT e.*, p.name AS user_name, p.weekly_hours
        FROM entries e
        JOIN profiles p ON p.id = e.user_id
        JOIN moderator_assignments ma ON ma.worker_id = e.user_id AND ma.moderator_id = v_uid
        WHERE to_char(e.date, 'YYYY-MM') = p_month
        ORDER BY e.date, e.from_time
      ) r
    );
  ELSE
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
END;
$$;

-- Admin: Moderator einem Worker zuweisen
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

-- Admin: Moderator-Zuweisung entfernen
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

-- Moderator-Zuweisungen abrufen (für Admin-UI)
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
