// Genera src/data/ranking.json con los juegos del server ordenados por horas jugadas.
// Uso:
//   node scripts/ranking.mjs ruta/al/stats.json
//   node scripts/ranking.mjs https://<tu-worker>/stats.json
// Horas por juego = suma de `games` + `ranchoGames` de todos los miembros.
import { readFile, writeFile } from 'node:fs/promises'

const [src, out = 'src/data/ranking.json'] = process.argv.slice(2)
if (!src) {
  console.error('Falta el origen: una ruta a stats.json o la URL del worker')
  process.exit(1)
}

const raw = /^https?:\/\//.test(src) ? await (await fetch(src)).text() : await readFile(src, 'utf8')
const stats = JSON.parse(raw)

const seconds = {}
for (const m of Object.values(stats.members)) {
  for (const key of ['games', 'ranchoGames']) {
    for (const [game, s] of Object.entries(m[key] ?? {})) seconds[game] = (seconds[game] ?? 0) + s
  }
}

// Solo juegos con ícono (los que están en gameApps)
const ranking = Object.keys(stats.gameApps)
  .map((name) => ({
    name,
    hours: Math.round(((seconds[name] ?? 0) / 3600) * 10) / 10,
    icon: stats.gameIcons?.[name] ?? null,
  }))
  .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))

await writeFile(out, JSON.stringify(ranking, null, 2) + '\n')
console.log(`${ranking.length} juegos -> ${out}`)
ranking.slice(0, 5).forEach((g, i) => console.log(`${i + 1}. ${g.name} (${g.hours} h)`))
