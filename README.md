# Gaming Zone: Monopolio del janeo

Juego tipo Monopoly online para la comunidad de Gaming Zone. Estética tomada de
[Esrzz/gaming-zone](https://github.com/Esrzz/gaming-zone).

## Estado actual

- Pantalla inicial: nombre de perfil, con avatar automático si coincide con un miembro del server
  (`src/data/avatars.json`, comparación sin mayúsculas, acentos ni símbolos).
- Menú: Jugar (Hostear / Unirse con código) y Configuraciones. Hostear y unirse todavía son maquetas.
- Modo developer (solo perfiles Criatura y Misunder): interruptor en el header y, en el menú, "Iniciar partida de
  prueba": partida local de 2 a 6 jugadores donde el dev tira los dados de todos los turnos (con opción de dados manuales).
  Usa el motor real y un tablero provisorio (`src/components/Board.tsx`).
- Casillas: las 22 calles son los juegos más jugados del server (más horas = más cara). Las 4 plataformas son
  YouTube, Spotify, Twitch y Steam; los 2 servicios son Mute y Deafen. Los íconos de plataformas y servicios
  son genéricos: se reemplazan por los oficiales en `public/icons/` (mismo nombre de archivo).
- Para actualizar el ranking de horas: `node scripts/ranking.mjs ruta/al/stats.json` o con la URL del worker
  (`node scripts/ranking.mjs https://<worker>/stats.json`). Escribe `src/data/ranking.json`.

## Comandos

```
npm install
npm run dev      # http://localhost:5173
npm test         # tests del motor y de utilidades
npm run build
```

## Plan

1. Motor de reglas en `src/engine/` (hecho: turnos, compra, alquiler, impuestos, cárcel, bancarrota; falta: casas, hipotecas, subasta, cartas) (TypeScript puro, con tests): tablero, turnos, compra, alquiler,
   cartas, cárcel, hipotecas, casas y hoteles, bancarrota, reglas configurables.
2. Comercio entre jugadores.
3. Salas online (Cloudflare Durable Objects + WebSockets) con código de sala.
4. Tablero con fichas animadas y chat.
5. Login con Discord, historial, medallas y récords (al final).

## Despliegue

Cloudflare Pages (front) y Workers/Durable Objects (salas).

## Intercambios

Cualquier jugador puede proponer un intercambio en cualquier momento (aunque no sea su turno) con otro jugador vivo.
Hay una sola oferta abierta a la vez. Cada lado puede dar plata, propiedades y cartas de salida.

- Solo acepta o rechaza quien recibe la oferta; solo cancela quien la hizo. Al aceptar se vuelve a validar todo.
- No se intercambian propiedades de un grupo de color que tenga casas u hoteles (hay que venderlos antes).
- Quien recibe una propiedad hipotecada paga el 10% del valor de la hipoteca al banco (sigue hipotecada).
- Si un jugador quiebra, se cancela su oferta abierta.
- Código: `src/engine/trade.ts` (reglas) y `src/components/TradeModal.tsx` (interfaz).

## Cartas

Al caer en Suerte o Arcas del discord hay que hacer clic en el mazo del tablero: la carta sale, se da vuelta y muestra
su texto (se cierra con un clic o a los 4,5 s) y recién ahí se aplica el efecto.

## Audio

- **Música**: cualquier `.mp3/.ogg/.wav/.m4a` en `public/audio/Music/` aparece sola en Configuraciones → Audio.
- **Efectos**: una carpeta por efecto en `public/audio/Efectos/<Nombre>/`; si hay varias variantes se elige una al azar.
  Nombres usados: `Cardbought`, `Dados`, `Jail`, `Lose`, `Slice`, `Victory`, `cardtaken`, `click`, `moneycollected`, `moneypaid`, `neg`, `timerout`.
- La lista se genera con el plugin `vite-plugins/audioManifest.ts` (`/audio/manifest.json`), sin tocar código.
- Los dados giran con números al azar hasta que termina el sonido `Dados`; `timerout` arranca cuando faltan tantos segundos como dura el audio (termina junto con el turno) y se corta si el turno acaba antes.

## Turno, tarjetas de propiedad y descripciones

- **Timer**: un único reloj por turno (240 s, `VITE_TURN_SECONDS`) que corre durante todo el turno, no solo antes de tirar. Al agotarse se juega solo lo que falte (tirar, no comprar, sacar carta, terminar turno).
- **Intercambios**: solo se pueden proponer en tu turno (antes o después de tirar). Al proponer, el reloj del turno queda en pausa y corre el de quien recibe la oferta (60 s, `VITE_TRADE_SECONDS`); si se agota, se rechaza.
- **Tarjeta de propiedad**: al caer en una propiedad sale de la casilla con su info; libre → Comprar / No comprar, ajena → Pagar. Cualquier casilla comprable se puede consultar con un clic, también fuera de turno.
- **Descripciones**: en `src/engine/board.ts`, cada elemento de `STREET_SLOTS` acepta `description: '...'` (y `platform(nombre, icono, descripcion)` / `utility(...)`); la tarjeta la muestra.
- **Mazos**: se barajan al crear la partida (el orden queda guardado en el estado, así que el motor sigue siendo determinista). `createGame(jugadores, reglas, random)` acepta un `random` propio para que el servidor decida el orden.

## Gestionar propiedades y dados

- **Gestionar** (en tu turno, antes o después de tirar): construir casas/hotel, venderlas (a la mitad) e hipotecar (el banco paga la mitad del precio; levantar la hipoteca cuesta el valor + 10%). Reglas del Monopoly original: hace falta el barrio completo sin hipotecas, se construye y vende parejo, y hay 32 casas y 12 hoteles (`housesTotal` / `hotelsTotal` en las reglas). Para hipotecar hay que vender antes las casas del barrio.
- Casas, hoteles e hipotecas se ven en el tablero. Una propiedad con casas no se puede intercambiar.
- **Dados**: tienen puntos; un clic los tira (en tu turno) y un clic durante la animación la acelera. El movimiento de la ficha es más lento y el sonido `Slice` se ajusta a su duración.

## Plata insuficiente (deudas)

Si un pago no se llega a cubrir con efectivo pero **sí** vendiendo casas e hipotecando (`liquidValue`), no hay bancarrota:
se crea una deuda (`state.debts`, evento `debt`) y se bloquea tirar, comprar, terminar turno, etc. (`BLOCKED_BY_DEBT`)
hasta juntar la plata. Gestionar se abre solo; apenas alcanza, la deuda se paga sola (`settleDebts`). También se puede
declarar bancarrota (los bienes van al acreedor). Si ni liquidando todo alcanza, la bancarrota es inmediata.

## Mazos

Cada mazo es `{draw, discard}` de ids de carta, mezclado con el azar del motor. La carta sale de `draw` al caer, va a
`discard` tras aplicarse (salvo "Salí de la cárcel gratis", que la guarda el jugador y vuelve al descarte al usarla o
si quiebra). Cuando `draw` se vacía, se rebaraja el descarte.

## Preparación multijugador (lógica lista, servidor pendiente)

- **Azar del motor**: `state.rng` (mulberry32). `createGame(players, rules, seed|fn)`. `roll` sin `dice` tira el motor.
  El servidor debe llamar `applyAction(state, action, { clientDice: false })` para rechazar dados del cliente.
- `isServerOnly(action)` (`abandon`), `toPublicState(state)` (oculta orden de mazos y rng), `timeoutAction(state)`
  (acción automática al vencer el reloj), `sanitizeRules`, `state.seq` (contador de acciones, útil para sincronizar).
- `src/engine/lobby.ts`: salas, host, listos, reglas, inicio, `dispatch` con validaciones, desconexión con gracia de
  2 min (`expiredMembers` → `abandon`), `publicRoom`.
- `src/engine/protocol.ts`: mensajes cliente/servidor, `parseClientMessage`, `sanitizeChat`, `PROTOCOL_VERSION`.
- Falta: Durable Object + WebSocket que los use, cliente online, reconexión y chat en la UI.
