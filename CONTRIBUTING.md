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
2. Actualizar `VERSION`, `orca-plugin/orca-plugin.json`, cabecera del mod y `compatibility/upstreams.json`.
3. Esperar a CI en Linux/Windows; ejecutar pruebas reales con las aplicaciones.
4. Crear tag anotado: `git tag -a v0.10.0 -m "Capri-Orca Bridge v0.10.0"` y `git push origin v0.10.0`.
5. El workflow crea una release de GitHub, **prerelease** por defecto, solo si los checks del job Windows pasan.

El repositorio no puede verificarse de forma equivalente a Windows desde un contenedor Linux sin Capri/Orca.
