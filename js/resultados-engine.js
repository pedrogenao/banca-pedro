/* ========================================================================
   RESULTADOS-ENGINE.JS
   Motor de cálculo de aciertos y premios: obtiene el resultado oficial de una lotería/fecha y calcula cuánto ganó una jugada según sus números.
   ======================================================================== */

/* ======================================================================
   ADMIN: COBROS — motor inteligente de aciertos y premios
   Reglas de pago: 1er lugar x60, 2do lugar x14, 3er lugar x4
   (multiplicador aplicado sobre el monto jugado por número).
   ====================================================================== */
const MULTIPLICADOR_PREMIO = [60, 14, 4]; // índice 0 = 1ra, 1 = 2da, 2 = 3ra

let RESULTADOS_CACHE = {}; // `${loteria}__${fecha}` -> array de números o null
async function obtenerResultadoOficial(loteria, fecha){
  const key = `${loteria}__${fecha}`;
  // Solo cacheamos resultados YA publicados (esos nunca cambian). Si
  // todavía no hay resultado, NO lo guardamos en caché: se puede publicar
  // en cualquier momento, y si lo cacheáramos como "null" la jugada se
  // quedaría pegada en "en espera" para siempre hasta refrescar la página.
  if(key in RESULTADOS_CACHE) return RESULTADOS_CACHE[key];
  try{
    const doc = await db.collection('loterias').doc(loteria).collection('resultados').doc(fecha).get();
    const valor = doc.exists ? (doc.data().numeros || []) : null;
    if(valor !== null) RESULTADOS_CACHE[key] = valor; // definitivo: sí se cachea
    return valor;
  }catch(err){
    console.error('Error consultando resultado oficial de', loteria, fecha, err);
    return null;
  }
}

/* Normaliza un número de jugada/resultado a 2 dígitos para poder comparar
   sin importar si viene con o sin el cero por delante (ej: "7" y "07" son
   el mismo número, y "0"/"00" corresponden ambos al 100). */
function normalizarNumeroComparacion(n){
  return String(n).trim().padStart(2,'0');
}

/* Compara los números jugados contra el resultado oficial y calcula el
   importe a cobrar según la posición en que acertó cada número.

   IMPORTANTE: un mismo número jugado puede coincidir en MÁS DE UNA
   posición del resultado oficial — por ejemplo, si el "07" salió tanto
   en 1ra como en 3ra en el mismo sorteo. Antes se usaba findIndex(), que
   se queda con la PRIMERA coincidencia que encuentra y ya no sigue
   buscando, así que la segunda posición (igual de válida y ganadora)
   nunca se contaba ni se pagaba. Ahora se recorre TODO el resultado
   oficial para ese número y se registra un acierto separado por CADA
   posición en la que coincide, cada uno con su propio multiplicador y
   premio. */
function calcularAciertosJugada(jugada, numerosResultado){
  if(!numerosResultado || numerosResultado.length===0) return null;
  const montoPorNumero = jugada.montoPorNumero || 0;
  const aciertos = [];
  let monto = 0;
  (jugada.numeros || []).forEach(n=>{
    const numNorm = normalizarNumeroComparacion(n);
    numerosResultado.forEach((rn, idx)=>{
      if(normalizarNumeroComparacion(rn) !== numNorm) return;
      if(MULTIPLICADOR_PREMIO[idx] === undefined) return; // posiciones sin premio definido (más allá de 3ra)
      const premio = montoPorNumero * MULTIPLICADOR_PREMIO[idx];
      aciertos.push({ numero:n, posicion: idx+1, multiplicador: MULTIPLICADOR_PREMIO[idx], premio });
      monto += premio;
    });
  });
  return aciertos.length ? { aciertos, monto } : null;
}

/* ======================================================================
   CICLOS DE MARTINGALA → GANANCIA NETA REAL
   ------------------------------------------------------------------
   Esto NO es lo mismo que "ganado en aciertos" del ROI: ahí cada jugada
   ganadora se mide solo contra SU PROPIA inversión, dejando aparte lo
   perdido en los niveles previos de esa misma racha (que se cuenta por
   su lado en "Pérdidas"). Acá se arma cada racha COMPLETA de martingala
   —todos los sorteos perdidos consecutivos, uno detrás de otro, hasta el
   sorteo que finalmente gana y la cierra— y se calcula cuánto sobra
   DESPUÉS de cubrir TODA la inversión de esa racha (igual que hace
   calcularSugerenciaMontoLoteria() en jugadas.js para saber cuánto hay
   que recuperar, pero en sentido inverso: acá ya se sabe que se ganó, y
   lo que interesa es cuánto quedó de ganancia real una vez pagada toda
   la escalada).

   OJO — un nivel "perdido" (que no cubrió su propia inversión) puede
   igual haber pagado ALGO (por ejemplo, acertar solo en 3ra premio). Ese
   pago parcial NO se descarta: se va acumulando en `gananciaAcumuladaRacha`
   junto con la inversión de ese nivel, y cuando la racha finalmente
   cierra (un nivel cuyo premio cubre o supera su propia inversión), el
   "ganado" de la racha es la SUMA de todos esos aciertos parciales más
   lo que pagó el nivel que cerró. Ejemplo real:
     Nivel 1: 40 números x $5 = $200 invertidos. Acierta solo en 3ra
              (x4) → paga $20. Pierde $180 → sigue la racha.
     Nivel 2: 40 números x $12 = $480 invertidos. Acierta en 1ra, 2da y
              3ra → paga 12×60 + 12×14 + 12×4 = $936. Esto SÍ cubre su
              inversión → cierra la racha.
     Ganado total de la racha = $20 (nivel 1) + $936 (nivel 2) = $956.
     Invertido total de la racha = $200 + $480 = $680.
     Ganancia neta = $956 − $680 = $276.

   La racha es siempre POR JUGADOR + POR LOTERÍA (igual que la
   martingala), nunca mezclada entre jugadores ni entre loterías.

   Devuelve un array con un elemento por cada racha que se cerró con una
   victoria: { vendedor, loteria, fecha, invertidoRacha, ganado, gananciaNeta }.
   `fecha` es la del sorteo GANADOR que cerró la racha (sin importar en
   qué fecha empezaron las pérdidas previas) — es el dato que se usa para
   filtrar "ganancia neta de hoy" en el ROI.
   ====================================================================== */
async function calcularCiclosGananciaNetaMartingala(){
  // Agrupamos por vendedor + lotería a partir de las jugadas confirmadas.
  const pares = new Set();
  JUGADAS.filter(j=>j.estado==='confirmada').forEach(j=> pares.add(`${j.vendedor}__${j.loteria}`));

  const ciclos = [];

  for(const par of pares){
    const sep = par.indexOf('__');
    const vendedor = par.slice(0, sep);
    const loteria = par.slice(sep+2);

    const grupos = {};
    JUGADAS.filter(j=>j.loteria===loteria && j.vendedor===vendedor && j.estado==='confirmada').forEach(j=>{
      const key = `${j.fecha}__${j.horaSorteo||''}`;
      (grupos[key] = grupos[key] || []).push(j);
    });
    // Orden CRONOLÓGICO (del sorteo más antiguo al más reciente): la
    // racha se arma en el orden real en que se jugó.
    const claves = Object.keys(grupos).sort((a,b)=> a.localeCompare(b));

    let inversionAcumuladaRacha = 0;
    let gananciaAcumuladaRacha = 0; // premios parciales de niveles previos que NO alcanzaron a cubrir su propia inversión (ej: acertó solo en 3ra), pero SÍ cuentan para la ganancia neta final de la racha.

    for(const key of claves){
      const jugadasGrupo = grupos[key];
      const fecha = key.split('__')[0];
      const numerosResultado = await obtenerResultadoOficial(loteria, fecha);
      if(!numerosResultado || numerosResultado.length===0) continue; // sorteo aún sin resultado: se ignora, no rompe ni cierra la racha

      let invertido = 0, gananciaBruta = 0;
      jugadasGrupo.forEach(j=>{
        invertido += (j.montoTotal || 0);
        const calculo = calcularAciertosJugada(j, numerosResultado);
        if(calculo) gananciaBruta += calculo.monto;
      });

      const perdidaNeta = invertido - gananciaBruta;

      if(perdidaNeta > 0){
        // Se perdió este sorteo (no alcanzó a cubrir su propia inversión),
        // pero puede que haya acertado algo igual (ej: solo 3ra premio).
        // Esa parte SÍ hay que sumarla para la ganancia neta final —
        // solo la inversión se acumula completa para saber cuánto hay
        // que recuperar en el siguiente nivel.
        inversionAcumuladaRacha += invertido;
        gananciaAcumuladaRacha += gananciaBruta;
        continue;
      }

      // Se ganó (cubrió o superó su propia inversión): esto CIERRA la
      // racha. La ganancia neta real es TODO lo pagado en la racha
      // (incluyendo los aciertos parciales de los niveles previos que no
      // alcanzaron a cubrirse, más lo pagado en este nivel que la cerró)
      // MENOS toda la inversión acumulada de la racha completa.
      const invertidoRacha = inversionAcumuladaRacha + invertido;
      const ganadoRacha = gananciaAcumuladaRacha + gananciaBruta;
      ciclos.push({ vendedor, loteria, fecha, invertidoRacha, ganado: ganadoRacha, gananciaNeta: ganadoRacha - invertidoRacha });

      inversionAcumuladaRacha = 0; // se reinicia la racha para el siguiente ciclo
      gananciaAcumuladaRacha = 0;
    }
  }

  return ciclos;
}


