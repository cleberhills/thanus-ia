/**
 * Leitura dos recursos da máquina para a escolha do modelo local (SPEC-Endurecimento-04).
 *
 * Separado da regra (`@shared/domain/modelo-local-por-recursos`) porque ler memória e carga é
 * I/O de sistema — e a regra precisa continuar testável sem ele.
 *
 * `os.loadavg()` devolve `[0, 0, 0]` no Windows; nesse caso a carga é reportada como 0, o que
 * desliga só a preferência "menor por carga alta" — a checagem de memória, que é a que evita o
 * swap, continua valendo.
 */

import { cpus, freemem, loadavg, totalmem } from 'node:os'
import type { RecursosDaMaquina } from '@shared/domain/modelo-local-por-recursos'

const MB = 1024 * 1024

export interface FontesDeRecursos {
  readonly totalmem: () => number
  readonly freemem: () => number
  readonly loadavg: () => number[]
  readonly nucleos: () => number
}

const FONTES_DO_SO: FontesDeRecursos = {
  totalmem,
  freemem,
  loadavg,
  nucleos: () => cpus().length
}

export function lerRecursosDaMaquina(fontes: FontesDeRecursos = FONTES_DO_SO): RecursosDaMaquina {
  const nucleos = Math.max(1, fontes.nucleos())
  const carga1m = fontes.loadavg()[0] ?? 0
  return {
    memoriaTotalMb: Math.floor(fontes.totalmem() / MB),
    memoriaLivreMb: Math.floor(fontes.freemem() / MB),
    cargaPct: Math.round((Math.max(0, carga1m) / nucleos) * 100)
  }
}
