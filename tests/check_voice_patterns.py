#!/usr/bin/env python3
"""Check concrete voice-command patterns from the mod against sample transcriptions.
This is not a complete .NET regex runtime test; it checks literal regex syntax compatibility and examples.
"""
from pathlib import Path
import re
s=(Path(__file__).resolve().parents[1]/'capri-mod/capri-orca-bridge.capri-code').read_text()
patterns=re.findall(r'm=Regex\.Match\(original,@"([^"\n]+)"',s)
assert len(patterns)>5, f'Not enough C# verbatim regex patterns: {len(patterns)}'
examples={
    'Capri, en Orca pídele a Claude que revise mi programación en Python',
    'Capri, en Orca envía a Codex que haga las pruebas',
    'Capri, en Orca dile a Claude que corrija el método calcular_ingreso()',
    'Capri, abre el proyecto Ventas',
    'Capri, in Orca tell Claude to review my code',
    'Capri, open project Ventas'
}
for phrase in sorted(examples):
    matches=[pat for pat in patterns if re.match(pat,phrase,re.IGNORECASE|re.DOTALL)]
    assert matches, f'Unrecognized: {phrase}'
    print('OK:',phrase)
print('PASS: comandos en español e inglés (regex de C# revisadas en Python)')

# v0.9: additional voice routes for quotas and account choices.
from unicodedata import normalize

def plain(value):
    return ''.join(c for c in normalize('NFD',value.lower()) if not ('\u0300' <= c <= '\u036f')).strip()
quota_patterns=re.findall(r'(?:specificQuota|q)=Regex\.Match\(line,@"([^"\n]+)"',s)
assert quota_patterns, 'no specific quota voice regex found'
examples_quota=['Capri, cuánto me queda de Codex','Capri, cuánto me queda en Claude','Capri, uso restante de Antigravity']
for phrase in examples_quota:
    assert any(re.match(p,plain(phrase).replace(',',''),re.IGNORECASE) for p in quota_patterns),phrase
    print('OK cuota:',phrase)
assert 'ShowUsage("")' in s and 'accounts_status' in s
assert 'OfferSwitch(' in s and 'SelectAccount(' in s
assert 'select_account' in s and '¿Cambiar la cuenta' in s
print('PASS: comandos adicionales de cuotas y cambio de cuentas reconocidos por el código.')
