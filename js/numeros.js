/* ========================================================================
   NUMEROS.JS
   Visor compartido: "Numerólogo" (admin) y "Resultados oficiales" (ambos
   roles).

   IMPORTANTE: main.py YA NO genera ni guarda ningún número — solo
   escalpea los resultados oficiales tal cual y los guarda en
   `loterias/{loteria}/resultados/{fecha}`. El Numerólogo genera los
   números aquí mismo, en el navegador, con el motor compartido de
   js/generador-numeros.js, usando SIEMPRE los parámetros configurados en
   "Configuración → Numerólogo (por tipo de jugada)" — los mismos que usa
   "Cargar tipos" dentro de Enviar jugada (ver js/jugadas.js), para que el
   resultado sea idéntico se genere desde donde se genere.

   "Resultados oficiales" sigue funcionando exactamente igual que antes:
   solo lee y muestra lo que main.py guardó (tal cual), por lotería+fecha.
   ====================================================================== */

let numTipoActual = null; // 'numerologo' | 'resultados'

/* ======================================================================
   PASO 1 / PASO 2 — navegación entre subvistas
   ====================================================================== */
document.getElementById('btnTipoNumerologo').addEventListener('click', ()=>elegirTipoNumeros('numerologo'));
document.getElementById('btnTipoResultados').addEventListener('click', ()=>elegirTipoNumeros('resultados'));
document.getElementById('btnCambiarTipoNum').addEventListener('click', ()=>{
  numTipoActual = null;
  document.getElementById('numPaso1').style.display = 'block';
  document.getElementById('numPaso2').style.display = 'none';
});

function elegirTipoNumeros(tipo){
  // Seguridad adicional: un vendedor (jugador) nunca puede usar el Numerólogo,
  // solo consultar los resultados oficiales, sin importar cómo se haya
  // disparado esta función.
  if(tipo === 'numerologo' && !esAdmin()){ tipo = 'resultados'; }
  numTipoActual = tipo;
  document.getElementById('numPaso1').style.display = 'none';
  document.getElementById('numPaso2').style.display = 'block';
  document.getElementById('numPaso2Titulo').textContent = tipo === 'numerologo' ? ' Numerólogo' : ' Resultados oficiales';

  const esNumerologo = tipo === 'numerologo';
  document.getElementById('numResultadosSub').style.display = esNumerologo ? 'none' : 'block';
  document.getElementById('numGeneradorSub').style.display = esNumerologo ? 'block' : 'none';

  document.getElementById('numerosResultadoWrap').style.display = 'none';
  document.getElementById('numerosVacio').style.display = 'block';
  document.getElementById('numerosVacio').textContent = 'Elige una lotería y una fecha, luego toca "Buscar".';

  if(esNumerologo){
    numInicializarGenerador();
  }
}

/* ======================================================================
   SUBVISTA: RESULTADOS OFICIALES (sin cambios de fondo — solo lee y
   muestra tal cual lo que main.py guardó en Firestore)
   ====================================================================== */
document.getElementById('btnBuscarNumeros').addEventListener('click', buscarNumeros);
async function buscarNumeros(){
  const loteria = document.getElementById('numLoteria').value;
  const fecha = document.getElementById('numFecha').value;
  if(!loteria || !fecha){ toast('Elige una lotería y una fecha.', 'danger'); return; }

  const wrap = document.getElementById('numerosResultadoWrap');
  const vacio = document.getElementById('numerosVacio');
  const cont = document.getElementById('numerosContenedor');
  wrap.style.display = 'none';
  vacio.style.display = 'block';
  vacio.textContent = 'Buscando...';

  const rutaResultado = `loterias/${loteria}/resultados/${fecha}`;

  try{
    const doc = await db.collection('loterias').doc(loteria).collection('resultados').doc(fecha).get();
    if(!doc.exists){
      vacio.textContent = `Aún no hay resultado oficial publicado para ${loteria} el ${fecha}.`;
      vacio.innerHTML += `<div class="small-muted mono" style="margin-top:8px;">Ruta consultada: ${rutaResultado}</div>`;
      wrap.style.display = 'none';
      return;
    }
    const numeros = doc.data().numeros || [];
    cont.innerHTML = numeros.length
      ? renderNumerosJugados(numeros, { ocultarHeader:true })
      : '<span class="small-muted">El documento existe pero no tiene un campo "numeros" con datos.</span>';
    vacio.style.display = 'none';
    wrap.style.display = 'block';
  }catch(err){
    console.error('[Números] Error consultando Firestore:', err);
    vacio.textContent = 'Error al buscar: ' + err.message;
    vacio.innerHTML += `<div class="small-muted mono" style="margin-top:8px;">Ruta consultada: ${rutaResultado}</div>`;
    wrap.style.display = 'none';
    vacio.style.display = 'block';
  }
}

/* ========================================================================
   SUBVISTA: NUMERÓLOGO — GENERADOR DE NÚMEROS EN LA APP
   (motor + configuración: js/generador-numeros.js)
   ======================================================================== */

let NUM_TIPO_SELECCIONADO = null; // tipo de jugada elegido (chip)

function numInicializarGenerador(){
  document.getElementById('numLoteria').removeEventListener('change', numAlCambiarLoteria);
  document.getElementById('numLoteria').addEventListener('change', numAlCambiarLoteria);

  genEscucharConfig(()=>{ numActualizarSegunLoteria(); }); // se re-pinta solo si cambia la config
  numActualizarSegunLoteria();

  document.getElementById('numerologoResultadoWrap').style.display = 'none';
  document.getElementById('numerologoVacio').style.display = 'block';
}

function numAlCambiarLoteria(){ numActualizarSegunLoteria(); }

/* Ajusta el formulario según la lotería elegida:
   - Loterías de UN SOLO tipo (KINO/LOTOMAS/LOTO_REAL/LOTO_POOL): no
     muestran chips de "tipo de jugada" (el algoritmo de tendencia
     alto/bajo solo aplica a las quinielas generales).
   - Loterías de VARIOS tipos (quinielas): muestran los 4 tipos de jugada. */
function numActualizarSegunLoteria(){
  const loteria = document.getElementById('numLoteria').value;
  const info = CATALOGO_LOTERIAS[loteria];
  const esUnica = !!info?.esUnica;

  document.getElementById('numTipoJugadaWrap').style.display = esUnica ? 'none' : 'block';
  document.getElementById('numLoteriaUnicaInfo').style.display = esUnica ? 'block' : 'none';

  if(esUnica){
    NUM_TIPO_SELECCIONADO = loteria; // el "tipo" es la propia lotería (KINO, LOTOMAS...)
    numAjustarInputCantidad(loteria);
  } else {
    const tipos = (info?.tipos && info.tipos.length) ? info.tipos : ['GANAR 85% SEGURO','TRIPLETAS','PALE','QUINIELA'];
    if(!NUM_TIPO_SELECCIONADO || !tipos.includes(NUM_TIPO_SELECCIONADO)) NUM_TIPO_SELECCIONADO = tipos.includes('QUINIELA') ? 'QUINIELA' : tipos[0];
    numPintarChipsTipoJugada(tipos);
    numAjustarInputCantidad(NUM_TIPO_SELECCIONADO);
  }

  numPintarResumenConfig();
}

function numPintarChipsTipoJugada(tipos){
  const cont = document.getElementById('numTipoJugadaChips');
  cont.innerHTML = tipos.map(t=>`<div class="filter-tab${t===NUM_TIPO_SELECCIONADO?' active':''}" data-tipo="${t}">${t}</div>`).join('');
  cont.querySelectorAll('.filter-tab').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      cont.querySelectorAll('.filter-tab').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      NUM_TIPO_SELECCIONADO = chip.dataset.tipo;
      numAjustarInputCantidad(NUM_TIPO_SELECCIONADO);
    });
  });
}

/* La cantidad de números por tipo SIEMPRE sale de la configuración
   central (Configuración → Numerólogo): fija para Quiniela/Palé/Tripleta
   y las loterías de un solo tipo, y editable solo desde Configuración
   para "Ganar 85% seguro" (30 a 50). Aquí solo se muestra de solo
   lectura, para que "Números" y "Cargar tipos" generen siempre igual. */
function numAjustarInputCantidad(tipo){
  const input = document.getElementById('numCantidad');
  const hint = document.getElementById('numCantidadHint');
  const label = document.getElementById('numCantidadLabel');
  label.textContent = `Cantidad de números — ${tipo}`;
  input.readOnly = true;

  if(tipo === 'GANAR 85% SEGURO'){
    const cant = GEN_CONFIG.numerologo.cantidadGanar85 || 30;
    input.value = cant;
    hint.textContent = `Definido en Configuración: ${cant} números (rango 30 a 50).`;
  } else {
    const def = NUM_CANTIDAD_DEFAULT[tipo] ?? 1;
    input.value = def;
    hint.textContent = `"${tipo}" siempre genera ${def} número${def===1?'':'s'}.`;
  }
}

function numPintarResumenConfig(){
  const el = document.getElementById('numConfigInfo');
  if(!el) return;
  const info = CATALOGO_LOTERIAS[document.getElementById('numLoteria').value];
  const esUnica = !!info?.esUnica;
  const cfg = GEN_CONFIG.numerologo;
  const estrategiasLabel = (cfg.estrategias || []).map(id=>(GEN_ESTRATEGIAS.find(e=>e.id===id)||{}).label || id).join(' + ') || '—';
  if(esUnica){
    el.innerHTML = `<b>Estrategia(s) activa(s):</b> ${estrategiasLabel}`;
  } else {
    const partes = [`<b>Estrategia(s) activa(s):</b> ${estrategiasLabel}`];
    partes.push(cfg.tendencia ? `Tendencia alto/bajo ON (${cfg.sorteosTendencia} sorteos)` : 'Tendencia alto/bajo OFF');
    partes.push(cfg.exclusion ? `Excluye últimos ${cfg.exclusionCantidad} sorteos (pos. ${(cfg.exclusionPosiciones||[]).map(p=>p+1).join(', ')})` : 'Sin exclusión de recientes');
    el.innerHTML = partes.join(' · ');
  }
}

/* ------------------------------------------------------------------
   BOTÓN "Generar números"
   ------------------------------------------------------------------ */
document.getElementById('btnNumerologoGenerar').addEventListener('click', numerologoGenerar);

async function numerologoGenerar(){
  if(!esAdmin()){ toast('Solo el administrador puede usar el Numerólogo.', 'danger'); return; }

  const loteria = document.getElementById('numLoteria').value;
  if(!loteria){ toast('Elige una lotería.', 'danger'); return; }

  const info = CATALOGO_LOTERIAS[loteria];
  const esUnica = !!info?.esUnica;
  const tipo = esUnica ? loteria : NUM_TIPO_SELECCIONADO;
  if(!tipo){ toast('Elige un tipo de jugada.', 'danger'); return; }

  const btn = document.getElementById('btnNumerologoGenerar');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generando...';

  try{
    const resultado = await genNumerosParaTipo(loteria, tipo);
    if(resultado.sinHistorial){
      toast(`Todavía no hay resultados oficiales guardados para ${loteria}. El Numerólogo necesita historial para generar números.`, 'danger');
      return;
    }
    numMostrarResultado({ loteria, tipo, numeros: resultado.numeros, ladoUsado: resultado.lado });
  }catch(err){
    console.error('[Numerólogo] Error generando números:', err);
    toast('No se pudieron generar los números: ' + err.message, 'danger');
  }finally{
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

/* ------------------------------------------------------------------
   Muestra el resultado en un cuadrito bonito y profesional, con botón
   de copiar.
   ------------------------------------------------------------------ */
function numMostrarResultado({ loteria, tipo, numeros, ladoUsado }){
  const wrap = document.getElementById('numerologoResultadoWrap');
  const vacio = document.getElementById('numerologoVacio');
  const card = document.getElementById('numerologoResultadoCard');

  const cfg = GEN_CONFIG.numerologo;
  const estrategiasLabel = (cfg.estrategias || []).map(id=>(GEN_ESTRATEGIAS.find(e=>e.id===id)||{}).label || id).join(' + ');

  const metaChips = [
    `<span class="numerologo-meta-chip">${estrategiasLabel}</span>`,
    ladoUsado ? `<span class="numerologo-meta-chip">Tendencia: lado ${ladoUsado.toUpperCase()}</span>` : '',
    cfg.exclusion ? `<span class="numerologo-meta-chip">Excluye sorteos recientes</span>` : '',
  ].filter(Boolean).join('');

  const numerosTexto = numeros.join(', ');

  card.innerHTML = `
    <div class="numerologo-card-head">
      <div>
        <div class="numerologo-card-loteria">${loteria}</div>
        <div class="numerologo-card-tipo">${tipo}</div>
      </div>
      <div class="numerologo-card-count">${numeros.length} ${numeros.length===1?'número':'números'}</div>
    </div>
    <div class="numerologo-card-numeros">
      ${numeros.map(n=>`<span class="numchip">${String(n).padStart(2,'0')}</span>`).join('')}
    </div>
    <div class="numerologo-card-meta">${metaChips}</div>
    <button class="btn btn-primary btn-sm numerologo-copiar" id="btnCopiarNumerologo" type="button">📋 Copiar números</button>
  `;

  document.getElementById('btnCopiarNumerologo').addEventListener('click', ()=>numCopiarTexto(numerosTexto));

  vacio.style.display = 'none';
  wrap.style.display = 'block';
}

async function numCopiarTexto(texto){
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(texto);
    } else {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast('Números copiados al portapapeles.', 'success');
  }catch(err){
    console.error('[Numerólogo] Error copiando:', err);
    toast('No se pudo copiar. Cópialos manualmente.', 'danger');
  }
}
