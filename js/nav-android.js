/* ========================================================================
   NAV-ANDROID.JS
   Capa visual estilo Android/Material: barra de navegación inferior, botón flotante (FAB) contextual, y efecto ripple. No contiene lógica de negocio.
   ======================================================================== */

/* ======================================================================
   ESTILO ANDROID: BOTTOM NAVIGATION + FAB + RIPPLE
   ------------------------------------------------------------------
   Este módulo NO cambia ninguna lógica de negocio: solo añade la capa
   visual/interacción típica de una app Android nativa sobre lo que ya
   existe (cambiarVista, los mismos botones "Nuevo..." de cada vista,
   etc.). Se carga al final, después de que todos los demás módulos ya
   definieron sus funciones y botones.
   ====================================================================== */

/* ---------------------------------------------------------------------
   BOTTOM NAV: reutiliza cambiarVista(), no duplica ninguna lógica de vistas.
   --------------------------------------------------------------------- */
document.querySelectorAll('.bottom-nav-item[data-view]').forEach(item=>{
  item.addEventListener('click', ()=> cambiarVista(item.dataset.view));
});
document.getElementById('btnBottomNavMasAdmin').addEventListener('click', abrirMenuMovil);
document.getElementById('btnBottomNavMasVendedor').addEventListener('click', abrirMenuMovil);

/* ---------------------------------------------------------------------
   FAB: acción principal de la vista actual (botón "+"). Reutiliza el
   mismo botón que ya abre el modal correspondiente en cada vista — el
   FAB solo simula un click sobre él, así que basta con mantener este
   mapa si mañana agregas una vista nueva con su propio botón "Nuevo...".
   --------------------------------------------------------------------- */
const FAB_TARGETS = {
  'v-jugadas-admin': 'btnNuevaJugada',
  'v-vendedores':    'btnNuevoVendedor',
  'v-cobros-admin':  'btnNuevoCobro',
};

function sincronizarBottomNavYFab(viewId){
  document.querySelectorAll('.bottom-nav-item[data-view]').forEach(item=>{
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  const fab = document.getElementById('fabAccion');
  const targetId = FAB_TARGETS[viewId];
  const targetBtn = targetId ? document.getElementById(targetId) : null;
  if(targetBtn){
    fab.classList.add('show');
    fab.onclick = ()=> targetBtn.click();
  } else {
    fab.classList.remove('show');
    fab.onclick = null;
  }
}

/* ---------------------------------------------------------------------
   RIPPLE: el "toque" característico de Material Design. Delegado a nivel
   de documento (con capture en pointerdown) para que funcione también en
   botones creados dinámicamente por los render*() de cada módulo (tarjetas
   de jugadas, cobros, depósitos, etc.), sin tener que engancharlo uno por
   uno cada vez que se regenera una lista.
   --------------------------------------------------------------------- */
function crearRipple(el, x, y){
  el.classList.add('ripple-host');
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.4;
  const span = document.createElement('span');
  span.className = 'ripple-circle';
  span.style.width = span.style.height = size + 'px';
  span.style.left = (x - rect.left - size/2) + 'px';
  span.style.top  = (y - rect.top  - size/2) + 'px';
  el.appendChild(span);
  span.addEventListener('animationend', ()=> span.remove());
}

document.addEventListener('pointerdown', (e)=>{
  const el = e.target.closest('.btn, .navitem, .bottom-nav-item, .fab, .cuenta-opcion, .filter-tab, .cobro-select-card');
  if(!el || el.disabled) return;
  crearRipple(el, e.clientX, e.clientY);
});
