-- ============================================================================
-- RÜCKNAHME zu migrations/2026-11-13-01-wuensche.sql (G1, 13.11.2026)
-- Entfernt die Tabelle public.wuensche wieder vollständig.
-- ACHTUNG: löscht alle bis dahin eingegangenen Wünsche. Nur verwenden, wenn die
-- Tabelle versehentlich/zu früh eingespielt wurde.
-- ============================================================================

DROP INDEX IF EXISTS public.wuensche_status_idx;
DROP TABLE IF EXISTS public.wuensche;
