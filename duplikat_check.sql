-- SCHRITT 1: Erst SELECT zum Prüfen
SELECT
  e1.id AS dup_id,
  e1.user_id AS wrong_user,
  e2.id AS orig_id,
  e2.user_id AS orig_user,
  p1.name AS wrong_name,
  p2.name AS orig_name,
  e1.date,
  e1.from_time,
  e1.to_time,
  e1.customer_name,
  e1.task
FROM entries e1
JOIN entries e2
  ON e1.date = e2.date
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
WHERE p1.role = 'admin'
ORDER BY e1.date DESC, e1.from_time;


-- SCHRITT 2: Wenn Ergebnisse stimmen, UPDATE ausführen
UPDATE entries SET deleted = true
WHERE id IN (
  SELECT e1.id
  FROM entries e1
  JOIN entries e2
    ON e1.date = e2.date
    AND e1.from_time = e2.from_time
    AND e1.to_time = e2.to_time
    AND COALESCE(e1.customer_name, '') = COALESCE(e2.customer_name, '')
    AND COALESCE(e1.task, '') = COALESCE(e2.task, '')
    AND e1.user_id != e2.user_id
    AND e1.id != e2.id
    AND e1.deleted = false
    AND e2.deleted = false
  JOIN profiles p1 ON p1.id = e1.user_id
  WHERE p1.role = 'admin'
);
