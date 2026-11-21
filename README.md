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
