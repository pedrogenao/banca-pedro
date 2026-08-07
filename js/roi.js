/* ========================================================================
   ROI.JS
   Admin: ROI (retorno neto del período), usando el motor de aciertos de resultados-engine.js.
   ======================================================================== */

/* ======================================================================
   ADMIN: ROI — retorno neto del período
   ROI = (suma de lo ganado en jugadas con acierto)
       - (invertido en esas mismas jugadas ganadoras)
       - (invertido en jugadas que no tuvieron ningún acierto, es decir
          las pérdidas)
   Solo cuenta jugadas confirmadas cuyo sorteo YA tiene resultado oficial
   publicado; las que siguen en espera no entran todavía en la cuenta.
   Acceso exclusivo para admin.
   ====================================================================== */

const roiDesdeInput = document.getElementById('roiFechaDesde');
const roiHastaInput = document.getElementById('roiFechaHasta');
if(roiDesdeInput && roiHastaInput){
  roiDesdeInput.value = hoyStrLocal();
  roiHastaInput.value = hoyStrLocal();
  roiDesdeInput.addEventListener('change', renderROI);
  roiHastaInput.addEventListener('change', renderROI);
  document.getElementById('btnRoiHoy').addEventListener('click', ()=>{
    roiDesdeInput.value = hoyStrLocal();
    roiHastaInput.value = hoyStrLocal();
    renderROI();
  });
}

/* Convierte una fecha 'YYYY-MM-DD' a formato corto 'DD/MM/YYYY' para
   mostrarla en el cuadrito de "Período". */
function fmtFechaCorta(fechaStr){
  if(!fechaStr) return '—';
  const [y,m,d] = fechaStr.split('-');
  return `${d}/${m}/${y}`;
}

async function renderROI(){
  if(!esAdmin()) return; // función exclusiva del admin
  const tbody = document.getElementById('roiTablaDetalle');
  if(!tbody) return; // vista aún no está en el DOM (no debería pasar, pero por seguridad)

  const desde = roiDesdeInput.value || hoyStrLocal();
  const hasta = roiHastaInput.value || desde;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Calculando ROI...</td></tr>';

  const confirmadas = JUGADAS.filter(j=> j.estado==='confirmada' && j.fecha && j.fecha>=desde && j.fecha<=hasta);

  let ganado = 0, invertidoGanadoras = 0, perdidas = 0;
  const filas = [];

  for(const j of confirmadas){
    const numerosResultado = await obtenerResultadoOficial(j.loteria, j.fecha);
    if(!numerosResultado) continue; // sorteo aún en espera, no cuenta para el ROI todavía
    const calculo = calcularAciertosJugada(j, numerosResultado);
    if(calculo){
      ganado += calculo.monto;
      invertidoGanadoras += (j.montoTotal || 0);
      filas.push({ jugada:j, invertido:j.montoTotal||0, ganado:calculo.monto, resultado:'ganadora' });
    } else {
      perdidas += (j.montoTotal || 0);
      filas.push({ jugada:j, invertido:j.montoTotal||0, ganado:0, resultado:'perdida' });
    }
  }

  const roi = ganado - invertidoGanadoras - perdidas;

  document.getElementById('roiGanado').textContent = fmtMoney(ganado);
  document.getElementById('roiInvertidoGanadoras').textContent = fmtMoney(invertidoGanadoras);
  document.getElementById('roiPerdidas').textContent = fmtMoney(perdidas);

  // Cuadrito "Período": muestra el rango elegido en formato DD/MM/YYYY
  // (o una sola fecha si Desde y Hasta son el mismo día).
  const elPeriodo = document.getElementById('roiPeriodoVal');
  if(elPeriodo) elPeriodo.textContent = (desde === hasta) ? fmtFechaCorta(desde) : `${fmtFechaCorta(desde)} – ${fmtFechaCorta(hasta)}`;

  // ✅ GANANCIA NETA DEL PERÍODO: usa el MISMO rango Desde/Hasta que el
  // resto del ROI. Es la suma de todas las rachas de martingala que se
  // CERRARON GANANDO dentro de ese rango, descontando toda la inversión
  // acumulada de cada racha (no solo la de la jugada ganadora). Se
  // muestra como un cuadrito más, igual que "Ganado en aciertos".
  const elGananciaNeta = document.getElementById('roiGananciaNetaValor');
  if(elGananciaNeta){
    const ciclos = await calcularCiclosGananciaNetaMartingala();
    const ciclosPeriodo = ciclos.filter(c=> c.fecha >= desde && c.fecha <= hasta);
    const gananciaNetaPeriodo = ciclosPeriodo.reduce((sum,c)=> sum + c.gananciaNeta, 0);

    elGananciaNeta.textContent = fmtMoneySigned(gananciaNetaPeriodo);
    elGananciaNeta.classList.remove('success','danger');
    if(gananciaNetaPeriodo > 0) elGananciaNeta.classList.add('success');
    else if(gananciaNetaPeriodo < 0) elGananciaNeta.classList.add('danger');

    const elCantidad = document.getElementById('roiGananciaNetaCantidad');
    if(elCantidad) elCantidad.textContent = `${ciclosPeriodo.length} racha${ciclosPeriodo.length===1?'':'s'}`;
  }

  const valorEl = document.getElementById('roiValorFinal');
  const cardEl = document.getElementById('roiCardFinal');
  const resumenEl = document.getElementById('roiResumenTexto');
  valorEl.textContent = fmtMoneySigned(roi);
  valorEl.classList.remove('positivo','negativo');
  cardEl.classList.remove('roi-positivo','roi-negativo','roi-neutro');
  if(roi > 0){
    valorEl.classList.add('positivo');
    cardEl.classList.add('roi-positivo');
    resumenEl.textContent = ` Período con ganancia neta positiva.`;
  } else if(roi < 0){
    valorEl.classList.add('negativo');
    cardEl.classList.add('roi-negativo');
    resumenEl.textContent = ` Período en pérdida neta.`;
  } else {
    cardEl.classList.add('roi-neutro');
    resumenEl.textContent = 'Sin ganancia ni pérdida neta en este período.';
  }

  document.getElementById('roiCantidadJugadas').textContent = `${filas.length} jugada${filas.length===1?'':'s'} resuelta${filas.length===1?'':'s'}`;

  if(filas.length===0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No hay jugadas confirmadas con resultado oficial en este rango de fechas.</td></tr>';
    return;
  }

  // Más recientes primero
  filas.sort((a,b)=> (b.jugada.fecha||'').localeCompare(a.jugada.fecha||''));

  tbody.innerHTML = filas.map(f=>{
    const j = f.jugada;
    const vend = VENDEDORES.find(v=>v.usuario===j.vendedor);
    const nombreVend = vend ? vend.nombre : j.vendedor;
    const etiqueta = f.resultado==='ganadora' ? ' Ganadora' : ' Sin acierto';
    return `
      <tr>
        <td class="mono">${j.ticketId}</td>
        <td>${nombreVend}</td>
        <td>${j.loteria}</td>
        <td>${j.tipoJugada||'—'}</td>
        <td>${j.fecha}${j.horaSorteo?' · '+j.horaSorteo:''}</td>
        <td>${fmtMoney(f.invertido)}</td>
        <td>${f.ganado ? fmtMoney(f.ganado) : '—'}</td>
        <td><span class="roi-resultado-tag ${f.resultado}">${etiqueta}</span></td>
      </tr>`;
  }).join('');
}

