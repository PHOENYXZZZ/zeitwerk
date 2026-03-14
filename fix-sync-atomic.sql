-- ============================================================
--  Fix: Atomare Stammdaten-Synchronisation
--  Problem: sync_customers_for_code und sync_locations_for_code
--  liefen in getrennten Transaktionen. Durch ON DELETE SET NULL
--  am FK locations.customer_id → customers.id gingen die
--  Kunden-Zuordnungen verloren (Race-Condition).
--
--  Lösung: Eine einzige Funktion sync_masterdata_for_code()
--  die Kunden UND Standorte atomar in einer Transaktion synct.
-- ============================================================

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

  -- Nur den Location-FK aufschieben → kein CASCADE während DELETE/INSERT
  SET CONSTRAINTS locations_customer_id_fkey DEFERRED;

  -- Abhängige Tabelle zuerst löschen (Locations), dann Kunden
  DELETE FROM locations WHERE user_id = v_user_id;
  DELETE FROM customers WHERE user_id = v_user_id;

  -- Kunden zuerst einfügen (referenzierte Tabelle)
  FOR cust IN SELECT * FROM jsonb_array_elements(p_customers)
  LOOP
    INSERT INTO customers (id, user_id, name)
    VALUES (
      (cust->>'id')::uuid,
      v_user_id,
      cust->>'name'
    );
  END LOOP;

  -- Dann Standorte mit customer_id-Referenz
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

  -- Bei COMMIT werden alle FK-Constraints geprüft – alles konsistent
END;
$$;
