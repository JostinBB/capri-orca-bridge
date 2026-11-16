# Guía de contribución / release

## Seguridad y publicación

Nunca añadas `connection.json` (token de comunicación), tokens OAuth, archivos `.env`, correo real o rutas privadas. Antes de subir: `python tests/check_public_repo.py`.

## CI reproducible

- `node --test tests/*.test.mjs`
- `node --check orca-plugin/{main,bridge-core,accounts}.mjs` (ejecuta por archivo si el shell no soporta llaves)
- `python tests/check_csharp.py && python tests/check_voice_patterns.py && python tests/check_dashboard.py && python tests/check_public_repo.py`
- En **Windows**, `dotnet build tests/windows-compile/CapriBridgeCompile.csproj -c Release`
- En equipo real: importar .capri-code en Capri Desktop, verificar suscripción, UI y comandos; instalar el plugin en Orca, ejecutar `orca plugin validate ./orca-plugin`, comprobar cuotas, versiones y no repetición de prompts.

## Upstream watch

El workflow diario crea una issue cuando hay releases nuevas de `lachydotmcg/capri-desktop` o `stablyai/orca` que aún no figuran en `compatibility/upstreams.json` como revisadas. Se revisa la diferencia, se adapta solo lo necesario, se ejecuta CI y la validación Windows. Entonces se actualiza `reviewedRelease`.

**La detección automática no puede certificar compatibilidad ni generar cambios fiables sin revisar el código y ejecutar pruebas.** Nunca crear una release solo por detectar una nueva versión.

## Release

1. Adaptar código y tests; actualizar README y reporte.
2. Incrementar `VERSION`, `orca-plugin/orca-plugin.json`, la cabecera del mod y `compatibility/upstreams.json` cuando corresponda.
3. Esperar la finalización satisfactoria del CI de `main` (Node/Python/Linux y compilación Windows contra stub).
4. `publish-after-ci.yml` vuelve a verificar los tests en Windows y publica **una prerelease por versión**, si el tag aún no existe. No crea releases sin CI en verde.
5. Validar manualmente en instalaciones reales de Capri y Orca. La prerelease debe seguir marcada como experimental mientras esta validación no exista.
6. El flujo `release.yml` de tags es una alternativa manual; no es necesario para la publicación normal.

Las GitHub Actions usan `GITHUB_TOKEN` únicamente del repositorio; no publican tokens personales.

El repositorio no puede verificarse de forma equivalente a Windows desde un contenedor Linux sin Capri/Orca.