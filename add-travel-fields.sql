-- BLITZ v63: Neue Spalten für Fahrtzeit/Kilometer
ALTER TABLE entries ADD COLUMN IF NOT EXISTS travel_min INTEGER DEFAULT 0;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS travel_km NUMERIC(8,1) DEFAULT 0;

-- upsert_entries_for_code: travel_min und travel_km hinzufügen
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
        NULLIF(e->>'customer_id', '')::uuid,
        e->>'customer_name',
        NULLIF(e->>'location_id', '')::uuid,
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
