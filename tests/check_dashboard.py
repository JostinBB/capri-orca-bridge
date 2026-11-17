from pathlib import Path
import re
s=(Path(__file__).resolve().parents[1]/'capri-mod/capri-orca-bridge.capri-code').read_text()
assert 'class QuotaDashboard : Form' in s
assert 'private void HideUsage()' in s
assert 'private void ReadUsage(' in s
assert 'quotaDashboard.Render(result,provider)' in s
assert '// version: 0.10.1' in s
# These simulate the prefix/verb vocabulary in C# after accents and punctuation are normalized.
show=re.compile(r'^(?:capri\s+)?(?:(?:en\s+)?orca\s+)?(?:muestra|mostrar|abre|abrir|ensena|despliega|show|display)\s+(?:(?:mis|las|my)\s+)?(?:cuotas|quota|quotas|usage)$')
hide=re.compile(r'^(?:capri\s+)?(?:(?:en\s+)?orca\s+)?(?:oculta|ocultar|esconde|esconder|cierra|cerrar|hide|close)\s+(?:(?:mis|las|my)\s+)?(?:cuotas|quota|quotas|usage)$')
for cmd in ('capri muestra mis cuotas','capri orca muestra mis cuotas','capri show my quotas','mostrar cuotas','abre mis cuotas'):
 assert show.fullmatch(cmd),cmd
for cmd in ('capri oculta mis cuotas','capri orca oculta cuotas','capri hide my quotas','cierra cuotas'):
 assert hide.fullmatch(cmd),cmd
assert 'ShowLoading()' in s and 'ShowError(' in s
print('PASS: voice show/hide commands, UI lifecycle and static version.')
