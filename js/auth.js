/* ========================================================================
   AUTH.JS
   Autenticación anónima de Firebase, login/registro contra la colección sistema_usuarios, suscripción al usuario actual y arranque de la app según su rol (admin/vendedor).
   ======================================================================== */

/* ======================================================================
   AUTENTICACIÓN ANÓNIMA DE FIREBASE (silenciosa)
   -----------------------------------------------------------------------
   Esto NO es el sistema de login real (ese vive en Firestore, colección
   sistema_usuarios). Es solo para que request.auth != null se cumpla y
   así puedas leer 'generados' y 'loterias/resultados' con las MISMAS
   reglas que ya tienes, y para que las nuevas colecciones de esta app
   también puedan protegerse con esa misma condición mínima.
   ====================================================================== */
let authReady = new Promise((resolve, reject)=>{
  auth.onAuthStateChanged(user=>{
    if(user){ resolve(user); }
    else { auth.signInAnonymously().catch(err=>{
      console.error('Error de autenticación anónima:', err);
      mostrarBannerFatal(
        'No se pudo conectar con Firebase (' + err.code + '). ' +
        (err.code === 'auth/operation-not-allowed'
          ? 'Falta habilitar el proveedor "Anonymous" en Firebase Console → Authentication → Sign-in method.'
          : err.message)
      );
      reject(err);
    }); }
  });
});

/* Banner de error fatal, visible en pantalla (no solo en consola) */
function mostrarBannerFatal(msg){
  let el = document.getElementById('bannerFatal');
  if(!el){
    el = document.createElement('div');
    el.id = 'bannerFatal';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#d1394a;color:#fff;padding:14px 20px;font-size:14px;z-index:999;text-align:center;font-weight:600;';
    document.body.prepend(el);
  }
  el.textContent = ' ' + msg;
}

/* Captura cualquier error de Firestore/Firebase que se nos escape como
   promesa no manejada, para mostrarlo en pantalla en vez de solo en la
   consola — así es mucho más fácil saber exactamente qué fue lo que
   falló (reglas, permisos, red, etc.) sin tener que abrir DevTools. */
window.addEventListener('unhandledrejection', (event)=>{
  const err = event.reason;
  console.error('Promesa no manejada:', err);
  const msg = (err && err.message) ? err.message : String(err);
  if(msg.includes('Missing or insufficient permissions')){
    toast('Permiso denegado por Firestore: revisa que publicaste las reglas nuevas y que "Anonymous" esté habilitado en Authentication.', 'danger');
  } else {
    toast('Error inesperado: ' + msg, 'danger');
  }
});

/* ======================================================================
   LOGIN / REGISTRO (custom, colección sistema_usuarios)
   ====================================================================== */
const loginToggleLink = document.getElementById('loginToggleLink');
let modoRegistro = false;

loginToggleLink.addEventListener('click', async ()=>{
  if(!modoRegistro){
    // Verificar que aún no exista ningún admin antes de permitir el registro
    const snap = await db.collection(COL_USUARIOS).where('rol','==','admin').limit(1).get();
    if(!snap.empty){
      toast('Ya existe un administrador registrado. Pide tus credenciales al admin.', 'danger');
      return;
    }
  }
  modoRegistro = !modoRegistro;
  document.getElementById('formLogin').style.display = modoRegistro ? 'none' : 'block';
  document.getElementById('formRegistroAdmin').style.display = modoRegistro ? 'block' : 'none';
  document.getElementById('loginToggleTxt').textContent = modoRegistro ? '¿Ya tienes cuenta?' : '¿Eres el primer administrador?';
  loginToggleLink.textContent = modoRegistro ? 'Iniciar sesión' : 'Crear cuenta admin';
  document.getElementById('loginTitulo').textContent = modoRegistro ? 'Crear administrador' : 'Panel de Jugadas';
  document.getElementById('loginSub').textContent = modoRegistro ? 'Esta cuenta tendrá acceso total al panel' : 'Ingresa tu usuario y clave para continuar';
});

function mostrarErrorLogin(msg){
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.style.display = 'block';
}
function ocultarErrorLogin(){
  document.getElementById('loginError').style.display = 'none';
}

document.getElementById('formRegistroAdmin').addEventListener('submit', async (e)=>{
  e.preventDefault();
  ocultarErrorLogin();
  await authReady;
  const nombre = document.getElementById('regNombre').value.trim();
  const usuario = document.getElementById('regUsuario').value.trim().toLowerCase();
  const clave = document.getElementById('regClave').value;
  if(!nombre || !usuario || clave.length < 4){ mostrarErrorLogin('Completa todos los campos (clave mínimo 4 caracteres).'); return; }
  try{
    const ref = db.collection(COL_USUARIOS).doc(usuario);
    const existente = await ref.get();
    if(existente.exists){ mostrarErrorLogin('Ese usuario ya existe.'); return; }
    const snapAdmin = await db.collection(COL_USUARIOS).where('rol','==','admin').limit(1).get();
    if(!snapAdmin.empty){ mostrarErrorLogin('Ya existe un administrador registrado.'); return; }
    const claveHash = await sha256(clave);
    await ref.set({
      usuario, nombre, clave: claveHash, rol:'admin', saldo:0, activo:true,
      creado: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await iniciarSesionComo(usuario);
  }catch(err){
    console.error(err);
    mostrarErrorLogin('Error creando la cuenta: ' + err.message);
  }
});

document.getElementById('formLogin').addEventListener('submit', async (e)=>{
  e.preventDefault();
  ocultarErrorLogin();
  await authReady;
  const usuario = document.getElementById('loginUsuario').value.trim().toLowerCase();
  const clave = document.getElementById('loginClave').value;
  const btn = document.getElementById('btnLogin');
  btn.disabled = true; btn.textContent = 'Entrando...';
  try{
    const ref = db.collection(COL_USUARIOS).doc(usuario);
    const doc = await ref.get();
    if(!doc.exists){ mostrarErrorLogin('Usuario o clave incorrectos.'); return; }
    const data = doc.data();
    if(data.activo === false){ mostrarErrorLogin('Este usuario está desactivado. Contacta al administrador.'); return; }
    const claveHash = await sha256(clave);
    if(claveHash !== data.clave){ mostrarErrorLogin('Usuario o clave incorrectos.'); return; }
    localStorage.setItem('lrd_usuario', usuario);
    await iniciarSesionComo(usuario);
  }catch(err){
    console.error(err);
    mostrarErrorLogin('Error al iniciar sesión: ' + err.message);
  }finally{
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

async function iniciarSesionComo(usuario){
  localStorage.setItem('lrd_usuario', usuario);
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  suscribirUsuarioActual(usuario);
}

document.getElementById('btnLogout').addEventListener('click', ()=>{
  localStorage.removeItem('lrd_usuario');
  LISTENERS.forEach(u=>u());
  LISTENERS = [];
  CURRENT_USER = null;
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('formLogin').reset();
});

/* Intento de sesión persistida (localStorage) al cargar la página */
window.addEventListener('DOMContentLoaded', async ()=>{
  await authReady;
  poblarSelectLoterias();
  document.getElementById('numFecha').value = hoyStr();
  const guardado = localStorage.getItem('lrd_usuario');
  if(guardado){
    const doc = await db.collection(COL_USUARIOS).doc(guardado).get();
    if(doc.exists && doc.data().activo !== false){
      await iniciarSesionComo(guardado);
      return;
    } else {
      localStorage.removeItem('lrd_usuario');
    }
  }
});

/* ======================================================================
   SUSCRIPCIÓN AL USUARIO ACTUAL (saldo/rol en tiempo real)
   ====================================================================== */
function errSnap(etiqueta){
  return (err)=>{
    console.error('Error en listener de ' + etiqueta + ':', err);
    toast('Error leyendo "' + etiqueta + '": ' + err.message, 'danger');
  };
}

function suscribirUsuarioActual(usuario){
  const unsub = db.collection(COL_USUARIOS).doc(usuario).onSnapshot(doc=>{
    if(!doc.exists){ toast('Tu usuario ya no existe.', 'danger'); document.getElementById('btnLogout').click(); return; }
    const wasNull = CURRENT_USER === null;
    CURRENT_USER = { usuario, ...doc.data() };
    renderTopbar();
    if(wasNull){ arrancarApp(); }
  }, errSnap('tu perfil de usuario'));
  LISTENERS.push(unsub);
}

function renderTopbar(){
  document.getElementById('userNombre').textContent = CURRENT_USER.nombre || CURRENT_USER.usuario;
  document.getElementById('userRolTxt').textContent = CURRENT_USER.rol === 'admin' ? 'Administrador' : 'Jugador';
  document.getElementById('userAvatar').textContent = (CURRENT_USER.nombre||CURRENT_USER.usuario).charAt(0).toUpperCase();
  document.getElementById('brandRol').textContent = CURRENT_USER.rol === 'admin' ? 'Panel administrador' : 'Panel jugador';
  if(CURRENT_USER.rol === 'vendedor'){
    document.getElementById('saldoPillTop').style.display = 'flex';
    document.getElementById('saldoPillTop').textContent = ' ' + fmtMoney(CURRENT_USER.saldo);
    document.getElementById('cajaPillTop').style.display = 'block';
  } else {
    document.getElementById('saldoPillTop').style.display = 'none';
    document.getElementById('cajaPillTop').style.display = 'none';
  }
}

/* ======================================================================
   ARRANQUE DE LA APP SEGÚN ROL
   ====================================================================== */
function arrancarApp(){
  configurarAccesoNumeros();
  suscribirCatalogoLoterias(); // catálogo dinámico de loterías (admin y vendedor)
  suscribirChatComun(); // chat grupal en tiempo real (admin y vendedor, ver js/chat.js)
  if(CURRENT_USER.rol === 'admin'){
    document.getElementById('navAdmin').style.display = 'block';
    document.getElementById('navVendedor').style.display = 'none';
    document.getElementById('bottomNavAdmin').style.display = 'flex';
    document.getElementById('bottomNavVendedor').style.display = 'none';
    cambiarVista('v-resumen');
    suscribirAdmin();
  } else {
    document.getElementById('navAdmin').style.display = 'none';
    document.getElementById('navVendedor').style.display = 'block';
    document.getElementById('bottomNavAdmin').style.display = 'none';
    document.getElementById('bottomNavVendedor').style.display = 'flex';
    cambiarVista('v-caja');
    suscribirVendedor();
  }
}

