from pathlib import Path
root=Path(__file__).resolve().parents[1]
assert (root/'.gitignore').is_file()
for p in root.rglob('*'):
 if not p.is_file():continue
 assert p.name != 'connection.json',f'Sensitive pairing file in public repo: {p}'
 assert not p.name.endswith(('.pem','.key','.pfx')),f'private key in repo: {p}'
 if '.github' in p.parts and p.suffix in ('.yml','.yaml'):
  s=p.read_text();assert 'secrets.GITHUB_TOKEN' not in s or 'GH_TOKEN' in s
print('PASS: no local pairing secrets/keys in repository contents.')
