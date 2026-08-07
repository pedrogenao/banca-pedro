/* ========================================================================
   RESULTADOS.JS
   Vista "Resultado de jugadas": el ticket con los números oficiales y cuáles acertó el jugador, para admin y jugador.
   ======================================================================== */

/* ======================================================================
   RESULTADO DE JUGADAS (admin y jugador)
   Compara los números jugados de cada ticket contra el resultado oficial
   de la lotería correspondiente. Solo se puede elegir una lotería cuyo
   sorteo ya haya pasado para la fecha seleccionada. Cada número jugado se
   resalta en verde (1ra), otro color (2da), otro color (3ra) o rojo (sin
   coincidencia).
   ====================================================================== */
const ETIQUETA_POSICION = { 1:'1ra', 2:'2da', 3:'3ra' };

function loteriaSorteoYaPaso(loteria, fecha){
  const hora = HORARIOS_LOTERIA[loteria];
  if(!hora) return false;
  const hoy = hoyStr();
  if(fecha < hoy) return true;   // fecha pasada: el sorteo ya se realizó
  if(fecha > hoy) return false;  // fecha futura: el sorteo no ha ocurrido
  // fecha === hoy: comparamos la hora del sorteo con la hora actual
  const [h,m] = hora.split(':').map(Number);
  const ahora = new Date();
  const horaSorteoDate = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), h||0, m||0, 0);
  return ahora >= horaSorteoDate;
}

function loteriasConSorteoPasado(fecha){
  return listaLoteriasOrdenadas().filter(l => loteriaSorteoYaPaso(l, fecha));
}

/* Detalle número a número: para cada número jugado indica en QUÉ
   posiciones acertó (puede ser más de una si el mismo número salió
   repetido en el resultado oficial, ej: "07" en 1ra y también en 3ra).
   `posiciones` trae todas las coincidencias (ordenadas de mejor a peor
   premio); `posicion` se deja como antes (la mejor/primera) para no
   romper el código que solo necesita un valor único. */
function calcularDetalleNumeros(jugada, numerosResultado){
  return (jugada.numeros || []).map(n=>{
    const numNorm = normalizarNumeroComparacion(n);
    const posiciones = [];
    numerosResultado.forEach((rn, idx)=>{
      if(idx >= 3) return; // solo 1ra/2da/3ra pagan premio y se resaltan como acierto
      if(normalizarNumeroComparacion(rn) === numNorm) posiciones.push(idx+1);
    });
    return { numero:n, posiciones, posicion: posiciones.length ? posiciones[0] : null };
  });
}

function mejorPosicion(detalle){
  return detalle.reduce((mejor,d)=>{
    if(d.posicion===null) return mejor;
    return (mejor===null || d.posicion<mejor) ? d.posicion : mejor;
  }, null);
}

const rjFechaInput = document.getElementById('rjFecha');
const rjLoteriaSelect = document.getElementById('rjLoteria');

function initResultadoJugadas(){
  if(!rjFechaInput) return;
  if(!rjFechaInput.value) rjFechaInput.value = hoyStr();
  poblarSelectRjLoterias();
  renderResultadoJugadas();
}

function poblarSelectRjLoterias(){
  if(!rjLoteriaSelect) return;
  const fecha = rjFechaInput.value || hoyStr();
  const valorPrevio = rjLoteriaSelect.value;
  const disponibles = loteriasConSorteoPasado(fecha);
  const sinLoteriasBox = document.getElementById('rjSinLoterias');

  rjLoteriaSelect.innerHTML = '<option value="">Selecciona una lotería</option>' +
    disponibles.map(l => `<option value="${l}">${l}${HORARIOS_LOTERIA[l] ? ' · '+HORARIOS_LOTERIA[l] : ''}</option>`).join('');

  if(disponibles.includes(valorPrevio)) rjLoteriaSelect.value = valorPrevio;

  if(sinLoteriasBox) sinLoteriasBox.style.display = disponibles.length===0 ? 'block' : 'none';
}

if(rjFechaInput){
  rjFechaInput.addEventListener('change', ()=>{
    poblarSelectRjLoterias();
    renderResultadoJugadas();
  });
}
if(rjLoteriaSelect){
  rjLoteriaSelect.addEventListener('change', renderResultadoJugadas);
}
const btnRjHoyEl = document.getElementById('btnRjHoy');
if(btnRjHoyEl){
  btnRjHoyEl.addEventListener('click', ()=>{
    rjFechaInput.value = hoyStr();
    poblarSelectRjLoterias();
    renderResultadoJugadas();
  });
}

function generarChipOficialHTML(numero, idx){
  const pos = idx < 3 ? ETIQUETA_POSICION[idx+1] : `${idx+1}ta`;
  return `
    <div class="rj-oficial-numero">
      <div class="num">${numero}</div>
      <div class="pos">${pos}</div>
    </div>`;
}

function generarChipJugadoHTML(detalle){
  const posiciones = (detalle.posiciones && detalle.posiciones.length) ? detalle.posiciones : (detalle.posicion ? [detalle.posicion] : []);
  const clase = posiciones.length ? `acierto-${posiciones[0]}` : 'sin-acierto';
  // Si el número acertó en más de una posición (ej: salió repetido en el
  // resultado oficial), se muestran TODAS unidas con "y" — ej "1ra y 3ra" —
  // en vez de quedarse solo con la primera que se encontró.
  const etiqueta = posiciones.length ? posiciones.map(p=>ETIQUETA_POSICION[p]).join(' y ') : 'Sin acierto';
  return `
    <div class="rj-chip ${clase}">
      <div class="num">${detalle.numero}</div>
      <div class="tagpos">${etiqueta}</div>
    </div>`;
}

function generarTicketResultadoHTML(jugada, numerosResultado, mostrarJugador){
  const detalle = calcularDetalleNumeros(jugada, numerosResultado);
  const mejor = mejorPosicion(detalle);
  const calculo = calcularAciertosJugada(jugada, numerosResultado);
  const vend = mostrarJugador ? VENDEDORES.find(v=>v.usuario===jugada.vendedor) : null;
  const badgeClase = mejor ? `g${mejor}` : 'g0';
  const badgeTexto = mejor ? ` Acertó en ${ETIQUETA_POSICION[mejor]}` : ' Sin acierto';

  return `
    <div class="rj-ticket-card">
      <div class="rj-ticket-head">
        <div>
          <div class="rj-ticket-title mono">${jugada.ticketId || '—'}${mostrarJugador ? ` · ${vend ? vend.nombre : jugada.vendedor}` : ''}</div>
          <div class="rj-ticket-sub">${jugada.tipoJugada||'—'} · Monto: ${fmtMoney(jugada.montoTotal||0)} · Sorteo: ${jugada.horaSorteo||'—'}</div>
        </div>
        <span class="rj-resultado-global ${badgeClase}">${badgeTexto}</span>
      </div>
      <div class="rj-ticket-body">
        <div class="small-muted" style="font-weight:700; text-transform:uppercase; font-size:11px; letter-spacing:.04em;">Números jugados</div>
        <div class="rj-numeros-jugados">
          ${detalle.map(generarChipJugadoHTML).join('')}
        </div>
        ${calculo ? `<div class="rj-premio-line"><span>Premio calculado</span><span>${fmtMoney(calculo.monto)}</span></div>` : ''}
      </div>
    </div>`;
}

async function renderResultadoJugadas(){
  const wrap = document.getElementById('rjListaTickets');
  const resumenBox = document.getElementById('rjResumenLoteria');
  const oficialBox = document.getElementById('rjResultadoOficialBox');
  if(!wrap || !rjFechaInput || !rjLoteriaSelect) return;

  const fecha = rjFechaInput.value || hoyStr();
  const loteria = rjLoteriaSelect.value;

  if(!loteria){
    resumenBox.style.display = 'none';
    oficialBox.style.display = 'none';
    wrap.innerHTML = `<div class="empty-state"><div class="ic"></div>Selecciona una lotería con sorteo ya realizado para ver los resultados.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="empty-state"><div class="ic">⏳</div>Consultando resultado oficial...</div>`;
  resumenBox.style.display = 'none';
  oficialBox.style.display = 'none';

  const numerosResultado = await obtenerResultadoOficial(loteria, fecha);
  if(!numerosResultado || numerosResultado.length===0){
    wrap.innerHTML = `<div class="empty-state"><div class="ic"></div>Aún no hay resultado oficial publicado para <b>${loteria}</b> el ${fecha}.</div>`;
    return;
  }

  oficialBox.style.display = 'block';
  oficialBox.innerHTML = `
    <div class="rj-oficial-card">
      <div class="lbl"> Resultado oficial · ${loteria} · ${fecha}</div>
      <div class="rj-oficial-numeros">
        ${numerosResultado.map(generarChipOficialHTML).join('')}
      </div>
    </div>`;

  const mostrarJugador = esAdmin();
  let tickets = JUGADAS.filter(j => j.loteria===loteria && j.fecha===fecha && j.estado!=='rechazada');
  if(!mostrarJugador) tickets = tickets.filter(j => j.vendedor === CURRENT_USER.usuario);
  tickets.sort((a,b)=> (b.fechaEnvio?.seconds||0) - (a.fechaEnvio?.seconds||0));

  if(tickets.length===0){
    resumenBox.style.display = 'none';
    wrap.innerHTML = `<div class="empty-state"><div class="ic"></div>No hay jugadas registradas para esta lotería en esta fecha.</div>`;
    return;
  }

  let ganadores = 0;
  const filas = tickets.map(j=>{
    const detalle = calcularDetalleNumeros(j, numerosResultado);
    if(mejorPosicion(detalle)) ganadores++;
    return generarTicketResultadoHTML(j, numerosResultado, mostrarJugador);
  });

  resumenBox.style.display = 'grid';
  document.getElementById('rjTotalTickets').textContent = tickets.length;
  document.getElementById('rjTotalGanadores').textContent = ganadores;
  document.getElementById('rjTotalPerdedores').textContent = tickets.length - ganadores;

  wrap.innerHTML = filas.join('');
}

