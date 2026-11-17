# Reporte de pruebas — Capri-Orca Bridge v0.10.1

Fecha de revisión: 17/11/2026.

## Evidencia automatizada en GitHub Actions

- **39/39 tests Node aprobados**, 0 fallos, en [CI del PR #7](https://github.com/JostinBB/capri-orca-bridge/actions/runs/44098013334). Incluyen servidor HTTP real en loopback, autenticación, idempotencia, manejo de cuotas, validación de agentes y pruebas estructurales del panel.
- **4 verificaciones Python** aprobadas: `check_csharp.py`, `check_voice_patterns.py`, `check_dashboard.py`, `check_public_repo.py`.
- `node --check` aprobado para los módulos JavaScript del plugin.
- **Compilación C# en runner Windows contra stub** aprobada. Valida tipos y sintaxis previstos por el stub, no la integración con Capri real.
- **Paquete ZIP verificado en runner Windows**: se comprobaron los archivos fundamentales y el SHA-256 generado se verificó contra el ZIP. El empaquetado utiliza `tools/package.ps1`.
- La release definitiva de v0.10.1 requiere además pasar el CI del commit fusionado en `main` y el flujo de publicación. El PR #7 acredita las pruebas de la rama, no integración con dispositivos reales.

## Pruebas que NO se han realizado

- Compilación del mod contra ensamblados reales de Capri en Windows.
- Validación de manifest y llamadas de Host API con Orca ejecutándose en un dispositivo real.
- Visualización e interacción del panel WinForms y uso de micrófono o interrupciones por voz.
- Consultas de cuotas en cuentas reales de Claude, Codex y Antigravity.
- Traspaso de contexto integral de Chat UI a otras sesiones (Host API no expone esa garantía).

## Riesgos conocidos y alcance

- Las cuotas sin lectura válida o actual se marcan como no confirmadas; no se calculan tokens inventados.
- `terminal.sendText` solo alcanza terminales verificadas; no permite enviar a una sesión Chat UI por sí mismo.
- El handoff nativo de Orca no tiene contrato público de automatización integral en la Host API 1.10.
- El panel usa Windows Forms: el mod no es compatible con Mac/Linux de manera demostrada.
- Una prerelease indica pruebas automatizadas, NO certificación con el escritorio, agentes y micrófono reales.

## Versiones fuente revisadas

- [Capri Desktop v0.9.3.1](https://github.com/lachydotmcg/capri-desktop/releases/tag/v0.9.3.1): referencia de mod C# `// requires: api 3`.
- [Orca v1.4.261](https://github.com/stablyai/orca/releases/tag/v1.4.261): referencia Host API 1.10 y `agent.launch`.
