/* ========================================================================
   NAV.JS
   Navegación entre vistas (cambiarVista), control de acceso por rol, y el menú lateral tipo "drawer" en tablet/teléfono.
   ======================================================================== */

/* ======================================================================
   RESTRICCIÓN DE ACCESO: solo el admin puede ver el Numerólogo.
   Los vendedores (jugadores) solo pueden consultar Resultados oficiales.
   ====================================================================== */
function esAdmin(){
  return !!(CURRENT_USER && CURRENT_USER.rol === 'admin');
}
function configurarAccesoNumeros(){
  const btnNumerologo = document.getElementById('btnTipoNumerologo');
  const grid = document.getElementById('numPaso1Grid');
  const btnCambiar = document.getElementById('btnCambiarTipoNum');
  if(esAdmin()){
    btnNumerologo.style.display = '';
    grid.style.gridTemplateColumns = 'repeat(2,1fr)';
    if(btnCambiar) btnCambiar.style.display = '';
  } else {
    btnNumerologo.style.display = 'none';
    grid.style.gridTemplateColumns = '1fr';
    if(btnCambiar) btnCambiar.style.display = 'none';
  }
}

document.querySelectorAll('.navitem[data-view]').forEach(item=>{
  item.addEventListener('click', ()=>cambiarVista(item.dataset.view));
});
function cambiarVista(id){
  document.querySelectorAll('.navitem[data-view]').forEach(n=>n.classList.toggle('active', n.dataset.view===id));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.id===id));
  const titulos = {
    'v-resumen':'Resumen', 'v-vendedores':'Jugadores', 'v-jugadas-admin':'Jugadas',
    'v-cobros-admin':'Cobros', 'v-depositos-admin':'Depósitos', 'v-roi':'ROI', 'v-saldo':'Saldo', 'v-nomina':'Nómina', 'v-numeros':'Números',
    'v-configuracion':'Configuración', 'v-simulacion':'Simulación',
    'v-caja':'Caja del día', 'v-jugadas-vendedor':'Mis jugadas', 'v-cobros-vendedor':'Mis cobros',
    'v-depositar':'Depositar', 'v-informacion':'Información', 'v-reglas':'Reglas',
    'v-resultado-jugadas':'Resultado de jugadas', 'v-chat':'Chat',
  };
  document.getElementById('topbarTitle').textContent = titulos[id] || '';
  if(id === 'v-roi' && !esAdmin()){
    // El ROI es exclusivo del admin; un vendedor jamás debe poder verlo.
    cambiarVista('v-caja');
    return;
  }
  if(id === 'v-saldo' && !esAdmin()){
    // El Saldo es exclusivo del admin; un vendedor jamás debe poder verlo.
    cambiarVista('v-caja');
    return;
  }
  if(id === 'v-nomina' && !esAdmin()){
    // La Nómina es exclusiva del admin; un vendedor jamás debe poder verla.
    cambiarVista('v-caja');
    return;
  }
  if(id === 'v-configuracion' && !esAdmin()){
    // La Configuración de generación de números es exclusiva del admin.
    cambiarVista('v-caja');
    return;
  }
  if(id === 'v-simulacion' && !esAdmin()){
    // La Simulación es exclusiva del admin.
    cambiarVista('v-caja');
    return;
  }
  if(id === 'v-roi'){ renderROI(); }
  if(id === 'v-saldo'){ renderSaldo(); }
  if(id === 'v-nomina'){ renderNomina(); }
  if(id === 'v-configuracion'){ abrirVistaConfiguracion(); }
  if(id === 'v-simulacion'){ abrirVistaSimulacion(); }
  if(id === 'v-caja'){ cargarHistorialCaja(); }
  if(id === 'v-resultado-jugadas'){ initResultadoJugadas(); }
  if(id === 'v-chat'){ abrirVistaChat(); }
  if(id === 'v-numeros' && !esAdmin()){
    // Los vendedores van directo a "Resultados oficiales", sin pasar por el Numerólogo.
    elegirTipoNumeros('resultados');
  }
  sincronizarBottomNavYFab(id); // ver js/nav-android.js
  cerrarMenuMovil();
}

/* ======================================================================
   RESPONSIVO: menú tipo "drawer" en tablet/teléfono (<=900px)
   ====================================================================== */
function abrirMenuMovil(){
  document.querySelector('.sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
}
function cerrarMenuMovil(){
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
document.getElementById('btnMenuToggle').addEventListener('click', ()=>{
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.contains('open') ? cerrarMenuMovil() : abrirMenuMovil();
});
document.getElementById('sidebarOverlay').addEventListener('click', cerrarMenuMovil);

