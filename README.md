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
  Discord, Spotify, Twitch y Steam; los 2 servicios son Mute y Deafen. Los íconos de plataformas y servicios
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
