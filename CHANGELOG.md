# WorkshopRS485 -- historial de versiones

## 2.6.8 -- 2026-10-30

- The side bar scrolls inside when it is taller than the window

## 2.6.7 -- 2026-10-30

- The page is no longer inside a card

## 2.6.6 -- 2026-10-30

- Manifest: sbcRequired true (needs WorkshopService); side bar keeps the group names

## 2.6.5 -- 2026-10-29

- Phone layout fixes (44 px touch targets, no overflow), Workbench full-screen section picker, clamps hint, interrupted jobs off the table, Machine scale label

## 2.6.4 -- 2026-10-29

- Audit and UX fixes: Jog owns workzeroaxis.g, restart notice with time, shared pulse table with update and download, side bar tooltips, spacing, wider field

## 2.6.3 -- 2026-10-29

- State chips with an icon: the icon carries the color and there is no dot (family.css); chosen chip tinted

## 2.6.2 -- 2026-10-29

- No 'no axis' warning in the device editor (a spindle has no axis)

## 2.6.1 -- 2026-10-29

- PID chart read from the service (any screen), Activity shows its active filters, health state without the duplicate icon

## 2.6.0 -- 2026-10-29

- Side bars: no gray line, a chosen item goes to the start of its section; Printing: start-up chip without the mode rows, tests notice only when the chip is not green, no-sensor fault reading; Vision: settings cards packed in columns, laser crosses only with Laser mode; Zones: visible mode dot

## 2.5.29 -- 2026-10-28

- Design family: final shared styles

## 2.5.28 -- 2026-10-28

- Design family: page bar with lead, own design css removed, section color as --wf-sec

## 2.5.27 -- 2026-10-28

- Header badge icon always white; Lights: how-it-works note inside the Summary, save bar only with changes

## 2.5.26 -- 2026-10-28

- Minimalist design: neutral page bar with a solid badge, text side items and tabs with a section line (they wrap), neutral cards, state as dot and word, no tinted backgrounds

## 2.5.25 -- 2026-10-27

- Plan warnings in words, risk dialogs in DWC style, mesh point selection, link to Machine modes

## 2.5.24 -- 2026-10-27

- Side bar no longer makes the page jump when a shorter section is chosen; start-up chip as in every page (header, same wording)

## 2.5.23 -- 2026-10-26

- Run-time guard: the 3.6 build refuses to start on a host with window.DWC and the 3.7 build outside DWC 3.7.x (visible warning); shipped as a strict per-line zip (dwcVersion 3.6 / 3.7)

## 2.5.22 -- 2026-10-26

- Shared pages: accessible names, contrast, start-up guide, API token under /opt/dsf/conf and split HTTP statuses.

## 2.5.21 -- 2026-10-24

- RS485: bus with no adapter reads 'not configured'

## 2.5.20 -- 2026-10-24

- Start-up assistant: active lines highlighted, single-step way back, dark select options; Lights time picker and defaults; Printing FFF switch; Mesh handles above the points

## 2.5.19 -- 2026-10-24

- Start-up card reports its pending count to the service (machine setup list)

## 2.5.18 -- 2026-10-23

- Follow a sign-in or logout made in another tab

## 2.5.17 -- 2026-10-23

- One sign-in for every tab (token in localStorage)

## 2.5.16 -- 2026-10-23

- Header: no health chip while signed out

## 2.5.15 -- 2026-10-23

- Compact live job strip in the bar; page header treats an expired session as sign in; numeric PIN field

## 2.5.14 -- 2026-10-23

- Page header asks who is signed in; PIN field is numeric

## 2.5.13 -- 2026-10-23

- Common page header: health chip, session chip, quiet start-up icon when ready

## 2.5.12 -- 2026-10-23

- Side bar sections no longer overflow the page on narrow screens (under 900 px)

## 2.5.11 -- 2026-10-22

- Side-bar pin only while the bar is open; Lights panel counts only the faults the service marks

## 2.5.10 -- 2026-10-22

- Pin on every side bar, thin scrollbars, one sign-in dialog

## 2.5.9 -- 2026-10-22

- Sign-in never opens by itself; keyboard only on touch

## 2.5.8 -- 2026-10-22

- Fix names, values and catalog markers the English rename left behind

## 2.5.7 -- 2026-10-22

- Sessions made clear: not-signed-in chip, sign-in on visitor 403, refusal toast

## 2.5.6 -- 2026-10-22

- Sign-in dialog focus and kiosk keyboard helper; Jog blocked touches explained

## 2.5.5 -- 2026-10-22

- Kiosk keyboard helper call, sign-in dialog font

## 2.5.4 -- 2026-10-22

- Jog and bars tell why an action is blocked and ask for the session; Jog loses the Machine pointer sections

## 2.5.3 -- 2026-10-22

- Sign-in dialog redesign and on-screen keyboard; single floating panel for power actions; risk bar on one line; Jog gear and scrollbar; side tabs transition

## 2.5.2 -- 2026-10-21

- PIN sign enters by itself when the PIN has the length that worked last time

## 2.5.1 -- 2026-10-21

- Side bar: pin next to the fold arrow keeps the bar open

## 2.5.0 -- 2026-10-21

- Roles in the backend: every `rs485.*` operation has a minimum role (viewer / operator / technician / admin, one table in `dsf/rs485_access.py`); a call from the page asks the service who the person is (`auth.resolve`) and is refused with 401 / 403 / 503 otherwise. Writing a profile parameter needs a technician, a raw register or `force` an administrator. A machine without users behaves as before. New permission `networkAccess` (local request to the service). The page hides the buttons the role cannot use.

## 2.4.3 -- 2026-10-21

- Keep the copy of workshop_api.py equal to the service (conflict status)

## 2.4.2 -- 2026-10-21

- Add device opens again (renamed bindings repaired), noise is no longer a device, JSON profile example with the documented keys

## 2.4.1 -- 2026-10-21

- Page reloads when the DWC language changes; Vision pins dsf-python below 3.7; meter wizard copy over http

## 2.4.0 -- 2026-10-21

- English migration: texts through the catalog, no in-browser translator, interfaces per part

## 2.3.1 -- 2026-10-20

- English names: remaining values, ids, theme panels and the Vision backend keys (fixes a mismatch with the page)

## 2.3.0 -- 2026-10-20

- All the code, data keys and enum values are in English; stored data is converted by the one-off migration script

## 2.2.2 -- 2026-10-18

- Start-up entry is a chip in the page header

## 2.2.1 -- 2026-10-16

- Start-up strip directly under the header card (it was inside the Devices tab)

## 2.2.0 -- 2026-10-16

- Start-up card is now a dialog opened from a strip on the page (one card per function, progress, step-by-step assistant), with a plain explanation for every row

## 2.1.13 -- 2026-10-16

- Start-up assistant (shared piece), Lights: the strip pin is chosen in Advanced (plain LED removed)

## 2.1.12 -- 2026-10-15

- Start-up card (shared piece): Printing assistant renamed so it no longer collides with the card

## 2.1.11 -- 2026-10-15

- Rebuilt with the shared start-up card piece

## 2.1.10 -- 2026-10-15

- Spanish texts with accents and enie

## 2.1.9 -- 2026-10-15

- Hide every mention of another plugin when it is absent

## 2.1.8 -- 2026-10-14

- Cleanup: no more lookups of the old service Id (PiCustomCodes) or mentions of the removed custom G-codes

## 2.1.7 -- 2026-10-14

- Header is its own card above the side bar, like the other pages

## 2.1.6 -- 2026-10-14

- Side bar icons are 18 px like the bar of Vision

## 2.1.5 -- 2026-10-13

- The side bar is like the ones of Vision and the Work table: 190 px, 52 px folded with the double arrow in the middle, it folds by itself after choosing and opens only with the arrow (nothing floats over the page when the pointer passes by)

## 2.1.4 -- 2026-10-13

- The side bar has the double arrow (fold / open) like the bar of Vision, besides folding by itself after choosing

## 2.1.3 -- 2026-10-13

- The side bar has no pin: it is open at first, folds to the icons by itself when something is chosen and opens again over the page with the pointer or the focus

## 2.1.2 -- 2026-10-13

- The side bar uses the same measures and colors as the bar of Vision (190 px, sticky under the DWC bar)

## 2.1.1 -- 2026-10-13

- The side bar can be pinned or collapse by itself (pin button)

## 2.1.0 -- 2026-10-13

- Tabs as a side bar (like Work table and Vision)

## 2.0.3 -- 2026-10-13

- No longer evaluates the old service Id (PiCustomCodes): it left "Failed to execute EvaluateExpression" in the DCS log about once a minute

## 2.0.2 -- 2026-10-13

- Files and macros written by the plugin are in English; bilingual risk texts

## 2.0.1 -- 2026-10-13

- Official localization completed: no Spanish text left in the sources, texts with parameters are single keys

## 2.0.0 -- 2026-10-13

- Central API: POST /machine/WorkshopRS485/api with rs485.* operations; the custom code M9010 is gone (only G28 is still intercepted). Macros read plugins.WorkshopRS485.data.rs485

## 1.15.0 -- 2026-10-13

- Official DWC localization: es.json / en.json via registerPluginLocalization

## 1.14.1 -- 2026-10-12

- Publish only on change, fewer IPC calls, system wording

## 1.14.0 -- 2026-10-12

- Diagnostico del adaptador y barrido de direcciones, equipos ausentes, espera creciente sin adaptador; dwcVersion 3.6

## 1.13.1 -- 2026-10-11

- Declara la dependencia de WorkshopService

## 1.13.0 -- 2026-10-11

- Carpetas en ingles bajo 0:/sys/workshop (datos, disenos, malla, cortar por partes); arreglos de la Mesa de trabajo

## 1.12.1 -- 2026-10-11

- Las paginas vuelven a cargar (punto y coma en safe-saving.js)

## 1.12.0 -- 2026-10-11

- Id nuevo en ingles (Workshop...) y guardado seguro ante cortes de luz

# TallerRS485 -- historial de versiones

## 1.11.2 -- 2026-10-11

- Compatibilidad con los Id nuevos en ingles (etapa 1, sin cambiar el Id); Motores: tabla de referencias del techo de pulsos

## 1.11.1 -- 2026-10-10

- Los M9010 quedan en el historial de comandos recibidos

## 1.11.0 -- 2026-10-10

- Perfiles de equipo en JSON: importar un perfil llena las tablas de parametros y alarmas (opcional, lo que falte se completa a mano); exportar el perfil propio; ejemplo; revisar un perfil antes de usarlo

## 1.10.3 -- 2026-10-10

- Estilo comun segun DESIGN.md (alto de botones, colores de la paleta, encabezados)

## 1.10.2 -- 2026-10-10

- Los comandos de la pagina van por HTTP desde el primero (antes salian por G-code mientras cargaban los plugins) y reintentan ~15 s si el servicio se esta reiniciando

## 1.10.1 -- 2026-10-10

- Estandar de advertencias y nombre visible del servicio (Servicio de la Pi)

## 1.10.0 -- 2026-10-10

- Las paginas mandan sus comandos M9000/M9003/M9010 por HTTP al servicio de la Pi (sin la cola de la Duet); si el servicio no lo tiene, vuelven al G-code (permiso registerHttpEndpoints)

## 1.9.0 -- 2026-10-10

- Comandos M9003 en ingles; los nombres en español siguen como alias; traducciones al ingles completas

## 1.8.0 -- 2026-10-10

- Equipo Modbus generico: comprueba que conteste aunque no tenga registros; Explorar registros; Identificar fabricante y modelo (Modbus funcion 43), tambien al detectar un equipo nuevo; historial legible con tema claro; Los trabajos en vivo (por red o USB) se nombran 'trabajo en vivo' en vez de un nombre de programa

## 1.7.1 -- 2026-10-10

- Una falla que sigue activa cuando el plugin se reinicia (ej. Err39) ya no se anota otra vez en el historial; si el equipo no tiene eje, tampoco se vuelve a avisar

## 1.7.0 -- 2026-10-10

- Deteccion automatica: al conectar un adaptador nuevo prueba todas las velocidades y le crea su bus; en los buses busca direcciones nuevas cada 2 min (nunca durante un trabajo); lo que aparece se agrega sin eje y avisa. Redisenados: tarjeta del dispositivo (cabecera con estado, mini grafica, alarma explicada por pasos, plegable), codigos de alarma (filtros y filas plegables), historial (resumen, por dia, duracion de cada falla) y estados en vivo (buscador, grupos plegables, resalta lo que cambia)

## 1.6.0 -- 2026-10-10

- Editor de dispositivo en ventana (Equipo / Conexion / Vigilancia) con los valores exactos de P-181/182/183 del T3D; Buses y adaptadores rehecho (adaptadores detectados, tarjetas por bus con estado y equipos, Avanzado plegado, Buscar -> Agregar con el editor prellenado); Como funciona = guia de puesta en marcha con pasos que se marcan solos

## 1.5.2 -- 2026-10-10

- Filtrar por etiqueta funciona (antes volvia a Todos al tocarla) y se combina con los otros filtros; panel de etiquetas compacto, con scroll, que se cierra al elegir

## 1.5.1 -- 2026-10-09

- Un parametro que el servo no informa (ej. P-003 version de software) ya no aparece como invalido

## 1.5.0 -- 2026-10-09

- Parametros del servo mas intuitivos: cada uno con icono, etiquetas segun lo que hace (sentido de giro, seguridad, sintonia, pulsos de la Duet, requiere reinicio, protegido...), que hace en palabras simples, riesgo de cambiarlo, opciones como botones, barra de rango con actual/fabrica/nuevo, funciones de DI/DO por nombre, filtro por etiqueta

## 1.4.0 -- 2026-10-09

- Eje por dispositivo (sin eje = solo aviso, cuenta en 'avisos'; con eje = pausa y bloquea el home del eje si el servo esta en falla), tabla completa del T3D segun el manual V2.3 (256 registros, valor de fabrica, modo, escala, validacion por digitos, internos en solo lectura), respaldos de parametros en la SD con comparar/restaurar, historial de fallas, alarmas Err30-33, graficas de torque/corriente funcionando, deteccion de trabajo en vivo

## 1.3.1 -- 2026-10-09

- Mensaje de alarma no borrable sin texto repetido

## 1.3.0 -- 2026-10-09

- Servo T3D: estados en vivo (30 variables de monitoreo), codigos de alarma con significado, que revisar y como se borra; pestanas Charts / Estados / Parametros / Alarmas; no intenta borrar alarmas no borrables

## 1.2.3 -- 2026-10-09

- Ctrl+rueda / Ctrl+tecla pasan al zoom de Chrome

## 1.2.2 -- 2026-10-09

- Estado con contador 'fallas' (lo usan las luces de estado)

## 1.2.1 -- 2026-10-09

- Estado con contador seq: la pagina Servicios sabe si el plugin esta al dia

## 1.2.0 -- 2026-10-09

- Nuevo tipo de bus: el puerto RS485 de la propia Duet (RRF hace de maestro Modbus); permisos reducidos

## 1.1.0 -- 2026-10-09

- Parametros del servo T3D: todos se leen al abrir, por categorias, con nombre en espanol, valor actual, rango u opciones permitidas, edicion por lote con verificacion, guardar en EEPROM y respaldo descargable

## 1.0.0 -- 2026-10-09

- Buses RS485 (adaptadores USB) con un solo maestro por cable, dispositivos con perfil: servo T3D (alarma, torque, corriente, pausa por falla, parametros P-xxx) y Modbus generico
