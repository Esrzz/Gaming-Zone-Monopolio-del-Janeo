import { createContext, useContext } from 'react'
import { BOARD } from '../engine'
import type { Tile } from '../engine'

/** Tablero de la partida en curso (nombres e íconos de los juegos de esa sala). Los componentes lo leen con `useBoard()`. */
export const BoardContext = createContext<Tile[]>(BOARD)
export const useBoard = () => useContext(BoardContext)
