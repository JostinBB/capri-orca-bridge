# Reporte de pruebas — Capri-Orca Bridge v0.10.0

Fecha: 16/11/2026.

## Ejecutado en este entorno

- **33/33 tests Node** aprobados: HTTP localhost real, control de autenticación, idempotencia, selección de proyecto/agente, cuotas y JSON, rutas y prueba estructural del nuevo panel.
- **4 verificaciones Python**: `check_csharp.py`, `check_voice_patterns.py`, `check_dashboard.py`, `check_public_repo.py` aprobadas.
- `node --check` pasó en `orca-plugin/main.mjs`, `bridge-core.mjs`, `accounts.mjs`.
- Se comprobó que el proyecto público no incluye `connection.json` ni claves privadas.

## Pruebas que **NO** se han realizado

- Compilación C# en Windows/Capri real (no hay .NET, csc ni Windows en este entorno).
- Validación de manifest por el binario Orca real; la integración HTTP del servidor utilizó una Host API simulada.
- Apertura visual del formulario WinForms ni pruebas de interacción con el micrófono.
- Cuentas reales Claude, Codex, Antigravity y sus cuotas.
- Verificación de `gh repo create` y workflows sobre el GitHub del usuario; todavía no existe el repo.

La carpeta `tests/windows-compile/` incorpora compilación sintáctica C# con stub en GitHub Actions para el futuro; **no** equivale a compilar con Capri en el equipo.

## Riesgos conocidos

- El sistema de voz de Capri depende de su configuración de micrófono y reconocimiento.
- Las cuotas pueden ser antiguas/no disponibles; el panel las marca y no inventa números.
- El traspaso nativo de contexto a otro agente no está expuesto por la Host API pública. No se automatiza ni promete copiar todo el historial.
- Sesiones Chat UI no son todas enviables mediante `terminal.sendText`.
- El panel WinForms se diseñó para Windows. Es intencional y el mod no está preparado para Mac/Linux.
