/* ========================================================================
   STATE.JS
   Estado global en memoria: catálogo de loterías, nombres de colecciones de Firestore y las variables (VENDEDORES, JUGADAS, COBROS...) que mantienen sincronizados los listeners en tiempo real.
   ======================================================================== */

/* ======================================================================
   CATÁLOGO DINÁMICO DE LOTERÍAS
   ------------------------------------------------------------------
   Ya NO está fijo aquí en el código. Se lee en tiempo real desde la
   colección de Firestore `sistema_catalogo_loterias`, que el script
   main.py publica automáticamente al arrancar a partir de SU propio
   diccionario `loterias`. Si agregas una lotería nueva en el .py y
   reinicias el script, aparece sola aquí, sin tocar este archivo.

   Estructura de cada documento en sistema_catalogo_loterias/{nombre}:
     { nombre, horario:"HH:MM", esUnica: bool, tipos:[...], activa: bool }

   - esUnica=true  -> lotería de UN SOLO tipo de jugada (ej. LOTOMAS, KINO,
                       LOTO_POOL, LOTO_REAL): tipos = [nombre].
   - esUnica=false -> lotería con VARIOS tipos de jugada (quinielas
                       generales): tipos = ["GANAR 85% SEGURO","TRIPLETAS",
                       "PALE","QUINIELA"].
   ====================================================================== */
const COL_CATALOGO_LOTERIAS = "sistema_catalogo_loterias";
let CATALOGO_LOTERIAS = {};   // nombre -> { horario, esUnica, tipos }
let LOTERIAS = [];            // nombres de loterías activas (dinámico)
let HORARIOS_LOTERIA = {};    // nombre -> "HH:MM" (dinámico, derivado del catálogo)

/* ======================================================================
   COLECCIONES PROPIAS DE ESTA APP (independientes de las de tu app Flutter)
   ====================================================================== */
const COL_USUARIOS   = "sistema_usuarios";
const COL_JUGADAS    = "sistema_jugadas";
const COL_COBROS     = "sistema_cobros";
const COL_CAJA       = "sistema_caja";
const COL_DEPOSITOS  = "sistema_depositos";
const COL_CUENTAS    = "sistema_cuentas_bancarias";
const COL_AJUSTES    = "sistema_ajustes";
const COL_CONFIG     = "sistema_config";
const COL_NOMINA      = "sistema_nomina";
const COL_CHAT        = "sistema_chat"; // chat grupal: admin + todos los vendedores

/* ======================================================================
   ESTADO EN MEMORIA
   ====================================================================== */
let CURRENT_USER = null;     // { usuario, rol, nombre, saldo, activo }
let VENDEDORES = [];          // solo admin
let JUGADAS = [];
let COBROS = [];
let DEPOSITOS = [];
let CUENTAS_BANCARIAS = [];
let AJUSTES = [];              // historial de saldo inicial + ajustes por vendedor (solo admin)
let NOMINA = [];                // descuentos y pagos de nómina por vendedor (solo admin)
let SALDO_INICIAL_GLOBAL = 0;  // capital base que definió el admin para la función "Saldo"
// Acumulado de lo que ya se purgó (ajustes/depósitos/nómina/cobros con más
// de RETENCION_DIAS de antigüedad): guarda la SUMA de su efecto en el saldo
// de la banca antes de borrarlos, para que "Saldo" siga siendo correcto
// aunque el detalle día a día ya no esté. Se persiste en sistema_config/arrastreSaldo.
let ARRASTRE_SALDO = { asignadoVendedores:0, pagosNomina:0, cobrosConfirmados:0, depositosConfirmados:0, gananciaNetaMartingala:0 };
let CAJA_HOY = null;          // doc de sistema_caja de hoy (vendedor)
let ARQUEO_ACTUAL = null;     // desglose de movimientos del día calculado al ir a cerrar caja
let LISTENERS = [];           // unsubscribe functions
let CHAT_MENSAJES = [];       // mensajes del chat grupal (texto y notas de voz), orden ascendente

const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
function fechaStrDeTimestamp(ts){
  if(!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

