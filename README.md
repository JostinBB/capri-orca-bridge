# Capri–Orca Bridge v0.10.1 — panel visual de cuotas, voz y proyectos

**Estado: experimental.** Esta versión superó **39/39 pruebas automatizadas Node** (HTTP real en localhost y host de Orca simulado), comprobaciones sintácticas de JavaScript y verificaciones léxicas/regex del C#. **No se ha compilado en Capri ni integrado en un Windows con Orca real**. Por tanto, el paquete no está certificado sin errores.

## Arquitectura

- `capri-mod/capri-orca-bridge.capri-code`: mod C# 5 que escucha el texto que Capri ya reconoce, usa la misma voz de Capri (`capri.Say`) y presenta confirmaciones antes de enviar prompts o cambiar cuentas.
- `orca-plugin/orca-plugin.json`, `main.mjs`, `bridge-core.mjs`: plugin Orca `trusted-worker` que controla proyectos, agentes, terminales e historial mediante **Orca Plugin Host API**. No simula teclas/clics.
- `orca-plugin/accounts.mjs`: solo para cuotas y cambio explícito de cuentas, utiliza la **CLI oficial** `orca account list --json` y `orca account select --agent ... --account ... --json`. La Host API pública **no** expone toda la información de cuotas; por eso existe esta pequeña integración CLI adicional. Los comandos se lanzan con `execFile` sin shell.
- `connection.json`: el servidor de Orca guarda un token aleatorio en `%LOCALAPPDATA%\CapriOrcaBridge\connection.json`; comunica **solo por 127.0.0.1**, rechaza solicitudes sin token y evita ejecutar dos veces una operación con el mismo `requestId`. No compartas este archivo ni una captura de su contenido.

## Requisitos

- Windows con Capri Desktop compatible con `// requires: api 3` y Orca **v1.4.261 o posterior** (Host API 1.10). Para consultar agentes por workspace se requiere **Orca Host API 1.10 o posterior**. Una versión más vieja puede iniciar el plugin pero ciertas funciones devolverán `unsupported`.
- Un agente ya autenticado en Orca (Codex/Claude/etc.). El plugin no aporta suscripciones, cuotas, modelos ni API keys.
- En Orca, activa **Settings → General → Orca CLI**. Comprueba en PowerShell `orca status --json` y `orca account list --json`; no compartas el segundo resultado sin ocultar emails y metadatos privados.
- En Windows el lector de cuentas usa primero `%LOCALAPPDATA%\Programs\Orca\resources\bin\orca.exe`; si instalaste Orca en una ubicación distinta, puedes definir `ORCA_CLI_COMMAND` como ruta absoluta a su ejecutable CLI (no `.cmd`). Sin CLI funcional el control habitual de sesiones continúa; solo falla la consulta/cambio de cuentas.

## Introducido en v0.10.0: ventana de cuotas estilo Capri

Puedes decir **«Capri, muestra mis cuotas»** (o **«Capri, show my quotas»**) para abrir una ventana flotante oscura con detalles en cian y rosa, barras de porcentaje por proveedor y ventanas de uso. **«Capri, oculta mis cuotas»** la esconde. No se simulan clics ni se crea otro motor de voz. La ventana utiliza el reconocimiento ya disponible en Capri y se muestra solo en tu PC.

Las preguntas «¿cuánto me queda?» también muestran el panel sin narrarlo. Si quieres escuchar los datos di **«Capri, léeme mis cuotas»**. No se muestran tokens exactos inventados. Cada ventana indica sus porcentajes cuando Orca los informa; las cuotas antiguas o no disponibles se identifican explícitamente. El diseño está **inspirado** en la paleta de Capri; no extrae el tema o assets privados de Capri.

La ventana se actualiza cada cinco minutos mientras permanezca visible, se oculta al cerrar el panel y se libera al desactivar el mod. Mostrarla no activa avisos por voz. Sin ejecución de clicks sobre Orca. La opción de mostrar/ocultar también aparece en el menú de mods.

## Desarrollo en GitHub

El código público se mantiene en **[JostinBB/capri-orca-bridge](https://github.com/JostinBB/capri-orca-bridge)**. La rama `main` contiene el puente y sus pruebas. **Este proyecto es experimental:** los tests de CI incluyen compilación C# contra un stub, que no equivale a la integración real de Capri y Orca en Windows. No publiques `connection.json` ni archivos de credenciales.

La carpeta `.github/workflows` incluye:

- `ci.yml`: pruebas Node/Python en Linux y compilación del mod C# **contra stub** en Windows.
- `upstream-watch.yml`: consulta diariamente las releases oficiales de Capri y Orca; abre una issue para revisión cuando detecta nuevas versiones.
- `publish-after-ci.yml`: después de un CI satisfactorio de un commit de `main`, verifica que `VERSION` coincida con el manifiesto, repite las pruebas en Windows y crea una **prerelease** con un ZIP únicamente cuando no existe una release para esa versión.
- `release.yml`: permite también publicar con un tag `vX.Y.Z` y pruebas Windows.

Para verificar una descarga, compara el SHA-256 del ZIP con `SHA256SUMS.txt`, publicado junto al artefacto de cada nueva release (en PowerShell: `Get-FileHash archivo.zip -Algorithm SHA256`). El `CHECKSUMS.sha256` de la raíz corresponde solo al estado inicial de v0.10.0, no a la rama actual.

**Importante:** las releases son experimentales hasta probar realmente Capri + Orca. La detección de actualizaciones no equivale a modificar el puente: para adaptar APIs se requiere un cambio de código revisado y pruebas. Consulte `CONTRIBUTING.md`.

## Instalación

1. Desactiva y retira **v0.9** de Capri y Orca antes de activar v0.10.1, para evitar dos servidores o dos interceptores de comandos.
2. Extrae todo el ZIP en una carpeta permanente, por ejemplo `C:\CapriOrcaBridge-v010`.
3. En Orca: **Settings → Plugins → Development folders…** → añade la subcarpeta `orca-plugin`. Revisa y acepta los permisos del worker. Si tienes la CLI habilitada puedes verificar primero con `orca plugin validate C:\CapriOrcaBridge-v010\orca-plugin`.
4. En Capri: **Mainframe → CAPRI → Mods → Import mod** → importa el archivo `capri-mod\capri-orca-bridge.capri-code`. Lee la advertencia antes de autorizarlo.
5. En Capri, escribe `Capri Orca conexion`. Como segunda verificación, ejecuta `diagnostico_windows.ps1` desde PowerShell. Después prueba los comandos **escritos** antes de probarlos por micrófono.

## Comandos de voz o texto

| Orden de ejemplo | Qué hace |
|---|---|
| «Capri Orca conexión» | Comprueba el servidor local, sin cambiar nada |
| «Capri, abre el proyecto Ventas» | Identifica el workspace; si hay varias coincidencias pregunta cuál |
| «Capri, dile a Codex que añada dos secciones» | Identifica **una terminal exacta**, pide confirmación visual y envía el prompt por Host API |
| «Capri, qué está haciendo Claude» | Consulta su estado y últimas líneas de salida |
| «Capri, avísame cuando termine Claude» | Vigila el estado mientras Capri esté abierto |
| «Capri, reanuda Claude» | Lista sesiones anteriores verificadas y pide confirmación antes de reanudar |
| «Capri Orca iniciar dictado para Claude» | Acumula un prompt dictado; puedes pausar, deshacer o enviarlo |
| **«Capri, cuánto me queda»** | Muestra % **restante por ventana** de cuota (5 h, semanal, etc.) para los proveedores disponibles |
| **«Capri, cuánto me queda de Codex»** | Consulta el panel con la cuota de Codex y el reinicio reportado por Orca |
| **«Capri, qué cuentas tengo»** | Enumera cuentas conocidas con su cuota cuando esté disponible, indicando activa/otra cuenta |
| **«Capri, avísame cuando se acabe mi cuota»** | Activa la revisión de cuotas cada cinco minutos mientras Capri esté abierto; informa solo cuando Orca confirma un porcentaje restante de 0 y sugiere alternativas verificadas |
| **«Capri, cambia de cuenta de Claude»** | Lista otras cuentas verificadas, permite elegir «la primera» y pide confirmación antes de cambiar la selección |

Para detener el seguimiento de cuotas di «Capri, deja de vigilar mis cuotas». Este seguimiento es **optativo** para no realizar consultas de red sin pedirlo; Orca aplica sus propias limitaciones de refresco.

Hay comandos equivalentes básicos en inglés; el reconocimiento real depende de la configuración de Capri. No instalamos otra voz ni usamos el micrófono de Orca dentro del plugin. La interrupción acústica (*barge-in*) la realiza Capri: `BargeIn` / `OverHerLocally` en su código fuente. Interrumpir la voz **no cancela el trabajo** del agente.

## Cómo leer los porcentajes

Orca publica `usedPercent`: el puente calcula **`remainingPercent = 100 - usedPercent`**, y muestra cada ventana (por ejemplo 5 horas y 7 días). **No es un contador exacto de tokens**. Si un proveedor no publica cuotas o la lectura falla, el puente dice **no disponible**, nunca inventa un porcentaje. Si el último dato es de hace más de 30 minutos, se marca como **lectura antigua**. Para distintas cuentas, se usan los datos de cuentas inactivas solo cuando Orca los haya almacenado.

**Diferencias importantes del cambio de cuenta:**
- `orca account select` modifica la cuenta usada para **nuevas sesiones** del proveedor. Las terminales Claude/Codex ya abiertas conservan normalmente la cuenta con la que empezaron. En los chats compatibles de Codex la selección puede aplicarse al siguiente mensaje, según Orca.
- Antigravity maneja un **login nativo compartido**; cambiar la cuenta no equivale a trasladar una conversación ni a garantizar cuota disponible.
- La elección de cuenta afecta a un proveedor de Orca en el host, **no solo al proyecto** que Capri esté mostrando.
- Si una cuenta carece de datos de cuota no se presenta como «cuenta con saldo»; se ofrece como disponible **sin cuota verificada**.

## Transferencia de contexto (limitación comprobada)

Orca **sí** ofrece en su interfaz nativa la función **Hand Off to Another Agent**: crea otra sesión e introduce un **contexto de traspaso acotado**, obtenido del historial/contexto que Orca puede capturar. No es garantía de copiar todo el historial sin límites. En la versión consultada de **Orca Plugin Host API** **no existe** una función pública `agent.handoff` ni otra llamada documentada que asegure ejecutar por programa esa transferencia integral.

Por tanto v0.10.1 **NO afirma haber automatizado el traspaso completo**. Si dices «transfiere todo el contexto», Capri avisa de esta limitación y no crea una nueva sesión con un resumen truncado haciéndolo pasar por el historial completo. Para transferir manualmente, usa **Hand Off to Another Agent** en la cabecera o menú de la sesión principal dentro de Orca.

La API de plugins tampoco expone enviar prompts a toda sesión **Chat UI**. El puente usa `terminal.sendText` solamente cuando Orca identifica una terminal real, no confunde dos agentes del mismo tipo y exige elegir destino si hay varias coincidencias. Para sesiones Chat UI, el usuario puede usar el Chat nativo de Orca.

## Correcciones incluidas en v0.10.1

- La consulta de cuotas considera **antiguos** los datos si Orca informa `error`, `idle`, `fetching` o `unavailable`, incluso cuando devuelve un porcentaje guardado con una fecha reciente. El porcentaje de caché puede mostrarse como referencia, pero **no sirve como saldo confirmado** ni para avisos de límite agotado.
- Al lanzar un agente, el puente exige que la Host API devuelva un `terminalId` válido antes de informar éxito. No reintenta lanzamientos de respuesta incierta, evitando ejecuciones duplicadas.
- Se admiten además identificadores documentados por Orca como `mimo-code`, `prime-agent`, `qoder-cn`, `zcode`, `omp`, `dsh` y `jcode`. Las variantes habladas «Mimo Code» y «Prime Agent» se normalizan. Que Orca documente un identificador **no significa** que ese agente esté instalado o autenticado.
- Revisadas las notas de Capri v0.9.3.1 (cambios en la búsqueda web y el antivirus de Windows) y la referencia Orca Host API 1.10, sin afirmar validación de integración real en Windows.

**Seguridad de errores CLI:** el puente no reenvía mensajes de error arbitrarios de `orca account list --json` a la respuesta HTTP, porque podrían contener rutas locales, credenciales o información de autenticación. Devuelve un diagnóstico genérico y remite a `orca status --json` y a los registros de Orca para investigar localmente. Esta protección no sustituye la autenticación del servidor loopback.\n\n## Verificación y diagnóstico

Desde la carpeta raíz:

```powershell
orca status --json
orca account list --json
orca plugin validate .\orca-plugin
.\diagnostico_windows.ps1
```

Las pruebas de código (si tienes Node y Python instalados):

```powershell
node --test .\tests\*.test.mjs
node --check .\orca-plugin\accounts.mjs
node --check .\orca-plugin\bridge-core.mjs
node --check .\orca-plugin\main.mjs
python .\tests\check_csharp.py
python .\tests\check_voice_patterns.py
```

El código completo de pruebas y resultados está en `REPORTE_PRUEBAS.md`. La sintaxis estática de C# **NO reemplaza el compilador de Capri**. Para errores reales consulta `%LOCALAPPDATA%\Capri\errors.txt` y `orca plugin logs local.capri-bridge`.

## Fuentes oficiales consultadas (17 noviembre 2026)

- [Capri Mod API](https://github.com/lachydotmcg/capri-desktop/blob/main/mods/MODDING.md)
- [Orca Host API](https://github.com/stablyai/orca/blob/main/docs/reference/plugin-host-api.md)
- [Orca plugin authoring](https://github.com/stablyai/orca/blob/main/docs/reference/plugin-authoring.md)
- [Orca account list y selección](https://github.com/stablyai/orca/blob/main/src/cli/specs/account.ts)
- [Orca usage tracking](https://github.com/stablyai/orca/blob/main/docs/site/content/docs/agents/usage-tracking.mdx)
- [Orca hot-swap Codex](https://github.com/stablyai/orca/blob/main/docs/site/content/docs/agents/codex-hot-swap.mdx)
- [Orca handoff Codex](https://github.com/stablyai/orca/blob/main/docs/site/content/docs/agents/codex.mdx)

Proyecto independiente; no está afiliado a los autores de Capri u Orca.