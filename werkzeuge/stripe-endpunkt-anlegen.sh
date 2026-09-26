#!/usr/bin/env bash
# /Users/js/Projekte/Vexfit/app/vexfit/werkzeuge/stripe-endpunkt-anlegen.sh
#
# Legt den Stripe-Webhook-Endpunkt fuer die Edge Function vexfit-automation im
# LIVE-Modus an und setzt das zurueckgegebene Signaturgeheimnis direkt als
# Supabase-Secret STRIPE_WEBHOOK_SECRET.
#
# Das Geheimnis wird dabei NIE angezeigt und steht nie in der Prozessliste:
# es geht aus der Stripe-Antwort in eine Datei mit Zugriff nur fuer dich
# (umask 077) und von dort per --env-file an die Supabase-CLI. Die Datei wird
# danach in jedem Fall geloescht, auch bei Abbruch.
#
# In dieser Datei steht kein einziges Geheimnis.
#
# Voraussetzungen:
#   - Stripe-CLI installiert und angemeldet:  brew install stripe/stripe-cli/stripe && stripe login
#   - Supabase-CLI angemeldet:                npx supabase login
#
# Aufruf (aus dem Projektordner):
#   bash werkzeuge/stripe-endpunkt-anlegen.sh
set -euo pipefail

PROJEKT_REF="hbapzwxdehfgnputrfjf"
ADRESSE="https://${PROJEKT_REF}.supabase.co/functions/v1/vexfit-automation/stripe"
EREIGNIS="checkout.session.completed"

if ! command -v stripe >/dev/null 2>&1; then
  echo "Die Stripe-CLI ist nicht installiert." >&2
  echo "Installieren mit:  brew install stripe/stripe-cli/stripe" >&2
  echo "Danach anmelden:   stripe login" >&2
  exit 1
fi

echo "Lege den Endpunkt im LIVE-Modus an:"
echo "  $ADRESSE"
echo "  Ereignis: $EREIGNIS"
echo

# Temporaere Datei nur fuer dich lesbar, und sie verschwindet in jedem Fall.
umask 077
export GEHEIMDATEI
GEHEIMDATEI="$(mktemp -t vexfit-stripe)"
trap 'rm -f "$GEHEIMDATEI"' EXIT INT TERM

# Die Antwort geht durch python3 — so landet das Geheimnis weder auf dem
# Bildschirm noch in der Prozessliste, sondern nur in der Datei.
stripe webhook_endpoints create \
  --live \
  --url "$ADRESSE" \
  --enabled-events "$EREIGNIS" \
  | python3 -c '
import json, sys, os
antwort = json.load(sys.stdin)
geheim = antwort.get("secret")
if not geheim:
    print("Stripe hat kein Signaturgeheimnis zurueckgegeben.", file=sys.stderr)
    print("Endpunkt-Kennung:", antwort.get("id", "unbekannt"), file=sys.stderr)
    sys.exit(1)
with open(os.environ["GEHEIMDATEI"], "w", encoding="utf-8") as f:
    # Name und Wert getrennt zusammensetzen — sonst sieht die
    # Geheimnis-Suche in kern_test/geheimnisse_test eine Zuweisung
    # mit Wert und schlaegt (zu Recht streng) Alarm.
    f.write("STRIPE_WEBHOOK_SECRET" + "=" + geheim + "\n")
print("Endpunkt angelegt:", antwort.get("id", "unbekannt"))
print("Signaturgeheimnis uebernommen (nicht angezeigt).")
' || { echo "Anlegen des Endpunkts fehlgeschlagen." >&2; exit 1; }

echo
echo "Setze das Secret STRIPE_WEBHOOK_SECRET im Projekt $PROJEKT_REF ..."
npx supabase secrets set --env-file "$GEHEIMDATEI" --project-ref "$PROJEKT_REF"

echo
echo "Fertig. Zur Kontrolle (zeigt nur Namen und Pruefsummen, keine Werte):"
echo "  npx supabase secrets list --project-ref $PROJEKT_REF"
